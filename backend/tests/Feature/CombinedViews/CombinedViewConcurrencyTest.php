<?php

namespace Tests\Feature\CombinedViews;

use App\Exceptions\ApiException;
use App\Models\CombinedView;
use App\Models\PackingList;
use App\Models\User;
use App\Services\CombinedViewService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * まとめ表示の1人10件の上限を、同時の作成でも守る（F-37、D-124、C-05）。
 */
class CombinedViewConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    public function test_9件の人が同時に2件作っても10件まで(): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create();
        $listIds = PackingList::factory()->for($user)->count(2)->create()->pluck('id')->all();
        foreach (range(1, CombinedView::MAX_PER_USER - 1) as $number) {
            $view = $user->combinedViews()->create(['name' => "まとめ{$number}"]);
            $view->lists()->attach([$listIds[0] => ['sort_order' => 0], $listIds[1] => ['sort_order' => 1]]);
        }
        $userId = $user->id;

        // 子プロセスへ渡せるよう、処理は1つずつ作る（入れ子の無名関数は渡せない）
        $actions = [];
        foreach ([1, 2] as $number) {
            $actions[] = static function () use ($userId, $listIds, $number) {
                app(CombinedViewService::class)->create(User::findOrFail($userId), "同時{$number}", $listIds);

                return 'created';
            };
        }

        // 件数の確認と作成の間を広げ、同時の作成が重なる状況を作る
        $results = $this->runTogether($actions, 'combined_views');

        $this->assertSame(['combined_view_limit_reached', 'created'], $results);
        $this->assertSame(CombinedView::MAX_PER_USER, $user->combinedViews()->count());
    }

    /**
     * 2つの処理を別プロセスで同時に始め、結果（成功の印かエラーコード）を並べて返す。
     *
     * @param  list<\Closure(): string>  $actions
     * @param  string  $slowTable  このテーブルを読む問い合わせの後で待ち、処理が重なるようにする
     * @return list<string>
     */
    private function runTogether(array $actions, string $slowTable): array
    {
        $barrier = sys_get_temp_dir().'/mochikore-combined-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        foreach ($actions as $index => $action) {
            $tasks[] = static function () use ($action, $barrier, $index, $slowTable) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The combined view test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent combined view test did not start.');
                    }
                    usleep(1000);
                }

                DB::listen(static function (QueryExecuted $query) use ($slowTable) {
                    if (str_starts_with($query->sql, 'select') && str_contains($query->sql, $slowTable)) {
                        usleep(300000);
                    }
                });

                try {
                    return $action();
                } catch (ApiException $error) {
                    return $error->errorCode->value;
                }
            };
        }

        try {
            $results = Concurrency::driver('process')->run($tasks, 20);
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
