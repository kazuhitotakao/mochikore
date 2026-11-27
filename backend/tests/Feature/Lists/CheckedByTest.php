<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\PackingListMember;
use App\Models\User;

/**
 * 共同編集のリストで、チェックした人の表示名を返す（D-130、API-07・11・13・37）。
 */
class CheckedByTest extends ListApiTestCase
{
    private User $owner;

    private User $member;

    private PackingList $list;

    private PackingListItem $milk;

    private PackingListItem $egg;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['display_name' => 'おかあさん']);
        $this->member = User::factory()->create(['display_name' => 'たろう', 'password' => 'Password1!']);
        $this->list = PackingList::factory()->for($this->owner)->create();
        $this->milk = PackingListItem::factory()->for($this->list)->create(['name' => '牛乳', 'sort_order' => 1]);
        $this->egg = PackingListItem::factory()->for($this->list)->create(['name' => '卵', 'sort_order' => 2]);
        $this->addMember($this->member);
    }

    /**
     * 1つのテストの中で所有者・メンバーを入れ替えて送るので、前の人のログインを残さない。
     */
    protected function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return parent::actingAsUser($user);
    }

    private function addMember(User $user, ?PackingList $list = null): PackingListMember
    {
        return ($list ?? $this->list)->members()->create(['user_id' => $user->id]);
    }

    private function check(User $user, PackingListItem $item, bool $checked = true): void
    {
        $this->actingAsUser($user)->patchJson("/api/items/{$item->id}", ['is_checked' => $checked])->assertOk();
    }

    /**
     * @return array<string, mixed> 持ち物の名前ごとの checked_by
     */
    private function checkers(User $viewer, ?PackingList $list = null): array
    {
        $items = $this->actingAsUser($viewer)->getJson('/api/lists/'.($list ?? $this->list)->id)->assertOk()->json('data.items');

        return collect($items)->pluck('checked_by', 'name')->all();
    }

    public function test_共同編集のリストで、チェックした人の表示名と自分かどうかを返す(): void
    {
        $this->check($this->member, $this->milk);

        $this->assertSame($this->member->id, $this->milk->fresh()->checked_by);
        $this->assertSame([
            '牛乳' => ['display_name' => 'たろう', 'is_me' => false],
            '卵' => null,
        ], $this->checkers($this->owner));
        $this->assertSame(['display_name' => 'たろう', 'is_me' => true], $this->checkers($this->member)['牛乳']);

        // 所有者のチェックも、メンバーには所有者の表示名で返す
        $this->check($this->owner, $this->egg);
        $this->assertSame(['display_name' => 'おかあさん', 'is_me' => false], $this->checkers($this->member)['卵']);
    }

    public function test_同じ状態の送り直しと名前の変更では、チェックした人を変えない(): void
    {
        $this->check($this->member, $this->milk);

        $this->check($this->owner, $this->milk);
        $this->actingAsUser($this->owner)->patchJson("/api/items/{$this->milk->id}", ['name' => '低脂肪乳'])->assertOk();

        $this->assertSame($this->member->id, $this->milk->fresh()->checked_by);
        $this->assertSame(['display_name' => 'たろう', 'is_me' => false], $this->checkers($this->owner)['低脂肪乳']);
    }

    public function test_外すとチェックした人も消える(): void
    {
        // API-11：1件ずつ外す
        $this->check($this->member, $this->milk);
        $this->check($this->owner, $this->milk, false);
        $this->assertNull($this->milk->fresh()->checked_by);
        $this->assertNull($this->checkers($this->member)['牛乳']);

        // API-37：まとめて付けると今回付けた持ち物だけ付けた人になり、付いていた持ち物は前の人のまま
        $this->check($this->member, $this->egg);
        $this->actingAsUser($this->owner)
            ->patchJson("/api/lists/{$this->list->id}/items/checks", ['item_ids' => [$this->milk->id, $this->egg->id], 'is_checked' => true])
            ->assertOk();
        $this->assertSame($this->owner->id, $this->milk->fresh()->checked_by);
        $this->assertSame($this->member->id, $this->egg->fresh()->checked_by);

        // API-37：まとめて外す
        $this->actingAsUser($this->owner)
            ->patchJson("/api/lists/{$this->list->id}/items/checks", ['item_ids' => [$this->milk->id, $this->egg->id], 'is_checked' => false])
            ->assertOk();
        $this->assertNull($this->milk->fresh()->checked_by);
        $this->assertNull($this->egg->fresh()->checked_by);

        // API-13：チェックを全部外す
        $this->check($this->member, $this->milk);
        $this->actingAsUser($this->owner)->postJson("/api/lists/{$this->list->id}/reset-checks")->assertNoContent();
        $this->assertNull($this->milk->fresh()->checked_by);
        $this->assertSame(['牛乳' => null, '卵' => null], $this->checkers($this->owner));
    }

    public function test_個人用のリストと、今のメンバーでない人のチェックには返さない(): void
    {
        // メンバーのいないリストでは、自分のチェックも返さない
        $personal = PackingList::factory()->for($this->owner)->create();
        $bread = PackingListItem::factory()->for($personal)->create(['name' => 'パン']);
        $this->check($this->owner, $bread);
        $this->assertSame($this->owner->id, $bread->fresh()->checked_by);
        $this->assertSame(['パン' => null], $this->checkers($this->owner, $personal));

        // 外されたメンバーのチェックは、ほかのメンバーが残っていても返さない
        $other = User::factory()->create(['display_name' => 'はなこ']);
        $this->addMember($other);
        $this->check($this->member, $this->milk);
        $membership = $this->list->members()->where('user_id', $this->member->id)->firstOrFail();
        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}/members/{$membership->id}")->assertNoContent();

        $this->assertTrue($this->milk->fresh()->is_checked);
        $this->assertNull($this->checkers($this->owner)['牛乳']);
        $this->assertNull($this->checkers($other)['牛乳']);
    }

    public function test_チェックした人が退会しても、チェックは残る(): void
    {
        $this->check($this->member, $this->milk);

        $this->actingAsUser($this->member)->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();

        $milk = $this->milk->fresh();
        $this->assertTrue($milk->is_checked);
        $this->assertNull($milk->checked_by);
    }

    public function test_公開リスト・限定公開のリンクには返さず、複製には写さない(): void
    {
        $this->check($this->member, $this->milk);

        // API-50：複製はチェックを外して写すので、チェックした人も写さない
        $copyId = $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/duplicate", ['title' => '来週の買い物'])
            ->assertCreated()
            ->json('data.id');
        $this->assertSame(0, PackingListItem::where('packing_list_id', $copyId)->whereNotNull('checked_by')->count());

        // 公開・限定公開は共同編集と同時に使えないので、所有者がチェックした個人用のリストで確かめる
        $public = PackingList::factory()->for($this->owner)->create(['is_public' => true, 'share_token' => str_repeat('a', 32)]);
        $item = PackingListItem::factory()->for($public)->create();
        $this->check($this->owner, $item);

        $this->getJson("/api/public/lists/{$public->id}")->assertOk()->assertJsonMissingPath('data.items.0.checked_by');
        $this->getJson('/api/shared/lists/'.str_repeat('a', 32))->assertOk()->assertJsonMissingPath('data.items.0.checked_by');
    }
}
