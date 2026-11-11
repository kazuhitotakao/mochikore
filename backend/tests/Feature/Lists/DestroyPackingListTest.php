<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-09 リストの削除（F-04、D-26・D-30・D-43・D-50）。
 */
class DestroyPackingListTest extends ListApiTestCase
{
    public function test_選んだリストと中の持ち物・グループを削除し、204を返す(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create(['title' => '旅行']);
        $group = PackingListGroup::factory()->for($list)->create();
        PackingListItem::factory()->for($list)->create(['group_id' => $group->id]);
        PackingListItem::factory()->for($list)->create(['deleted_at' => now()]);
        // D-30：同じ名前のほかのリストは残る
        $sameName = PackingList::factory()->for($user)->create(['title' => '旅行']);
        PackingListItem::factory()->for($sameName)->create();

        $this->actingAsUser($user)->deleteJson("/api/lists/{$list->id}")->assertNoContent();

        $this->assertModelMissing($list);
        $this->assertSame(0, PackingListItem::withTrashed()->where('packing_list_id', $list->id)->count());
        $this->assertSame(0, PackingListGroup::where('packing_list_id', $list->id)->count());
        $this->assertModelExists($sameName);
        $this->assertSame(1, $sameName->items()->count());
    }

    public function test_削除すると100件の枠が空き、また作れる(): void
    {
        // D-50：削除済みのリストは数えない
        $user = User::factory()->create();
        $lists = PackingList::factory()->count(100)->for($user)->create();
        $body = ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり')];
        $this->actingAsUser($user)->postJson('/api/lists', $body)->assertUnprocessable();

        $this->actingAsUser($user)->deleteJson("/api/lists/{$lists->first()->id}")->assertNoContent();

        $this->actingAsUser($user)->postJson('/api/lists', $body)->assertCreated();
    }

    public function test_他人のリストは存在しないリストと同じ404で、消さない(): void
    {
        // D-43
        $user = User::factory()->create();
        $othersList = PackingList::factory()->create();

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($user)
                ->deleteJson("/api/lists/{$id}")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertModelExists($othersList);
    }

    public function test_メール未認証なら403で、消さない(): void
    {
        $user = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($user)->create();

        $this->actingAsUser($user)
            ->deleteJson("/api/lists/{$list->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
        $this->assertModelExists($list);
    }

    public function test_ログインしていなければ401(): void
    {
        $list = PackingList::factory()->create();

        $this->deleteJson("/api/lists/{$list->id}")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertModelExists($list);
    }
}
