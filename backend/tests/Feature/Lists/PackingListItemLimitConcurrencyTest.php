<?php

namespace Tests\Feature\Lists;

use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Services\PackingListItemService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * D-97・C-05：持ち物の安全上限（1リスト2,000件）は、同時に追加されても超えない。
 */
class PackingListItemLimitConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    public function test_1999件のリストへ2件同時に追加しても2000件まで(): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $list = PackingList::factory()->create();
        $now = now();
        foreach (array_chunk(range(1, 1999), 500) as $numbers) {
            PackingListItem::insert(array_map(fn (int $number) => [
                'packing_list_id' => $list->id,
                'name' => '持ち物'.$number,
                'sort_order' => $number,
                'is_checked' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ], $numbers));
        }
        $listId = $list->id;
        $barrier = sys_get_temp_dir().'/mochikore-item-limit-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        for ($index = 0; $index < 2; $index++) {
            $tasks[] = static function () use ($listId, $barrier, $index) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない。回数の記録はプロセスの中だけに置く
                config(['database.connections.mysql.database' => 'mochikore_test', 'cache.default' => 'array']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The item limit test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent item limit test did not start.');
                    }
                    usleep(1000);
                }

                // 件数確認とINSERTの間を広げ、同時操作が重なる状況を実際のMySQLで作る
                DB::listen(static function (QueryExecuted $query) {
                    if (str_contains($query->sql, 'count(*)') && str_contains($query->sql, 'packing_list_items')) {
                        usleep(500000);
                    }
                });

                try {
                    $list = PackingList::findOrFail($listId);
                    // D-119：回数は足した本人で数えるので、所有者として足す
                    app(PackingListItemService::class)->add($list->user, $list, '同時に追加'.$index);

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
        $this->assertSame(['created', 'item_limit_reached'], $results);
        $this->assertSame(2000, $list->items()->count());
    }
}
