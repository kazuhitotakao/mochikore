<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/** D-106・API-42・V-23：空グループの保存、本人の範囲、所属変更と全解除。 */
class EmptyGroupCheckTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private PackingListGroup $group;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 3, 'updated_at' => now()->subDay(),
        ]);
        $this->group = PackingListGroup::factory()->for($this->list)->create();
    }

    public function test_空グループをチェックして再取得し解除でき親の日時と順番は変わらない(): void
    {
        $before = $this->list->updated_at->toJSON();
        $deleted = PackingListItem::factory()->for($this->list)->create([
            'group_id' => $this->group->id, 'is_checked' => true, 'deleted_at' => now(),
        ]);
        foreach ([true, true, false] as $checked) {
            $this->actingAsUser($this->user)->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => $checked])->assertNoContent();
            $this->assertSame($checked, $this->group->fresh()->is_checked);
            $this->getJson("/api/lists/{$this->list->id}")->assertOk()->assertJsonPath('data.groups.0.is_checked', $checked);
        }
        $this->assertSame($before, $this->list->fresh()->updated_at->toJSON());
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
        $this->assertTrue($deleted->fresh()->is_checked);
    }

    public static function invalidChecks(): array
    {
        return [[0], [1], ['true'], ['false'], [null], [[]], [(object) []]];
    }

    #[DataProvider('invalidChecks')]
    public function test_真偽値以外を拒否して保存しない(mixed $value): void
    {
        $this->actingAsUser($this->user)->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => $value])
            ->assertUnprocessable()->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.is_checked.0', 'チェック状態が正しくありません。もう一度操作してください。');
        $this->assertFalse($this->group->fresh()->is_checked);
    }

    public function test_省略と未定義キーも拒否し部分保存しない(): void
    {
        $this->actingAsUser($this->user)->patchJson("/api/groups/{$this->group->id}/check", [])
            ->assertUnprocessable()->assertJsonValidationErrors(['_form', 'is_checked']);
        $this->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => true, 'name' => '変更'])
            ->assertUnprocessable()->assertJsonPath('errors.name.0', 'この項目は送信できません。');
        $this->assertFalse($this->group->fresh()->is_checked);
    }

    public function test_持ち物が入っていたら確定文言で拒否し何も変えない(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create(['group_id' => $this->group->id]);
        $this->actingAsUser($this->user)->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => true])
            ->assertUnprocessable()->assertJsonPath('errors.is_checked.0', 'グループに持ち物があります。リストを読み直してください。');
        $this->assertFalse($this->group->fresh()->is_checked);
        $this->assertFalse($item->fresh()->is_checked);
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_他人と不存在は同じ404で他人の記録を変えない(): void
    {
        $other = PackingListGroup::factory()->create(['is_checked' => true]);
        foreach ([$other->id, 99999999] as $id) {
            $this->actingAsUser($this->user)->patchJson("/api/groups/{$id}/check", ['is_checked' => false])
                ->assertNotFound()->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertTrue($other->fresh()->is_checked);
    }

    public function test_未ログインとメール未認証では保存できない(): void
    {
        $this->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => true])->assertUnauthorized();
        $unverified = User::factory()->unverified()->create();
        $group = PackingListGroup::factory()->for(PackingList::factory()->for($unverified))->create();
        $this->actingAsUser($unverified)->patchJson("/api/groups/{$group->id}/check", ['is_checked' => true])
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertFalse($group->fresh()->is_checked);
    }

    public function test_全部外すとこのリストの空グループだけ解除し削除済み持ち物を保持する(): void
    {
        $this->group->update(['is_checked' => true]);
        $other = PackingListGroup::factory()->create(['is_checked' => true]);
        $deleted = PackingListItem::factory()->for($this->list)->create(['is_checked' => true, 'deleted_at' => now()]);
        $before = $this->list->updated_at->toJSON();
        $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/reset-checks")->assertNoContent();
        $this->assertFalse($this->group->fresh()->is_checked);
        $this->assertTrue($other->fresh()->is_checked);
        $this->assertTrue($deleted->fresh()->is_checked);
        $this->assertSame($before, $this->list->fresh()->updated_at->toJSON());
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_ドラッグで入れたら空グループの記録を外し再び空になっても復活しない(): void
    {
        $this->group->update(['is_checked' => true]);
        $item = PackingListItem::factory()->for($this->list)->create();
        $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}/items/order", [
            'item_ids' => [$item->id], 'move' => ['item_id' => $item->id, 'group_id' => $this->group->id],
        ])->assertNoContent();
        $this->assertFalse($this->group->fresh()->is_checked);
        $this->assertSame($this->group->id, $item->fresh()->group_id);
        $this->deleteJson("/api/items/{$item->id}")->assertOk();
        $this->getJson("/api/lists/{$this->list->id}")->assertOk()->assertJsonPath('data.groups.0.is_checked', false);
    }

    public function test_復元で持ち物が戻ったら空グループの記録を外す(): void
    {
        $this->group->update(['is_checked' => true]);
        $item = PackingListItem::factory()->for($this->list)->create([
            'group_id' => $this->group->id, 'is_checked' => true, 'deleted_at' => now(),
        ]);
        $this->actingAsUser($this->user)->postJson("/api/items/{$item->id}/restore")->assertOk();
        $this->assertFalse($this->group->fresh()->is_checked);
        $this->assertTrue($item->fresh()->is_checked);
        $this->assertNull($item->fresh()->deleted_at);
    }

    public function test_整理画面から持ち物を入れたら空グループの記録を外す(): void
    {
        $this->group->update(['is_checked' => true]);
        $item = PackingListItem::factory()->for($this->list)->create();
        $this->actingAsUser($this->user)->putJson("/api/lists/{$this->list->id}/grouping", [
            'base_revision' => 3,
            'groups' => [['key' => 'existing', 'id' => $this->group->id, 'name' => $this->group->name, 'check_mode' => 'normal']],
            'assignments' => [['item_id' => $item->id, 'group_key' => 'existing']],
        ])->assertOk();
        $this->assertFalse($this->group->fresh()->is_checked);
        $this->assertSame($this->group->id, $item->fresh()->group_id);
    }

    public function test_公開と整理には空グループの記録を返さずコピー先も未チェック(): void
    {
        $this->list->forceFill(['is_public' => true])->save();
        $this->group->update(['is_checked' => true]);
        PackingListItem::factory()->for($this->list)->create();
        $this->getJson("/api/public/lists/{$this->list->id}")->assertOk()->assertJsonMissingPath('data.groups.0.is_checked');
        $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}/grouping")
            ->assertOk()->assertJsonMissingPath('data.groups.0.is_checked');
        $copyId = $this->postJson("/api/public/lists/{$this->list->id}/copy")->assertCreated()->json('data.id');
        $this->assertFalse(PackingList::findOrFail($copyId)->groups()->sole()->is_checked);
    }
}
