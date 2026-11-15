<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Services\GroupCheckService;
use App\Services\PackingListItemService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class EmptyGroupCheckConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public static function operationOrder(): array
    {
        return [[true], [false]];
    }

    #[DataProvider('operationOrder')]
    public function test_チェックと移動のどちらが先でも持ち物が入ったグループに空の記録が残らない(bool $checkFirst): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $list = PackingList::factory()->create();
        $group = PackingListGroup::factory()->for($list)->create();
        $item = PackingListItem::factory()->for($list)->create();
        $listId = $list->id;
        $groupId = $group->id;
        $itemId = $item->id;
        $barrier = sys_get_temp_dir().'/mochikore-group-check-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];
        foreach ([0, 1] as $index) {
            $tasks[] = static function () use ($checkFirst, $index, $barrier, $listId, $groupId, $itemId) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The group check test requires mochikore_test.');
                }
                // 先行処理が親をロックしてから後続を開始し、実際に競合させる。
                if ($index === 0) {
                    DB::listen(static function (QueryExecuted $query) use ($barrier) {
                        if (str_contains(strtolower($query->sql), 'for update') && str_contains($query->sql, 'packing_lists')) {
                            file_put_contents($barrier.'/locked', 'ready');
                            usleep(350000);
                        }
                    });
                } else {
                    $deadline = microtime(true) + 8;
                    while (! file_exists($barrier.'/locked')) {
                        if (microtime(true) > $deadline) {
                            throw new \RuntimeException('The group lock test did not start.');
                        }
                        usleep(1000);
                    }
                }
                $check = $index === 0 ? $checkFirst : ! $checkFirst;
                try {
                    if ($check) {
                        app(GroupCheckService::class)->setCheck(PackingListGroup::findOrFail($groupId), true);
                    } else {
                        app(PackingListItemService::class)->reorder(PackingList::findOrFail($listId), [$itemId], ['item_id' => $itemId, 'group_id' => $groupId]);
                    }

                    return $check ? 'checked' : 'moved';
                } catch (ValidationException $error) {
                    return $error->errors()['is_checked'][0] ?? 'unexpected';
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
        $this->assertSame($checkFirst ? ['checked', 'moved'] : ['moved', 'グループに持ち物があります。リストを読み直してください。'], $results);
        $this->assertSame($groupId, $item->fresh()->group_id);
        $this->assertFalse($group->fresh()->is_checked);
    }
}
