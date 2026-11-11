<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-13 チェックを全部外す（F-07、D-17・D-25）。
 */
class ResetChecksTest extends ListApiTestCase
{
    public function test_このリストのチェックだけを外し、持ち物は残す(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
        $checked = PackingListItem::factory()->count(2)->for($list)->create(['is_checked' => true]);
        $unchecked = PackingListItem::factory()->for($list)->create();
        $deleted = PackingListItem::factory()->for($list)->create(['is_checked' => true, 'deleted_at' => now()]);
        $otherList = PackingList::factory()->for($user)->create();
        $otherItem = PackingListItem::factory()->for($otherList)->create(['is_checked' => true]);
        $before = $list->updated_at->toJSON();

        $this->actingAsUser($user)->postJson("/api/lists/{$list->id}/reset-checks")->assertNoContent();

        foreach ([...$checked, $unchecked] as $item) {
            $this->assertFalse($item->fresh()->is_checked);
        }
        // 削除済みは対象にせず、チェックを保つ
        $this->assertTrue(PackingListItem::withTrashed()->find($deleted->id)->is_checked);
        // 別のリストのチェックは外さない
        $this->assertTrue($otherItem->fresh()->is_checked);
        $this->assertSame(3, $list->items()->count());

        // D-25：一覧の順番を変えないよう、更新日時を変えない。構造も変えないので revision も同じ
        $list = $list->fresh();
        $this->assertSame($before, $list->updated_at->toJSON());
        $this->assertSame(4, $list->grouping_revision);
    }

    public function test_他人のリストは存在しないリストと同じ404で、外さない(): void
    {
        // D-43
        $user = User::factory()->create();
        $othersItem = PackingListItem::factory()->create(['is_checked' => true]);

        foreach ([$othersItem->packing_list_id, 999999] as $id) {
            $this->actingAsUser($user)
                ->postJson("/api/lists/{$id}/reset-checks")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertTrue($othersItem->fresh()->is_checked);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $user = User::factory()->unverified()->create();
        $item = PackingListItem::factory()->for(PackingList::factory()->for($user))->create(['is_checked' => true]);

        $this->actingAsUser($user)
            ->postJson("/api/lists/{$item->packing_list_id}/reset-checks")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/lists/{$item->packing_list_id}/reset-checks")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertTrue($item->fresh()->is_checked);
    }
}
