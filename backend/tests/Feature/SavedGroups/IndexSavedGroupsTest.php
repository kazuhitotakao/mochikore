<?php

namespace Tests\Feature\SavedGroups;

use App\Models\SavedGroup;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-39 本人のよく使うグループの一覧（F-28、V-15・V-21・C-02、D-102）。
 */
class IndexSavedGroupsTest extends ListApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function test_本人の候補だけを、新しく保存した順に返す(): void
    {
        $shopping = $this->categoryId('買い物');
        $travel = $this->categoryId('旅行・お泊まり');
        $old = SavedGroup::factory()->for($this->user)->create(['name' => '冷蔵', 'category_id' => $shopping, 'created_at' => now()->subDays(2)]);
        $new = SavedGroup::factory()->for($this->user)->create(['name' => '薬局', 'category_id' => $shopping, 'created_at' => now()->subDay()]);
        // 同じ日時なら、新しく作った（idが大きい）順
        $sameTime = SavedGroup::factory()->for($this->user)->create(['name' => '洗面', 'category_id' => $travel, 'created_at' => $old->created_at]);
        SavedGroup::factory()->create(['name' => 'ほかの人の候補']);

        $this->actingAsUser($this->user)->getJson('/api/saved-groups')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    ['id' => $new->id, 'name' => '薬局', 'category' => ['id' => $shopping, 'name' => '買い物']],
                    ['id' => $sameTime->id, 'name' => '洗面', 'category' => ['id' => $travel, 'name' => '旅行・お泊まり']],
                    ['id' => $old->id, 'name' => '冷蔵', 'category' => ['id' => $shopping, 'name' => '買い物']],
                ],
            ]);
    }

    public function test_カテゴリーを指定すると、そのカテゴリーの候補だけを返す(): void
    {
        $shopping = $this->categoryId('買い物');
        $cold = SavedGroup::factory()->for($this->user)->create(['name' => '冷蔵', 'category_id' => $shopping]);
        SavedGroup::factory()->for($this->user)->create(['name' => '洗面', 'category_id' => $this->categoryId('旅行・お泊まり')]);

        $response = $this->actingAsUser($this->user)->getJson("/api/saved-groups?category_id={$shopping}")->assertOk();

        $this->assertSame([$cold->id], array_column($response->json('data'), 'id'));
    }

    public function test_候補がなければ空の配列を返す(): void
    {
        $this->actingAsUser($this->user)
            ->getJson('/api/saved-groups?category_id='.$this->categoryId('その他'))
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidQueries(): array
    {
        return [
            '空にして送る' => ['category_id='],
            '0' => ['category_id=0'],
            '負数' => ['category_id=-1'],
            '小数' => ['category_id=1.5'],
            '数字でない' => ['category_id=abc'],
            '配列' => ['category_id[]=1'],
            '存在しないID' => ['category_id=999999'],
        ];
    }

    #[DataProvider('invalidQueries')]
    public function test_カテゴリーの指定が正しくなければ422(string $query): void
    {
        $this->actingAsUser($this->user)->getJson("/api/saved-groups?{$query}")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.category_id', ['有効なカテゴリーを選択してください。']);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();

        $this->actingAsUser($unverified)->getJson('/api/saved-groups')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->getJson('/api/saved-groups')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
