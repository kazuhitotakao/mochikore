<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * F-10・SC-11・API-16、C-01〜08、D-01・32・43・48・53・55・56・57・61・95。
 */
class ShowPublicPackingListTest extends ListApiTestCase
{
    private const NOT_FOUND = ['message' => 'ページが見つかりません。', 'code' => 'not_found'];

    public function test_匿名でも公開用の項目だけをグループ・持ち物の表示順で返す(): void
    {
        $list = PackingList::factory()->create(['is_public' => true, 'description' => "1行目\n2行目"]);
        $later = PackingListGroup::factory()->for($list)->create(['sort_order' => 1]);
        $first = PackingListGroup::factory()->for($list)->create(['sort_order' => 0]);
        $empty = PackingListGroup::factory()->for($list)->create(['sort_order' => 1]);
        $lastItem = PackingListItem::factory()->for($list)->create(['group_id' => $later->id, 'sort_order' => 5]);
        $checked = PackingListItem::factory()->for($list)->create(['group_id' => $first->id, 'sort_order' => 1, 'is_checked' => true]);
        $unclassified = PackingListItem::factory()->for($list)->create(['sort_order' => 1]);
        PackingListItem::factory()->for($list)->create(['deleted_at' => now(), 'sort_order' => 0]);
        $originalUpdatedAt = $list->updated_at;

        $this->getJson("/api/public/lists/{$list->id}")->assertOk()->assertExactJson([
            'data' => [
                'id' => $list->id,
                'title' => $list->title,
                'description' => "1行目\n2行目",
                'category' => ['id' => $list->category->id, 'name' => $list->category->name],
                'created_at' => $list->created_at->toJSON(),
                'groups' => collect([$first, $later, $empty])->map(fn ($group) => [
                    'id' => $group->id, 'name' => $group->name, 'sort_order' => $group->sort_order,
                ])->all(),
                'items' => collect([$checked, $unclassified, $lastItem])->map(fn ($item) => [
                    'id' => $item->id, 'name' => $item->name, 'group_id' => $item->group_id, 'sort_order' => $item->sort_order,
                ])->all(),
            ],
        ]);
        $this->assertTrue($list->fresh()->updated_at->equalTo($originalUpdatedAt));
        $this->assertTrue($checked->fresh()->is_checked);
    }

    public function test_未認証や無効トークンでも公開リストを読める(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $this->actingAsUser(User::factory()->unverified()->create())->getJson("/api/public/lists/{$list->id}")->assertOk();
        $this->withHeader('Authorization', 'Bearer invalid-token')->getJson("/api/public/lists/{$list->id}")->assertOk();
    }

    public function test_全件チェック済みでも全持ち物を返しグループなしにも対応する(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        PackingListItem::factory()->count(3)->for($list)->create(['is_checked' => true]);
        $response = $this->getJson("/api/public/lists/{$list->id}")->assertOk()->assertJsonCount(0, 'data.groups')->assertJsonCount(3, 'data.items');
        foreach ($response->json('data.items') as $item) {
            $this->assertArrayNotHasKey('is_checked', $item);
        }
    }

    public static function hiddenStates(): array
    {
        return ['private' => [false, false], 'moderated' => [false, true], 'inconsistent-public' => [true, true]];
    }

    #[DataProvider('hiddenStates')]
    public function test_本人でも非公開・運営非公開を不存在と同じ404にする(bool $public, bool $moderated): void
    {
        $owner = User::factory()->create();
        $list = PackingList::factory()->for($owner)->create(['is_public' => $public, 'moderated_at' => $moderated ? now() : null]);
        $this->getJson("/api/public/lists/{$list->id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
        $this->actingAsUser($owner)->getJson("/api/public/lists/{$list->id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
    }

    public function test_存在しない・不正・削除済みのリストは404(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $list->delete();
        foreach ([$list->id, '999999999', 'abc', '0', '-1'] as $id) {
            $this->getJson("/api/public/lists/{$id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
        }
    }
}
