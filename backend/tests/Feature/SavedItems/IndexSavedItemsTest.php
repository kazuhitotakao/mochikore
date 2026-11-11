<?php

namespace Tests\Feature\SavedItems;

use App\Models\SavedItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-31 本人のよく使う項目の一覧（F-22、V-15・C-02、D-72）。
 */
class IndexSavedItemsTest extends ListApiTestCase
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
        $old = SavedItem::factory()->for($this->user)->create(['name' => '牛乳', 'category_id' => $shopping, 'created_at' => now()->subDays(2)]);
        $new = SavedItem::factory()->for($this->user)->create(['name' => '卵', 'category_id' => $shopping, 'created_at' => now()->subDay()]);
        // 同じ日時なら、新しく作った（idが大きい）順
        $sameTime = SavedItem::factory()->for($this->user)->create(['name' => '充電器', 'category_id' => $this->categoryId('旅行・お泊まり'), 'created_at' => $old->created_at]);
        SavedItem::factory()->create(['name' => 'ほかの人の候補']);

        $this->actingAsUser($this->user)->getJson('/api/saved-items')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    ['id' => $new->id, 'name' => '卵', 'category' => ['id' => $shopping, 'name' => '買い物']],
                    ['id' => $sameTime->id, 'name' => '充電器', 'category' => ['id' => $this->categoryId('旅行・お泊まり'), 'name' => '旅行・お泊まり']],
                    ['id' => $old->id, 'name' => '牛乳', 'category' => ['id' => $shopping, 'name' => '買い物']],
                ],
            ]);
    }

    public function test_カテゴリーを指定すると、そのカテゴリーの候補だけを返す(): void
    {
        $shopping = $this->categoryId('買い物');
        $milk = SavedItem::factory()->for($this->user)->create(['name' => '牛乳', 'category_id' => $shopping]);
        SavedItem::factory()->for($this->user)->create(['name' => '充電器', 'category_id' => $this->categoryId('旅行・お泊まり')]);

        $response = $this->actingAsUser($this->user)->getJson("/api/saved-items?category_id={$shopping}")->assertOk();

        $this->assertSame([$milk->id], array_column($response->json('data'), 'id'));
    }

    public function test_候補がなければ空の配列を返す(): void
    {
        $this->actingAsUser($this->user)
            ->getJson('/api/saved-items?category_id='.$this->categoryId('その他'))
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
        $this->actingAsUser($this->user)->getJson("/api/saved-items?{$query}")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.category_id', ['有効なカテゴリーを選択してください。']);
    }

    public function test_前後の空白は削ってから確かめる(): void
    {
        // C-02：クエリの整数は、標準の空白削除の後に十進数字だけかを見る
        $shopping = $this->categoryId('買い物');
        SavedItem::factory()->for($this->user)->create(['category_id' => $shopping]);

        $this->actingAsUser($this->user)
            ->getJson('/api/saved-items?category_id=%20'.$shopping.'%20')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();

        $this->actingAsUser($unverified)->getJson('/api/saved-items')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->getJson('/api/saved-items')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
