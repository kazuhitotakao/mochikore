<?php

namespace Tests\Feature\Lists;

use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\CollaborationService;
use App\Services\PackingListService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * 共同編集の人数の上限と、公開と両立しない条件を、同時の操作でも守る（F-34、D-119、C-05）。
 */
class CollaborationConcurrencyTest extends TestCase
{
    // 別プロセスから同じデータを読むため、未コミットのテスト用トランザクションを使わない
    use DatabaseMigrations;

    public function test_9人のリストに2人が同時に参加しても10人まで(): void
    {
        $list = $this->createList();
        // 所有者を入れて9人
        User::factory()->count(8)->create()->each(fn (User $user) => $list->members()->create(['user_id' => $user->id]));
        $token = $this->createInvite($list);
        $joinerIds = User::factory()->count(2)->create(['display_name' => 'さんかしゃ'])->pluck('id')->all();

        // 子プロセスへ渡せるよう、処理は1つずつ作る（入れ子の無名関数は渡せない）
        $actions = [];
        foreach ($joinerIds as $userId) {
            $actions[] = static function () use ($userId, $token) {
                app(CollaborationService::class)->join(User::findOrFail($userId), $token, null);

                return 'joined';
            };
        }

        // 人数の確認と参加の間を広げ、同時の参加が重なる状況を実際のMySQLで作る
        $results = $this->runTogether($actions, 'packing_list_members');

        $this->assertSame(['joined', 'member_limit_reached'], $results);
        $this->assertSame(9, $list->members()->count());
    }

    public function test_公開と招待リンクの作成を同時に行っても、公開中の共同編集にはならない(): void
    {
        $list = $this->createList();
        PackingListItem::factory()->for($list)->create();
        $listId = $list->id;
        $ownerId = $list->user_id;

        $results = $this->runTogether([
            static function () use ($listId) {
                app(PackingListService::class)->updateVisibility(PackingList::findOrFail($listId), true);

                return 'published';
            },
            static function () use ($listId, $ownerId) {
                app(CollaborationService::class)->createInviteLink(User::findOrFail($ownerId), PackingList::findOrFail($listId), null);

                return 'invited';
            },
        ], 'packing_lists');

        // どちらが先でも、後の操作は断る
        $list->refresh();
        if ($list->is_public) {
            $this->assertSame(['list_not_private', 'published'], $results);
            $this->assertNull($list->invite_token);
        } else {
            $this->assertSame(['invited', 'list_collaborative'], $results);
            $this->assertNotNull($list->invite_token);
        }
    }

    private function createList(): PackingList
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);

        return PackingList::factory()->for(User::factory()->create(['display_name' => 'しょゆうしゃ']))->create();
    }

    private function createInvite(PackingList $list): string
    {
        return app(CollaborationService::class)->createInviteLink($list->user, $list, null)->invite_token;
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
        $barrier = sys_get_temp_dir().'/mochikore-collab-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];

        foreach ($actions as $index => $action) {
            $tasks[] = static function () use ($action, $barrier, $index, $slowTable) {
                // 子プロセスにもテスト用DBを明示し、開発用DBへは書き込まない
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The collaboration test requires mochikore_test.');
                }

                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent collaboration test did not start.');
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
