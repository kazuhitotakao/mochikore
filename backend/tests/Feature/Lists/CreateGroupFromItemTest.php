<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-45 持ち物を重ねてグループにする（D-111、V-24、D-24・D-57・D-59・D-60）。
 */
class CreateGroupFromItemTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private PackingListGroup $group;

    // 重ねられる側（未分類）
    private PackingListItem $base;

    // 重ねる側（グループ「スーパー」の中・チェック済み）
    private PackingListItem $moved;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
        $this->group = PackingListGroup::factory()->for($this->list)->create(['name' => 'スーパー', 'sort_order' => 0]);
        $this->moved = PackingListItem::factory()->for($this->list)->create([
            'name' => '歯ブラシ', 'group_id' => $this->group->id, 'sort_order' => 1, 'is_checked' => true,
        ]);
        $this->base = PackingListItem::factory()->for($this->list)->create([
            'name' => '洗面用具', 'sort_order' => 2, 'is_checked' => true,
        ]);
    }

    private function combine(mixed $itemId, ?User $as = null, ?int $baseId = null): TestResponse
    {
        return $this->actingAsUser($as ?? $this->user)
            ->postJson('/api/items/'.($baseId ?? $this->base->id).'/group', ['item_id' => $itemId]);
    }

    private function assertUnchanged(): void
    {
        $this->assertNotSoftDeleted($this->base);
        $this->assertSame($this->group->id, $this->moved->fresh()->group_id);
        $this->assertSame(1, $this->list->groups()->count());
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_重ねられた持ち物の名前でグループを作り重ねた持ち物を入れて201で返す(): void
    {
        $response = $this->combine($this->moved->id)->assertCreated();

        $created = PackingListGroup::where('name', '洗面用具')->sole();
        $response->assertExactJson(['data' => [
            'group' => ['id' => $created->id, 'name' => '洗面用具', 'sort_order' => 1],
            // D-60：全体の順番とチェックは変えず、所属だけを変える
            'item' => [
                'id' => $this->moved->id, 'name' => '歯ブラシ', 'group_id' => $created->id,
                'sort_order' => 1, 'is_checked' => true,
            ],
        ]]);

        // 重ねられた持ち物は見出しに変わるので、持ち物としては残さない（一時削除）
        $this->assertSoftDeleted($this->base);

        // D-59・D-111：構造の変更なので revision を増やし、D-24：一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(5, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));

        // 名前付きグループの最後（未分類のすぐ上）に入り、D-106：新しいグループのチェックは付けない
        $this->getJson("/api/lists/{$this->list->id}")
            ->assertOk()
            ->assertJsonPath('data.groups.0.name', 'スーパー')
            ->assertJsonPath('data.groups.1.name', '洗面用具')
            ->assertJsonPath('data.groups.1.is_checked', false)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.group_id', $created->id);
    }

    public function test_グループがないリストでは最初のグループになる(): void
    {
        $this->group->delete();
        $first = PackingListItem::factory()->for($this->list)->create(['name' => '上着', 'sort_order' => 3]);

        $this->combine($first->id)
            ->assertCreated()
            ->assertJsonPath('data.group.sort_order', 0)
            ->assertJsonPath('data.item.group_id', PackingListGroup::where('name', '洗面用具')->value('id'));
    }

    public function test_グループに入っている持ち物には重ねられず何も変えない(): void
    {
        // 別の端末で、重ねられる側をグループへ移した後
        $other = PackingListItem::factory()->for($this->list)->create(['name' => '上着', 'sort_order' => 3]);
        $this->base->forceFill(['group_id' => $this->group->id])->save();

        $this->combine($other->id)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors._form.0', 'リストの情報を読み直してください。');

        $this->assertNotSoftDeleted($this->base);
        $this->assertNull($other->fresh()->group_id);
        $this->assertSame(1, $this->list->groups()->count());
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_名前が予約名や同じリストのグループと同じなら422で何も変えない(): void
    {
        $this->base->update(['name' => '未分類']);
        $this->combine($this->moved->id)
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'このグループ名は使用できません。');
        $this->assertUnchanged();

        $this->base->update(['name' => 'スーパー']);
        $this->combine($this->moved->id)
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', '同じ名前のグループがあります。');
        $this->assertUnchanged();
    }

    public function test_別のリストのグループと同じ名前や大文字小文字の違いは使える(): void
    {
        PackingListGroup::factory()->create(['name' => '洗面用具']);
        $this->group->update(['name' => 'ABC']);
        $this->base->update(['name' => 'abc']);

        $this->combine($this->moved->id)->assertCreated()->assertJsonPath('data.group.name', 'abc');
    }

    public function test_グループが20個あれば422で作らず19個なら20個目を作れる(): void
    {
        foreach (range(1, 18) as $order) {
            PackingListGroup::factory()->for($this->list)->create(['name' => "グループ{$order}", 'sort_order' => $order]);
        }
        $this->combine($this->moved->id)->assertCreated()->assertJsonPath('data.group.sort_order', 19);
        $this->assertSame(20, $this->list->groups()->count());

        $base = PackingListItem::factory()->for($this->list)->create(['name' => '上着', 'sort_order' => 3]);
        $other = PackingListItem::factory()->for($this->list)->create(['name' => '帽子', 'sort_order' => 4]);
        $this->combine($other->id, baseId: $base->id)
            ->assertUnprocessable()
            ->assertJsonPath('errors._form.0', 'グループは20個までです。');

        $this->assertNotSoftDeleted($base);
        $this->assertNull($other->fresh()->group_id);
        $this->assertSame(20, $this->list->groups()->count());
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function invalidItemIds(): array
    {
        return [
            '省略を表すnull' => [null],
            '数字の文字列' => ['1'],
            '小数' => [1.5],
            '0' => [0],
            '配列' => [[1]],
            '存在しないID' => [99999999],
        ];
    }

    #[DataProvider('invalidItemIds')]
    public function test_重ねた持ち物の番号が正しくなければ422で何も変えない(mixed $itemId): void
    {
        $this->combine($itemId)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.item_id.0', 'グループにする持ち物の情報が正しくありません。リストを読み直してください。');

        $this->assertUnchanged();
    }

    public function test_自分自身・別のリスト・削除済みの持ち物は重ねられない(): void
    {
        $otherList = PackingListItem::factory()->for(PackingList::factory()->for($this->user))->create();
        $deleted = PackingListItem::factory()->for($this->list)->create(['sort_order' => 3]);
        $deleted->delete();

        foreach ([$this->base->id, $otherList->id, $deleted->id] as $itemId) {
            $this->combine($itemId)
                ->assertUnprocessable()
                ->assertJsonPath('errors.item_id.0', 'グループにする持ち物の情報が正しくありません。リストを読み直してください。');
        }

        $this->assertUnchanged();
        $this->assertNull($otherList->fresh()->group_id);
    }

    public function test_空の送信と定義していない項目は拒否する(): void
    {
        $this->actingAsUser($this->user)->postJson("/api/items/{$this->base->id}/group", [])
            ->assertUnprocessable()->assertJsonValidationErrors(['_form', 'item_id']);

        $this->postJson("/api/items/{$this->base->id}/group", ['item_id' => $this->moved->id, 'name' => '別名'])
            ->assertUnprocessable()->assertJsonPath('errors.name.0', 'この項目は送信できません。');

        $this->assertUnchanged();
    }

    public function test_他人の持ち物・存在しない持ち物・削除済みの持ち物は同じ404で変えない(): void
    {
        $other = PackingListItem::factory()->create(['name' => '他人']);
        $deleted = PackingListItem::factory()->for($this->list)->create(['sort_order' => 3]);
        $deleted->delete();

        foreach ([$other->id, 99999999, $deleted->id] as $baseId) {
            $this->combine($this->moved->id, baseId: $baseId)
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }

        $this->assertNotSoftDeleted($other);
        $this->assertUnchanged();
    }

    public function test_未ログインとメール未認証では変えられない(): void
    {
        $this->postJson("/api/items/{$this->base->id}/group", ['item_id' => $this->moved->id])->assertUnauthorized();

        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();
        $base = PackingListItem::factory()->for($list)->create(['sort_order' => 1]);
        $moved = PackingListItem::factory()->for($list)->create(['sort_order' => 2]);

        $this->combine($moved->id, $unverified, $base->id)
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');

        $this->assertNotSoftDeleted($base);
        $this->assertSame(0, $list->groups()->count());
        $this->assertUnchanged();
    }

    public function test_作った後は開いたままの整理画面の古いrevisionでは上書きできない(): void
    {
        $this->combine($this->moved->id)->assertCreated();

        // SC-09 を開いたときの revision（4）で「保存」しても、409 でグループは消えない
        $this->putJson("/api/lists/{$this->list->id}/grouping", [
            'base_revision' => 4,
            'groups' => [['key' => 'g1', 'id' => $this->group->id, 'name' => 'スーパー']],
            'assignments' => [['item_id' => $this->moved->id, 'group_key' => 'g1']],
        ])->assertConflict()->assertJsonPath('code', 'grouping_conflict');

        $this->assertSame(2, $this->list->groups()->count());
    }
}
