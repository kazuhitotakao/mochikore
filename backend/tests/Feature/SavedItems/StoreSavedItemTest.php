<?php

namespace Tests\Feature\SavedItems;

use App\Models\SavedItem;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-32 よく使う項目の保存（F-21、V-11・C-05、D-66・D-68・D-72）。
 */
class StoreSavedItemTest extends ListApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function save(array $body): TestResponse
    {
        return $this->actingAsUser($this->user)->postJson('/api/saved-items', $body);
    }

    public function test_名前とカテゴリー1つで保存し、201で候補を返す(): void
    {
        $categoryId = $this->categoryId('買い物');

        $response = $this->save(['name' => ' 牛乳 ', 'category_id' => $categoryId]);

        $savedItem = SavedItem::sole();
        $response->assertCreated()->assertExactJson([
            'data' => [
                'id' => $savedItem->id,
                'name' => '牛乳',
                'category' => ['id' => $categoryId, 'name' => '買い物'],
            ],
        ]);
        $this->assertSame($this->user->id, $savedItem->user_id);
    }

    public function test_同じカテゴリーの同名は増やさず、200で既存の候補を返す(): void
    {
        $existing = SavedItem::factory()->for($this->user)->create([
            'name' => '牛乳',
            'category_id' => $this->categoryId('買い物'),
        ]);

        // 前後の空白は Laravel 標準で削ってから比べる（V-11）
        $this->save(['name' => "\u{3000}牛乳 ", 'category_id' => $this->categoryId('買い物')])
            ->assertOk()
            ->assertJsonPath('data.id', $existing->id);

        $this->assertSame(1, SavedItem::count());
    }

    public function test_別のカテゴリーや別の名前なら、別の候補として保存する(): void
    {
        // D-66：照合順序が utf8mb4_bin なので「はは」と「ぱぱ」、大文字と小文字は別の名前
        $shopping = $this->categoryId('買い物');
        foreach ([
            ['牛乳', $shopping],
            ['牛乳', $this->categoryId('旅行・お泊まり')],
            ['はは', $shopping],
            ['ぱぱ', $shopping],
            ['Milk', $shopping],
            ['milk', $shopping],
        ] as [$name, $categoryId]) {
            $this->save(['name' => $name, 'category_id' => $categoryId])->assertCreated();
        }

        $this->assertSame(6, $this->user->savedItems()->count());
    }

    public function test_ほかの人に同じ候補があっても、自分の候補として保存する(): void
    {
        SavedItem::factory()->create(['name' => '牛乳', 'category_id' => $this->categoryId('買い物')]);

        $this->save(['name' => '牛乳', 'category_id' => $this->categoryId('買い物')])->assertCreated();

        $this->assertSame(1, $this->user->savedItems()->count());
    }

    public function test_200件あれば新しい候補は422で、同名の既存候補は200で返す(): void
    {
        // D-72・V-11
        SavedItem::factory()->count(199)->for($this->user)->create();
        $existing = SavedItem::factory()->for($this->user)->create([
            'name' => '牛乳',
            'category_id' => $this->categoryId('買い物'),
        ]);
        // ほかの人の候補は数えない
        SavedItem::factory()->count(2)->create();

        $this->save(['name' => '卵', 'category_id' => $this->categoryId('買い物')])
            ->assertUnprocessable()
            ->assertExactJson(['message' => '保存できるのは200件までです。', 'code' => 'saved_item_limit_reached']);

        $this->save(['name' => '牛乳', 'category_id' => $this->categoryId('買い物')])
            ->assertOk()
            ->assertJsonPath('data.id', $existing->id);

        $this->assertSame(200, $this->user->savedItems()->count());
    }

    public function test_199件なら200件目を保存できる(): void
    {
        SavedItem::factory()->count(199)->for($this->user)->create();

        $this->save(['name' => '卵', 'category_id' => $this->categoryId('買い物')])->assertCreated();

        $this->assertSame(200, $this->user->savedItems()->count());
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        return [
            '名前なし' => [['name' => null], 'name', '保存する項目名を入力してください。'],
            '名前が空白だけ' => [['name' => " \u{3000}"], 'name', '保存する項目名を入力してください。'],
            '名前が文字でない' => [['name' => 1], 'name', '項目名を文字で入力してください。'],
            '名前が51文字' => [['name' => str_repeat('あ', 51)], 'name', '項目名は50文字以内で入力してください。'],
            '名前の途中に改行' => [['name' => "牛\n乳"], 'name', '項目名は改行せずに入力してください。'],
            'カテゴリーなし' => [['category_id' => null], 'category_id', 'カテゴリーを選択してください。'],
            'カテゴリーが数字の文字列' => [['category_id' => '1'], 'category_id', '有効なカテゴリーを選択してください。'],
            '存在しないカテゴリー' => [['category_id' => 999999], 'category_id', '有効なカテゴリーを選択してください。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('invalidInputs')]
    public function test_入力が正しくなければ422で、保存しない(array $override, string $field, string $message): void
    {
        $this->save(['name' => '牛乳', 'category_id' => $this->categoryId('買い物'), ...$override])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [$message]);

        $this->assertSame(0, SavedItem::count());
    }

    public function test_50文字はコードポイントで数えて受け付ける(): void
    {
        $this->save(['name' => str_repeat('😀', 50), 'category_id' => $this->categoryId('その他')])->assertCreated();
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $body = ['name' => '牛乳', 'category_id' => $this->categoryId('買い物')];

        $this->actingAsUser($unverified)->postJson('/api/saved-items', $body)
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->postJson('/api/saved-items', $body)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertSame(0, SavedItem::count());
    }
}
