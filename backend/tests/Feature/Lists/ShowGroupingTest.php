<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-29 グループ整理用の最新状態（06_API一覧「グループ整理のAPI仕様」、D-79）。
 */
class ShowGroupingTest extends ListApiTestCase
{
    public function test_revision・グループ・削除していない持ち物を表示順で返す(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create(['grouping_revision' => 7]);
        $second = PackingListGroup::factory()->for($list)->create(['name' => '薬局', 'sort_order' => 1]);
        $first = PackingListGroup::factory()->for($list)->create(['name' => 'スーパー', 'sort_order' => 0]);
        $egg = PackingListItem::factory()->for($list)->create(['name' => '卵', 'sort_order' => 4, 'group_id' => $first->id, 'is_checked' => true]);
        $milk = PackingListItem::factory()->for($list)->create(['name' => '牛乳', 'sort_order' => 2]);
        PackingListItem::factory()->for($list)->create(['name' => '削除済み', 'sort_order' => 1, 'deleted_at' => now()]);

        $this->actingAsUser($user)->getJson("/api/lists/{$list->id}/grouping")
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'grouping_revision' => 7,
                    'groups' => [
                        ['id' => $first->id, 'name' => 'スーパー', 'sort_order' => 0],
                        ['id' => $second->id, 'name' => '薬局', 'sort_order' => 1],
                    ],
                    'items' => [
                        ['id' => $milk->id, 'name' => '牛乳', 'group_id' => null, 'sort_order' => 2, 'is_checked' => false],
                        ['id' => $egg->id, 'name' => '卵', 'group_id' => $first->id, 'sort_order' => 4, 'is_checked' => true],
                    ],
                ],
            ]);
    }

    public function test_他人のリストは公開中でも存在しないリストと同じ404(): void
    {
        $user = User::factory()->create();
        $othersList = PackingList::factory()->create(['is_public' => true]);

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($user)->getJson("/api/lists/{$id}/grouping")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)->getJson("/api/lists/{$list->id}/grouping")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->getJson("/api/lists/{$list->id}/grouping")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
