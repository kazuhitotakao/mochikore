<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-25 削除した持ち物を戻す（F-05、D-28・D-31・D-34・D-35・D-51・D-59）。
 */
class RestorePackingListItemTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 5,
            'updated_at' => now()->subDay(),
        ]);
    }

    public function test_同じidのまま、名前・チェック・元の位置で戻す(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create([
            'name' => '歯ブラシ',
            'is_checked' => true,
            'sort_order' => 2,
            'deleted_at' => now(),
        ]);

        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$item->id}/restore")
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'id' => $item->id,
                    'name' => '歯ブラシ',
                    'group_id' => null,
                    'sort_order' => 2,
                    'is_checked' => true,
                ],
            ]);

        $this->assertNotSoftDeleted($item);
        $list = $this->list->fresh();
        // D-59：構造が変わったので revision を増やす。D-24：一覧の上に戻る
        $this->assertSame(6, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_複数を違う順で戻しても、元の順番になる(): void
    {
        // 04_テーブル定義 packing_list_items.sort_order【復元】
        $a = PackingListItem::factory()->for($this->list)->create(['name' => 'A', 'sort_order' => 1]);
        $b = PackingListItem::factory()->for($this->list)->create(['name' => 'B', 'sort_order' => 2]);
        PackingListItem::factory()->for($this->list)->create(['name' => 'C', 'sort_order' => 3]);
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$a->id}")->assertOk();
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$b->id}")->assertOk();

        $this->actingAsUser($this->user)->postJson("/api/items/{$b->id}/restore")->assertOk();
        $this->actingAsUser($this->user)->postJson("/api/items/{$a->id}/restore")->assertOk();

        $response = $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk();
        $this->assertSame(['A', 'B', 'C'], array_column($response->json('data.items'), 'name'));
    }

    public function test_番号が空なら一番下に戻す(): void
    {
        // D-31：削除後に並べ替えると、削除済みの番号は空になる（API-19）
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 7]);
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 30, 'deleted_at' => now()]);
        $item = PackingListItem::factory()->for($this->list)->create(['sort_order' => null, 'deleted_at' => now()]);

        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$item->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.sort_order', 8);
    }

    public function test_元のグループがあればそこへ、消えていれば未分類へ戻す(): void
    {
        $kept = PackingListGroup::factory()->for($this->list)->create();
        $removed = PackingListGroup::factory()->for($this->list)->create(['sort_order' => 1]);
        $inKept = PackingListItem::factory()->for($this->list)->create(['group_id' => $kept->id, 'deleted_at' => now()]);
        $inRemoved = PackingListItem::factory()->for($this->list)->create(['group_id' => $removed->id, 'deleted_at' => now()]);
        $removed->delete();

        $this->actingAsUser($this->user)->postJson("/api/items/{$inKept->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.group_id', $kept->id);
        $this->actingAsUser($this->user)->postJson("/api/items/{$inRemoved->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.group_id', null);
    }

    public function test_すでに戻っていれば、件数もrevisionも増やさずに成功にする(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create(['deleted_at' => now()]);
        $this->actingAsUser($this->user)->postJson("/api/items/{$item->id}/restore")->assertOk();

        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$item->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.id', $item->id);

        $this->assertSame(1, $this->list->items()->count());
        $this->assertSame(6, $this->list->fresh()->grouping_revision);
    }

    public function test_200件あっても、件数の上限なく戻せる(): void
    {
        // D-34：持ち物の件数に上限は設けない（利用者の指示で200件から変更）
        PackingListItem::factory()->count(200)->for($this->list)->create();
        $item = PackingListItem::factory()->for($this->list)->create(['deleted_at' => now()]);

        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$item->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.id', $item->id);

        $this->assertNotSoftDeleted($item);
        $this->assertSame(201, $this->list->items()->count());
        $this->assertSame(6, $this->list->fresh()->grouping_revision);
    }

    public function test_戻しても自動では再公開しない(): void
    {
        // D-51
        $this->list->forceFill(['is_public' => true])->save();
        $item = PackingListItem::factory()->for($this->list)->create();
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$item->id}")->assertJsonPath('data.is_public', false);

        $this->actingAsUser($this->user)->postJson("/api/items/{$item->id}/restore")->assertOk();

        $this->assertFalse($this->list->fresh()->is_public);
    }

    public function test_完全に削除された持ち物・他人の持ち物は同じ404(): void
    {
        // D-43・API-25：完全削除後は404。画面は「戻せませんでした」と出す
        $forceDeleted = PackingListItem::factory()->for($this->list)->create();
        $forceDeleted->forceDelete();
        $othersItem = PackingListItem::factory()->create(['deleted_at' => now()]);

        foreach ([$forceDeleted->id, $othersItem->id] as $id) {
            $this->actingAsUser($this->user)
                ->postJson("/api/items/{$id}/restore")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertSoftDeleted($othersItem);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $item = PackingListItem::factory()
            ->for(PackingList::factory()->for($unverified))
            ->create(['deleted_at' => now()]);

        $this->actingAsUser($unverified)
            ->postJson("/api/items/{$item->id}/restore")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/items/{$item->id}/restore")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertSoftDeleted($item);
    }
}
