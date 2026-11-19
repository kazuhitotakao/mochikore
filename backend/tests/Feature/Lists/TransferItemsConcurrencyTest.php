<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\ItemTransferService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * API-52・D-118：2つのリストの間で逆向きの移動が同時に来ても、IDの順にロックするので互いに待ち続けない。
 */
class TransferItemsConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    public function test_逆向きの移動を同時に行っても両方とも移せる(): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create();
        $first = PackingList::factory()->for($user)->create();
        $second = PackingList::factory()->for($user)->create();
        $fromFirst = PackingListItem::factory()->for($first)->create(['name' => '一つ目から']);
        $fromSecond = PackingListItem::factory()->for($second)->create(['name' => '二つ目から']);
        $moves = [
            [$first->id, $fromFirst->id, $second->id],
            [$second->id, $fromSecond->id, $first->id],
        ];
        $userId = $user->id;
        $barrier = sys_get_temp_dir().'/mochikore-transfer-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        foreach ($moves as $index => [$sourceId, $itemId, $targetId]) {
            $tasks[] = static function () use ($userId, $sourceId, $itemId, $targetId, $barrier, $index) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The transfer test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent transfer test did not start.');
                    }
                    usleep(1000);
                }

                // ロックした直後の間を広げ、2つの処理が重なる状況を実際のMySQLで作る
                DB::listen(static function (QueryExecuted $query) {
                    if (str_contains($query->sql, 'for update') && str_contains($query->sql, 'packing_lists')) {
                        usleep(300000);
                    }
                });

                app(ItemTransferService::class)->move(
                    User::findOrFail($userId),
                    PackingList::findOrFail($sourceId),
                    [$itemId],
                    $targetId,
                    null,
                    null,
                );

                return 'moved';
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

        $this->assertSame(['moved', 'moved'], $results);
        $this->assertSame($second->id, $fromFirst->fresh()->packing_list_id);
        $this->assertSame($first->id, $fromSecond->fresh()->packing_list_id);
    }
}
