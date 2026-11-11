<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-07 自分のリストの内容（F-02・F-05、D-43・D-67）。
 */
class ShowPackingListTest extends ListApiTestCase
{
    private const NOT_FOUND = [
        'message' => 'ページが見つかりません。',
        'code' => 'not_found',
    ];

    public function test_リスト本体とグループ・持ち物を表示順で返す(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create([
            'title' => '旅行',
            'description' => "1行目\n2行目",
            'category_id' => $this->categoryId('旅行・お泊まり'),
            'grouping_revision' => 3,
        ]);
        $later = PackingListGroup::factory()->for($list)->create(['name' => '服', 'sort_order' => 1]);
        $first = PackingListGroup::factory()->for($list)->create(['name' => '洗面', 'sort_order' => 0]);
        $b = PackingListItem::factory()->for($list)->create(['name' => 'B', 'sort_order' => 2, 'group_id' => $later->id]);
        $a = PackingListItem::factory()->for($list)->create(['name' => 'A', 'sort_order' => 1, 'is_checked' => true]);
        // 同じ番号ならidの小さい順
        $c = PackingListItem::factory()->for($list)->create(['name' => 'C', 'sort_order' => 2]);
        PackingListItem::factory()->for($list)->create(['name' => '削除済み', 'sort_order' => 0, 'deleted_at' => now()]);

        $this->actingAsUser($user)->getJson("/api/lists/{$list->id}")
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'id' => $list->id,
                    'title' => '旅行',
                    'description' => "1行目\n2行目",
                    'category' => ['id' => $this->categoryId('旅行・お泊まり'), 'name' => '旅行・お泊まり'],
                    'is_public' => false,
                    'moderated_at' => null,
                    'updated_at' => $list->updated_at->toJSON(),
                    'grouping_revision' => 3,
                    'groups' => [
                        ['id' => $first->id, 'name' => '洗面', 'sort_order' => 0],
                        ['id' => $later->id, 'name' => '服', 'sort_order' => 1],
                    ],
                    'items' => [
                        ['id' => $a->id, 'name' => 'A', 'group_id' => null, 'sort_order' => 1, 'is_checked' => true],
                        ['id' => $b->id, 'name' => 'B', 'group_id' => $later->id, 'sort_order' => 2, 'is_checked' => false],
                        ['id' => $c->id, 'name' => 'C', 'group_id' => null, 'sort_order' => 2, 'is_checked' => false],
                    ],
                ],
            ]);
    }

    public function test_他人のリストは、公開中でも存在しないリストと同じ404(): void
    {
        // D-43：そのIDのリストがあることを知らせない。公開リストは公開用のAPI-16で見る
        $user = User::factory()->create();
        $othersList = PackingList::factory()->create(['is_public' => true]);

        $this->actingAsUser($user)->getJson("/api/lists/{$othersList->id}")
            ->assertNotFound()
            ->assertExactJson(self::NOT_FOUND);
        $this->actingAsUser($user)->getJson('/api/lists/999999')
            ->assertNotFound()
            ->assertExactJson(self::NOT_FOUND);
        $this->actingAsUser($user)->getJson('/api/lists/abc')
            ->assertNotFound()
            ->assertExactJson(self::NOT_FOUND);
    }

    public function test_メール未認証なら、リストがあってもなくても同じ403(): void
    {
        // D-43：未認証の人に、他人のリストのIDがあるかを知られないようにする
        $user = User::factory()->unverified()->create();
        $othersList = PackingList::factory()->create();

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($user)->getJson("/api/lists/{$id}")
                ->assertForbidden()
                ->assertJsonPath('code', 'email_not_verified');
        }
    }

    public function test_ログインしていなければ、リストがあってもなくても同じ401(): void
    {
        $list = PackingList::factory()->create();

        foreach ([$list->id, 999999] as $id) {
            $this->getJson("/api/lists/{$id}")
                ->assertUnauthorized()
                ->assertJsonPath('code', 'unauthenticated');
        }
    }
}
