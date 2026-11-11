<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-05 自分のリスト一覧（F-02、D-24・D-63）。
 */
class PackingListIndexTest extends ListApiTestCase
{
    public function test_自分のリストだけを、更新が新しい順に返す(): void
    {
        $user = User::factory()->create();
        $old = PackingList::factory()->for($user)->create(['title' => '古い', 'updated_at' => now()->subDays(2)]);
        $new = PackingList::factory()->for($user)->create([
            'title' => '新しい',
            'description' => 'メモ',
            'category_id' => $this->categoryId('買い物'),
            'is_public' => true,
            'updated_at' => now()->subDay(),
        ]);
        // 同じ更新日時なら、新しく作った（idが大きい）順
        $sameTimeA = PackingList::factory()->for($user)->create(['updated_at' => $old->updated_at]);
        PackingList::factory()->create(['title' => 'ほかの人のリスト']);

        $response = $this->actingAsUser($user)->getJson('/api/lists')->assertOk();

        $this->assertSame([$new->id, $sameTimeA->id, $old->id], array_column($response->json('data'), 'id'));
        $this->assertSame([
            'id' => $new->id,
            'title' => '新しい',
            'description' => 'メモ',
            'category' => ['id' => $this->categoryId('買い物'), 'name' => '買い物'],
            'items_count' => 0,
            'is_public' => true,
            'updated_at' => $new->updated_at->toJSON(),
        ], $response->json('data.0'));
    }

    public function test_持ち物の件数は削除済みを数えない(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create();
        PackingListItem::factory()->count(2)->for($list)->create();
        PackingListItem::factory()->for($list)->create(['deleted_at' => now()]);

        $this->actingAsUser($user)->getJson('/api/lists')
            ->assertOk()
            ->assertJsonPath('data.0.items_count', 2);
    }

    public function test_リストがなければ空の配列を返す(): void
    {
        $user = User::factory()->create();

        $this->actingAsUser($user)->getJson('/api/lists')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_ログインしていなければ401(): void
    {
        $this->getJson('/api/lists')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }

    public function test_メール未認証なら403(): void
    {
        $user = User::factory()->unverified()->create();
        PackingList::factory()->for($user)->create();

        $this->actingAsUser($user)->getJson('/api/lists')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
    }
}
