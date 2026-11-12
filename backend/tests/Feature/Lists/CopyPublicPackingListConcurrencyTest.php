<?php

namespace Tests\Feature\Lists;

use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\PackingListService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CopyPublicPackingListConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    public function test_99件から2件同時にコピーしても100件まで(): void
    {
        $this->assertConcurrentLimit(false);
    }

    public function test_コピーと通常の新規作成を同時に行っても100件まで(): void
    {
        $this->assertConcurrentLimit(true);
    }

    private function assertConcurrentLimit(bool $create): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingListGroup::factory()->for($source)->create();
        PackingListItem::factory()->for($source)->create();
        PackingList::factory()->count(99)->for($user)->create();
        $sourceId = $source->id;
        $userId = $user->id;
        $categoryId = $source->category_id;
        $barrier = sys_get_temp_dir().'/mochikore-copy-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        for ($index = 0; $index < 2; $index++) {
            $tasks[] = static function () use ($sourceId, $userId, $categoryId, $barrier, $index, $create) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The copy test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent copy test did not start.');
                    }
                    usleep(1000);
                }

                // C-05：件数確認とINSERTの間を広げ、同時操作が重なる状況を実際のMySQLで作る
                DB::listen(static function (QueryExecuted $query) {
                    if (str_contains($query->sql, 'count(*)') && str_contains($query->sql, 'packing_lists')) {
                        usleep(500000);
                    }
                });

                try {
                    $service = app(PackingListService::class);
                    $user = User::findOrFail($userId);
                    if ($create && $index === 1) {
                        $service->create($user, ['title' => '同時に作るリスト', 'category_id' => $categoryId]);
                    } else {
                        $service->copyPublic($user, PackingList::findOrFail($sourceId));
                    }

                    return 'created';
                } catch (ApiException $error) {
                    return $error->errorCode->value;
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
        $this->assertSame(['created', 'list_limit_reached'], $results);
        $this->assertSame(100, $user->packingLists()->count());
        $this->assertDatabaseCount('packing_lists', 101);
    }
}
