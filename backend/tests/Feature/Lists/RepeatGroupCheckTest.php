<?php

namespace Tests\Feature\Lists;

use App\Enums\GroupCheckMode;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;

/**
 * D-122 繰り返し利用のグループ：チェックを付けた日時（前回の日付）を覚え、日付が変わる（日本時間の0時）とチェックを外す。
 * 定期処理は使わず、リストを読むとき（API-07・29）と、所属・設定を変える前に外す。
 */
class RepeatGroupCheckTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private PackingListGroup $repeat;

    private PackingListGroup $normal;

    /** 繰り返し利用のグループの持ち物 */
    private PackingListItem $milk;

    private PackingListItem $egg;

    /** 通常のグループの持ち物 */
    private PackingListItem $miso;

    /** グループに入っていない持ち物 */
    private PackingListItem $tissue;

    protected function setUp(): void
    {
        parent::setUp();

        $this->at('2026-11-20 09:00:00');
        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create(['grouping_revision' => 3]);
        $this->repeat = PackingListGroup::factory()->for($this->list)->create([
            'name' => 'いつもの買い物', 'sort_order' => 0, 'check_mode' => GroupCheckMode::Repeat,
        ]);
        $this->normal = PackingListGroup::factory()->for($this->list)->create(['name' => 'その他の買い物', 'sort_order' => 1]);
        $this->milk = $this->item('牛乳', 1, $this->repeat);
        $this->egg = $this->item('卵', 2, $this->repeat);
        $this->miso = $this->item('味噌', 3, $this->normal);
        $this->tissue = $this->item('ティッシュ', 4, null);
    }

    private function item(string $name, int $sortOrder, ?PackingListGroup $group): PackingListItem
    {
        return PackingListItem::factory()->for($this->list)->create([
            'name' => $name, 'sort_order' => $sortOrder, 'group_id' => $group?->id,
        ]);
    }

    /**
     * 時刻を日本時間で止める。
     */
    private function at(string $time): Carbon
    {
        $moment = Carbon::parse($time);
        $this->travelTo($moment);

        return $moment;
    }

    private function check(PackingListItem $item, bool $checked = true): TestResponse
    {
        return $this->actingAsUser($this->user)->patchJson("/api/items/{$item->id}", ['is_checked' => $checked]);
    }

    /**
     * @param  list<PackingListItem>  $items
     */
    private function bulkCheck(array $items, bool $checked): TestResponse
    {
        return $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}/items/checks", [
            'item_ids' => array_map(fn (PackingListItem $item) => $item->id, $items),
            'is_checked' => $checked,
        ]);
    }

    /**
     * API-07 を読み、持ち物の名前 → 持ち物 にして返す。
     *
     * @return array<string, array<string, mixed>>
     */
    private function showItems(): array
    {
        return collect($this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk()->json('data.items'))
            ->keyBy('name')->all();
    }

    public function test_チェックを付けた日時を覚え、設定と前回の日付を返す(): void
    {
        $listUpdatedAt = $this->list->fresh()->updated_at;
        $checkedAt = $this->at('2026-11-25 10:00:00');

        $this->check($this->milk)->assertOk()
            ->assertJsonPath('data.is_checked', true)
            ->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());

        $response = $this->getJson("/api/lists/{$this->list->id}")->assertOk()
            ->assertJsonPath('data.groups.0.check_mode', 'repeat')
            ->assertJsonPath('data.groups.1.check_mode', 'normal');
        $items = collect($response->json('data.items'))->keyBy('name');
        $this->assertTrue($items['牛乳']['is_checked']);
        $this->assertSame($checkedAt->toJSON(), $items['牛乳']['last_checked_at']);
        $this->assertNull($items['卵']['last_checked_at']);

        // D-25：チェックだけなので、revision も親リストの更新日時も変えない
        $list = $this->list->fresh();
        $this->assertSame(3, $list->grouping_revision);
        $this->assertTrue($list->updated_at->equalTo($listUpdatedAt));
    }

    public function test_どのグループの持ち物でも日時を覚える(): void
    {
        $checkedAt = $this->at('2026-11-25 10:00:00');

        $this->check($this->miso)->assertOk()->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());
        $this->check($this->tissue)->assertOk()->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());
    }

    public function test_日付が変わると、繰り返し利用のチェックだけが外れ、前回の日付は残る(): void
    {
        $checkedAt = $this->at('2026-11-25 23:59:00');
        $this->check($this->milk)->assertOk();
        $this->check($this->miso)->assertOk();
        $this->check($this->tissue)->assertOk();
        $listUpdatedAt = $this->list->fresh()->updated_at;

        // 日本時間の0時ちょうどから、前の日のチェックは外れる
        $this->at('2026-11-26 00:00:00');
        $items = $this->showItems();

        $this->assertFalse($items['牛乳']['is_checked']);
        $this->assertSame($checkedAt->toJSON(), $items['牛乳']['last_checked_at']);
        // 通常のグループ・グループに入っていない持ち物は、今までどおりチェック済みのまま
        $this->assertTrue($items['味噌']['is_checked']);
        $this->assertTrue($items['ティッシュ']['is_checked']);

        // 読んだときに保存もする。チェックだけなので、revision も親リストの更新日時も変えない（D-25）
        $this->assertFalse($this->milk->fresh()->is_checked);
        $list = $this->list->fresh();
        $this->assertSame(3, $list->grouping_revision);
        $this->assertTrue($list->updated_at->equalTo($listUpdatedAt));
    }

    public function test_同じ日のうちは、チェックは外れない(): void
    {
        $this->at('2026-11-25 00:00:00');
        $this->check($this->milk)->assertOk();

        $this->at('2026-11-25 23:59:59');

        $this->assertTrue($this->showItems()['牛乳']['is_checked']);
        $this->assertTrue($this->milk->fresh()->is_checked);
    }

    public function test_日時のない古いチェックは、繰り返し利用では外れる(): void
    {
        // この機能より前に付けたチェック（日時を覚えていない）
        $this->milk->forceFill(['is_checked' => true])->save();

        $this->at('2026-11-25 10:00:00');
        $items = $this->showItems();

        $this->assertFalse($items['牛乳']['is_checked']);
        $this->assertNull($items['牛乳']['last_checked_at']);
    }

    public function test_グループ整理の読み込みでも、日付が変わったチェックは外れる(): void
    {
        $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();
        $this->check($this->miso)->assertOk();

        $this->at('2026-11-26 08:00:00');
        $items = collect($this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}/grouping")->assertOk()
            ->assertJsonPath('data.groups.0.check_mode', 'repeat')
            ->json('data.items'))->keyBy('name');

        $this->assertFalse($items['牛乳']['is_checked']);
        $this->assertTrue($items['味噌']['is_checked']);
        $this->assertFalse($this->milk->fresh()->is_checked);
    }

    public function test_付けたその日のうちに外すと、付ける前の日付に戻る(): void
    {
        // 初めてのチェックをすぐ外すと、まだチェックしていない状態に戻る
        $this->at('2026-11-23 09:00:00');
        $this->check($this->egg)->assertOk();
        $this->check($this->egg, false)->assertOk()->assertJsonPath('data.last_checked_at', null);

        $before = $this->at('2026-11-23 09:30:00');
        $this->check($this->milk)->assertOk();

        // 2日後に付けて、押し間違いとして外す
        $this->at('2026-11-25 10:00:00');
        $this->showItems();
        $this->check($this->milk)->assertOk()->assertJsonPath('data.last_checked_at', now()->toJSON());
        $this->check($this->milk, false)->assertOk()
            ->assertJsonPath('data.is_checked', false)
            ->assertJsonPath('data.last_checked_at', $before->toJSON());

        // もう一度付けて外しても、同じ日付に戻る
        $this->check($this->milk)->assertOk();
        $this->check($this->milk, false)->assertOk()->assertJsonPath('data.last_checked_at', $before->toJSON());
    }

    public function test_翌日以降に外したときは、前回の日付を残す(): void
    {
        $checkedAt = $this->at('2026-11-23 09:00:00');
        $this->check($this->miso)->assertOk();

        $this->at('2026-11-25 10:00:00');

        $this->check($this->miso, false)->assertOk()
            ->assertJsonPath('data.is_checked', false)
            ->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());
    }

    public function test_同じ状態の送り直しや名前の変更では、日時を変えない(): void
    {
        $checkedAt = $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();

        $this->at('2026-11-25 11:00:00');
        $this->check($this->milk)->assertOk()->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());
        $this->actingAsUser($this->user)->patchJson("/api/items/{$this->milk->id}", ['name' => '低脂肪乳'])
            ->assertOk()
            ->assertJsonPath('data.is_checked', true)
            ->assertJsonPath('data.last_checked_at', $checkedAt->toJSON());

        // 外した状態の送り直しでも、付ける前の日付をもう一度さかのぼらない
        $this->check($this->milk, false)->assertOk()->assertJsonPath('data.last_checked_at', null);
        $this->check($this->milk, false)->assertOk()->assertJsonPath('data.last_checked_at', null);
    }

    public function test_まとめてチェックでも日時を覚え、外すと今日付けた分だけ前の日付に戻る(): void
    {
        $before = $this->at('2026-11-23 09:00:00');
        $this->check($this->egg)->assertOk();

        $this->at('2026-11-25 10:00:00');
        $this->showItems();
        $first = now();
        $this->check($this->milk)->assertOk();

        // すでにチェック済みの持ち物（牛乳）は日時を進めず、変わる持ち物（卵）だけ今の日時にする
        $second = $this->at('2026-11-25 11:00:00');
        $this->bulkCheck([$this->milk, $this->egg], true)->assertOk()
            ->assertJsonPath('data.0.name', '牛乳')
            ->assertJsonPath('data.0.last_checked_at', $first->toJSON())
            ->assertJsonPath('data.1.name', '卵')
            ->assertJsonPath('data.1.is_checked', true)
            ->assertJsonPath('data.1.last_checked_at', $second->toJSON());

        // 今日付けたチェックをまとめて外すと、それぞれ付ける前の日付に戻る
        $this->bulkCheck([$this->milk, $this->egg], false)->assertOk()
            ->assertJsonPath('data.0.is_checked', false)
            ->assertJsonPath('data.0.last_checked_at', null)
            ->assertJsonPath('data.1.is_checked', false)
            ->assertJsonPath('data.1.last_checked_at', $before->toJSON());
    }

    public function test_まとめて外すとき、前の日に付けたチェックは日付を残す(): void
    {
        $checkedAt = $this->at('2026-11-23 09:00:00');
        $this->check($this->miso)->assertOk();

        $this->at('2026-11-25 10:00:00');

        $this->bulkCheck([$this->miso], false)->assertOk()
            ->assertJsonPath('data.0.is_checked', false)
            ->assertJsonPath('data.0.last_checked_at', $checkedAt->toJSON());
    }

    public function test_チェックを全部外しても、前回の日付は残る(): void
    {
        $checkedAt = $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();
        $this->check($this->miso)->assertOk();

        $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/reset-checks")->assertNoContent();

        $items = $this->showItems();
        foreach (['牛乳', '味噌'] as $name) {
            $this->assertFalse($items[$name]['is_checked']);
            $this->assertSame($checkedAt->toJSON(), $items[$name]['last_checked_at']);
        }
    }

    public function test_並べ替えで通常のグループへ移すとき、期限の切れたチェックを持ち出さない(): void
    {
        $checkedAt = $this->at('2026-11-24 10:00:00');
        $this->check($this->milk)->assertOk();

        // 日付が変わった後、読み直さずに（開いたままの画面から）グループの外へ移す
        $this->at('2026-11-25 10:00:00');
        $this->check($this->egg)->assertOk();
        $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}/items/order", [
            'item_ids' => [$this->egg->id, $this->miso->id, $this->tissue->id, $this->milk->id],
            'move' => ['item_id' => $this->milk->id, 'group_id' => null],
        ])->assertNoContent();

        $milk = $this->milk->fresh();
        $this->assertNull($milk->group_id);
        $this->assertFalse($milk->is_checked);
        $this->assertTrue($milk->last_checked_at->equalTo($checkedAt));
        // 今日付けたチェックはそのまま
        $this->assertTrue($this->egg->fresh()->is_checked);
    }

    public function test_グループを消すとき、残る持ち物の期限の切れたチェックを外す(): void
    {
        $this->at('2026-11-24 10:00:00');
        $this->check($this->milk)->assertOk();
        $this->check($this->egg)->assertOk();
        // 卵は削除済み。グループが消えた後に戻すと、グループの外（通常）へ戻る
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$this->egg->id}")->assertOk();

        $this->at('2026-11-25 10:00:00');
        // 画面で見えていなかった持ち物（牛乳）はグループと一緒には消さず、グループの外へ移る（D-100）
        $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/items/bulk-delete", [
            'item_ids' => [], 'group_ids' => [$this->repeat->id],
        ])->assertOk();
        $this->actingAsUser($this->user)->postJson("/api/items/{$this->egg->id}/restore")->assertOk()
            ->assertJsonPath('data.group_id', null)
            ->assertJsonPath('data.is_checked', false);

        $milk = $this->milk->fresh();
        $this->assertNull($milk->group_id);
        $this->assertFalse($milk->is_checked);
    }

    public function test_重ねてグループにするとき、期限の切れたチェックを持ち出さない(): void
    {
        $this->at('2026-11-24 10:00:00');
        $this->check($this->milk)->assertOk();

        $this->at('2026-11-25 10:00:00');
        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$this->tissue->id}/group", ['item_id' => $this->milk->id])
            ->assertCreated()
            ->assertJsonPath('data.group.check_mode', 'normal')
            ->assertJsonPath('data.item.is_checked', false);
    }

    public function test_別のリストへ移動するとき、期限の切れたチェックを外し、今日のチェックと日付は保つ(): void
    {
        $destination = PackingList::factory()->for($this->user)->create();
        $old = $this->at('2026-11-24 10:00:00');
        $this->check($this->milk)->assertOk();

        $today = $this->at('2026-11-25 10:00:00');
        $this->check($this->egg)->assertOk();
        $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/items/move", [
            'item_ids' => [$this->milk->id, $this->egg->id],
            'destination_list_id' => $destination->id,
        ])->assertOk();

        $milk = $this->milk->fresh();
        $egg = $this->egg->fresh();
        $this->assertSame($destination->id, $milk->packing_list_id);
        $this->assertFalse($milk->is_checked);
        $this->assertTrue($milk->last_checked_at->equalTo($old));
        // D-118：移動はチェックを保つ
        $this->assertTrue($egg->is_checked);
        $this->assertTrue($egg->last_checked_at->equalTo($today));
    }

    public function test_別のリストへコピーした持ち物には、日付を写さない(): void
    {
        $destination = PackingList::factory()->for($this->user)->create();
        $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();

        $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/items/copy", [
            'item_ids' => [$this->milk->id],
            'destination_list_id' => $destination->id,
        ])->assertCreated();

        $copy = $destination->items()->sole();
        $this->assertFalse($copy->is_checked);
        $this->assertNull($copy->last_checked_at);
        $this->assertNull($copy->previous_checked_at);
    }

    public function test_複製は設定を写し、チェックと日付は写さない(): void
    {
        $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();

        $id = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/duplicate", ['title' => '来週の買い物'])
            ->assertCreated()->json('data.id');

        $copy = PackingList::findOrFail($id);
        $this->assertSame(
            ['いつもの買い物' => GroupCheckMode::Repeat, 'その他の買い物' => GroupCheckMode::Normal],
            $copy->groups()->orderBy('sort_order')->get()->pluck('check_mode', 'name')->all(),
        );
        $milk = $copy->items()->where('name', '牛乳')->sole();
        $this->assertFalse($milk->is_checked);
        $this->assertNull($milk->last_checked_at);
    }

    public function test_公開リストのコピーも設定を写し、公開の_ap_iは設定だけを返して日付は返さない(): void
    {
        $this->at('2026-11-25 10:00:00');
        $this->check($this->milk)->assertOk();
        $this->list->forceFill(['is_public' => true])->save();

        // API-16：「繰り返し利用」の印を出すための設定だけを返す
        $this->app['auth']->forgetGuards();
        $response = $this->withoutToken()->getJson("/api/public/lists/{$this->list->id}")->assertOk()
            ->assertJsonPath('data.groups.0.check_mode', 'repeat')
            ->assertJsonPath('data.groups.1.check_mode', 'normal');
        foreach ($response->json('data.items') as $item) {
            $this->assertArrayNotHasKey('last_checked_at', $item);
            $this->assertArrayNotHasKey('is_checked', $item);
        }

        // API-17：ほかの人が自分用にコピーする
        $other = User::factory()->create();
        $id = $this->actingAsUser($other)->postJson("/api/public/lists/{$this->list->id}/copy")
            ->assertCreated()->json('data.id');

        $copy = PackingList::findOrFail($id);
        $this->assertSame(GroupCheckMode::Repeat, $copy->groups()->where('name', 'いつもの買い物')->sole()->check_mode);
        $this->assertNull($copy->items()->where('name', '牛乳')->sole()->last_checked_at);
    }
}
