<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-12 持ち物の削除（F-05、D-24・D-31・D-35・D-51・D-59）。
 */
class DestroyPackingListItemTest extends ListApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function test_一時削除して親リストのis_publicを返し、ほかの番号は詰めない(): void
    {
        $list = PackingList::factory()->for($this->user)->create(['updated_at' => now()->subDay()]);
        $a = PackingListItem::factory()->for($list)->create(['sort_order' => 1]);
        $b = PackingListItem::factory()->for($list)->create(['sort_order' => 2]);
        $c = PackingListItem::factory()->for($list)->create(['sort_order' => 3]);

        $this->actingAsUser($this->user)
            ->deleteJson("/api/items/{$b->id}")
            ->assertOk()
            ->assertExactJson(['data' => ['is_public' => false]]);

        // D-35：同じidのまま戻せるよう、行と番号を残す
        $this->assertSoftDeleted($b);
        $this->assertSame(2, $b->fresh()->sort_order);
        $this->assertSame([1, 3], [$a->fresh()->sort_order, $c->fresh()->sort_order]);

        $list = $list->fresh();
        $this->assertSame(1, $list->grouping_revision);
        // D-24：持ち物を削除したリストは一覧の上に戻る
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_公開中のリストで最後の持ち物を削除したら非公開にする(): void
    {
        // D-51
        $list = PackingList::factory()->for($this->user)->create(['is_public' => true]);
        $first = PackingListItem::factory()->for($list)->create();
        $last = PackingListItem::factory()->for($list)->create();

        $this->actingAsUser($this->user)->deleteJson("/api/items/{$first->id}")
            ->assertOk()
            ->assertJsonPath('data.is_public', true);

        $this->actingAsUser($this->user)->deleteJson("/api/items/{$last->id}")
            ->assertOk()
            ->assertJsonPath('data.is_public', false);
        $this->assertFalse($list->fresh()->is_public);
    }

    public function test_削除済みの持ち物をもう一度削除すると404で、revisionを増やさない(): void
    {
        $list = PackingList::factory()->for($this->user)->create();
        $item = PackingListItem::factory()->for($list)->create();
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$item->id}")->assertOk();

        $this->actingAsUser($this->user)
            ->deleteJson("/api/items/{$item->id}")
            ->assertNotFound()
            ->assertJsonPath('code', 'not_found');
        $this->assertSame(1, $list->fresh()->grouping_revision);
    }

    public function test_他人の持ち物は存在しない持ち物と同じ404で、消さない(): void
    {
        // D-43
        $othersItem = PackingListItem::factory()->create();

        foreach ([$othersItem->id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->deleteJson("/api/items/{$id}")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertNotSoftDeleted($othersItem);
    }

    public function test_メール未認証なら403で、消さない(): void
    {
        $user = User::factory()->unverified()->create();
        $item = PackingListItem::factory()->for(PackingList::factory()->for($user))->create();

        $this->actingAsUser($user)
            ->deleteJson("/api/items/{$item->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
        $this->assertNotSoftDeleted($item);
    }
}
