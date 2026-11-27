<?php

namespace Tests\Feature\SavedItems;

use App\Exceptions\ApiException;
use App\Models\Category;
use App\Models\SavedItem;
use App\Models\User;
use App\Services\SavedItemService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * API-32：よく使う項目の上限（1人200件）と同名の扱いを、同時の保存でも守る（F-21、V-11・C-05、D-72）。
 */
class StoreSavedItemConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    private User $user;

    private int $categoryId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $this->user = User::factory()->create();
        $this->categoryId = Category::where('name', '買い物')->value('id');
        $now = now();
        SavedItem::insert(array_map(fn (int $number) => [
            'user_id' => $this->user->id,
            'category_id' => $this->categoryId,
            'name' => '候補'.$number,
            'created_at' => $now,
            'updated_at' => $now,
        ], range(1, 199)));
    }

    public function test_199件の人が別の名前を2件同時に保存しても200件まで(): void
    {
        $results = $this->saveTogether(['卵', '牛乳']);

        $this->assertSame(['created', 'saved_item_limit_reached'], array_column($results, 0));
        $this->assertSame(200, $this->user->savedItems()->count());
    }

    public function test_同じ名前を2件同時に保存しても1件だけ増え、もう一方は既存の候補を返す(): void
    {
        $results = $this->saveTogether(['牛乳', '牛乳']);

        // 一意制約の違反を500にせず、作った側と同じ候補を返す
        $this->assertSame(['created', 'existing'], array_column($results, 0));
        $this->assertSame($results[0][1], $results[1][1]);
        $this->assertSame(200, $this->user->savedItems()->count());
        $this->assertSame(1, $this->user->savedItems()->where('name', '牛乳')->count());
    }

    /**
     * 2件の保存を別プロセスで同時に始め、結果（作った・既存を返した・エラーコード）と候補のIDを並べて返す。
     *
     * @param  array{string, string}  $names
     * @return list<array{string, int|null}>
     */
    private function saveTogether(array $names): array
    {
        $userId = $this->user->id;
        $categoryId = $this->categoryId;
        $barrier = sys_get_temp_dir().'/mochikore-saved-item-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        foreach ($names as $index => $name) {
            $tasks[] = static function () use ($userId, $categoryId, $name, $barrier, $index) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The saved item test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent saved item test did not start.');
                    }
                    usleep(1000);
                }

                // 件数確認とINSERTの間を広げ、同時の保存が重なる状況を実際のMySQLで作る
                DB::listen(static function (QueryExecuted $query) {
                    if (str_contains($query->sql, 'count(*)') && str_contains($query->sql, 'saved_items')) {
                        usleep(500000);
                    }
                });

                try {
                    $savedItem = app(SavedItemService::class)->save(User::findOrFail($userId), $name, $categoryId);

                    return [$savedItem->wasRecentlyCreated ? 'created' : 'existing', $savedItem->id];
                } catch (ApiException $error) {
                    return [$error->errorCode->value, null];
                }
            };
        }

        try {
            $results = Concurrency::driver('process')->run($tasks, 15);
        } finally {
            foreach (glob($barrier.'/*') as $file) {
                unlink($file);
            }
            rmdir($barrier);
        }

        sort($results);

        return $results;
    }
}
