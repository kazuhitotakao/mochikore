<?php

namespace Tests\Feature\Realtime;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\ListChangeNotifier;
use Illuminate\Broadcasting\Broadcasters\Broadcaster;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Support\Facades\Broadcast;
use RuntimeException;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * 共同編集のリストを変えたときの「変わった」の配信（F-35、D-119）。
 * 配信する中身は合図だけで、操作した本人の画面は配信先から外す。
 */
class NotifyListChangeTest extends ListApiTestCase
{
    private const SOCKET_ID = '1234.5678';

    private User $owner;

    private User $member;

    private PackingList $list;

    /** @var list<array{int, string|null}> 配信した [リストID, 操作した人の接続の番号] */
    private array $notified = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['display_name' => 'おかあさん']);
        $this->member = User::factory()->create(['display_name' => 'たろう']);
        $this->list = PackingList::factory()->for($this->owner)->create(['title' => '週末の買い物']);
        $this->list->members()->create(['user_id' => $this->member->id]);
    }

    /**
     * 配信の呼び出しを記録するだけの通知に差し替える。
     */
    private function recordNotifications(): void
    {
        $this->notified = [];
        $this->app->instance(ListChangeNotifier::class, new class($this->notified) extends ListChangeNotifier
        {
            /**
             * @param  list<array{int, string|null}>  $notified
             */
            public function __construct(private array &$notified) {}

            public function notify(int $listId, ?string $socketId = null): void
            {
                $this->notified[] = [$listId, $socketId];
            }
        });
    }

    protected function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return parent::actingAsUser($user)->withHeader('X-Socket-ID', self::SOCKET_ID);
    }

    public function test_メンバーがいるリストの中身を変えると、操作した人の接続を添えて配信する(): void
    {
        $group = PackingListGroup::factory()->for($this->list)->create(['name' => '冷蔵', 'sort_order' => 0]);
        $item = PackingListItem::factory()->for($this->list)->create(['name' => '卵', 'sort_order' => 1]);
        $id = $this->list->id;
        $this->actingAsUser($this->member);

        $calls = [
            fn () => $this->postJson("/api/lists/{$id}/items", ['name' => '牛乳'])->assertCreated(),
            // チェックだけでも配信する（一覧の順番は変えないが、ほかの人の画面には出す）
            fn () => $this->patchJson("/api/items/{$item->id}", ['is_checked' => true])->assertOk(),
            fn () => $this->patchJson("/api/lists/{$id}/items/checks", ['item_ids' => [$item->id], 'is_checked' => false])->assertNoContent(),
            fn () => $this->patchJson("/api/groups/{$group->id}", ['name' => '冷蔵庫'])->assertOk(),
            fn () => $this->patchJson("/api/groups/{$group->id}/check", ['is_checked' => true])->assertNoContent(),
            fn () => $this->postJson("/api/lists/{$id}/reset-checks")->assertNoContent(),
            fn () => $this->deleteJson("/api/items/{$item->id}")->assertOk(),
            fn () => $this->postJson("/api/items/{$item->id}/restore")->assertOk(),
        ];
        foreach ($calls as $call) {
            $this->recordNotifications();
            $call();
            $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);
        }
    }

    public function test_読むだけ・失敗した操作・メンバーがいないリストでは配信しない(): void
    {
        $id = $this->list->id;
        $own = PackingList::factory()->for($this->member)->create();
        $this->recordNotifications();
        $this->actingAsUser($this->member);

        $this->getJson("/api/lists/{$id}")->assertOk();
        $this->getJson("/api/lists/{$id}/grouping")->assertOk();
        $this->getJson("/api/lists/{$id}/members")->assertOk();
        $this->postJson("/api/lists/{$id}/items", ['name' => ''])->assertUnprocessable();
        // メンバーには許していない操作（404）
        $this->patchJson("/api/lists/{$id}", ['title' => '書き換え'])->assertNotFound();
        // メンバーがいない自分のリスト
        $this->postJson("/api/lists/{$own->id}/items", ['name' => '牛乳'])->assertCreated();
        // 複製は元のリストを変えない
        $this->postJson("/api/lists/{$id}/duplicate", ['title' => '自分用'])->assertCreated();

        $this->assertSame([], $this->notified);
    }

    public function test_リストの名前の変更・削除・メンバーが外れる・参加するときも配信する(): void
    {
        $id = $this->list->id;
        $third = User::factory()->create(['display_name' => 'さんにんめ']);
        $token = $this->actingAsUser($this->owner)->postJson("/api/lists/{$id}/invite-link")->json('data.invite_token');

        $this->recordNotifications();
        $this->patchJson("/api/lists/{$id}", ['title' => '日曜の買い物'])->assertOk();
        $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);

        // 参加：開いている人の画面で、人数をすぐ変える
        $this->recordNotifications();
        $this->actingAsUser($third)->postJson("/api/invites/{$token}/join")->assertOk();
        $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);

        // 自分で抜ける
        $this->recordNotifications();
        $this->deleteJson("/api/lists/{$id}/membership")->assertNoContent();
        $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);

        // 最後のメンバーを外す：外した後はメンバーがいなくなるが、外された人の画面へ知らせる
        $row = $this->list->members()->firstOrFail();
        $this->recordNotifications();
        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$id}/members/{$row->id}")->assertNoContent();
        $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);

        // リストの削除：メンバーの画面を「ページが見つかりません」にできるよう、消す前の相手へ知らせる
        $this->list->members()->create(['user_id' => $this->member->id]);
        $this->recordNotifications();
        $this->deleteJson("/api/lists/{$id}")->assertNoContent();
        $this->assertSame([[$id, self::SOCKET_ID]], $this->notified);
    }

    public function test_持ち物を参加しているリストへ移すと、入れた先のリストにも配信する(): void
    {
        $own = PackingList::factory()->for($this->member)->create();
        $item = PackingListItem::factory()->for($own)->create(['name' => '卵']);
        $this->recordNotifications();

        $this->actingAsUser($this->member)->postJson("/api/lists/{$own->id}/items/move", [
            'item_ids' => [$item->id],
            'destination_list_id' => $this->list->id,
        ])->assertOk();

        // 元の自分のリストにはメンバーがいないので、入れた先だけ
        $this->assertSame([[$this->list->id, self::SOCKET_ID]], $this->notified);
    }

    public function test_配信は合図だけを送り、操作した人の接続の番号が正しいときだけ外す(): void
    {
        $sent = [];
        $this->useBroadcaster(function (array $channels, string $event, array $payload) use (&$sent): void {
            $sent[] = [array_map('strval', $channels), $event, $payload];
        });
        $notifier = new ListChangeNotifier;

        $notifier->notify(5, self::SOCKET_ID);
        $notifier->notify(5);
        // 形の違う番号は Reverb へ渡さない（配信そのものは行う）
        $notifier->notify(5, 'abc; DROP');

        $this->assertSame([
            [['private-lists.5'], 'changed', ['socket' => self::SOCKET_ID]],
            [['private-lists.5'], 'changed', []],
            [['private-lists.5'], 'changed', []],
        ], $sent);
    }

    public function test_配信に失敗しても保存は成功のまま、失敗を記録する(): void
    {
        $this->useBroadcaster(fn () => throw new RuntimeException('Reverb is down.'));
        $reported = [];
        $this->app->make(ExceptionHandler::class)->reportable(function (RuntimeException $e) use (&$reported): bool {
            $reported[] = $e->getMessage();

            return false;
        });

        $this->actingAsUser($this->member)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '牛乳'])
            ->assertCreated();

        $this->assertDatabaseHas('packing_list_items', ['packing_list_id' => $this->list->id, 'name' => '牛乳']);
        $this->assertSame(['Reverb is down.'], $reported);
    }

    /**
     * 配信先を、渡した処理を呼ぶだけのものに差し替える。
     *
     * @param  callable(array<int, mixed>, string, array<string, mixed>): void  $onBroadcast
     */
    private function useBroadcaster(callable $onBroadcast): void
    {
        Broadcast::extend('recording', fn () => new class($onBroadcast) extends Broadcaster
        {
            /** @var callable */
            private $onBroadcast;

            public function __construct(callable $onBroadcast)
            {
                $this->onBroadcast = $onBroadcast;
            }

            public function auth($request)
            {
                return null;
            }

            public function validAuthenticationResponse($request, $result)
            {
                return null;
            }

            public function broadcast(array $channels, $event, array $payload = [])
            {
                ($this->onBroadcast)($this->formatChannels($channels), $event, $payload);
            }
        });
        config(['broadcasting.default' => 'recording', 'broadcasting.connections.recording' => ['driver' => 'recording']]);
        Broadcast::forgetDrivers();
    }
}
