<?php

namespace Tests\Feature\SavedGroups;

use App\Models\SavedGroup;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-40 よく使うグループの保存（F-28、V-21・C-05、D-102）。
 */
class StoreSavedGroupTest extends ListApiTestCase
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
        return $this->actingAsUser($this->user)->postJson('/api/saved-groups', $body);
    }

    public function test_グループ名とカテゴリー1つで保存し、201で候補を返す(): void
    {
        $categoryId = $this->categoryId('買い物');

        $response = $this->save(['name' => ' 冷蔵 ', 'category_id' => $categoryId]);

        $savedGroup = SavedGroup::sole();
        $response->assertCreated()->assertExactJson([
            'data' => [
                'id' => $savedGroup->id,
                'name' => '冷蔵',
                'category' => ['id' => $categoryId, 'name' => '買い物'],
            ],
        ]);
        $this->assertSame($this->user->id, $savedGroup->user_id);
    }

    public function test_同じカテゴリーの同名は増やさず、200で既存の候補を返す(): void
    {
        $existing = SavedGroup::factory()->for($this->user)->create([
            'name' => '冷蔵',
            'category_id' => $this->categoryId('買い物'),
        ]);

        // 前後の空白は Laravel 標準で削ってから比べる（V-21）
        $this->save(['name' => "\u{3000}冷蔵 ", 'category_id' => $this->categoryId('買い物')])
            ->assertOk()
            ->assertJsonPath('data.id', $existing->id);

        $this->assertSame(1, SavedGroup::count());
    }

    public function test_別のカテゴリーや別の名前なら、別の候補として保存する(): void
    {
        // D-102：照合順序が utf8mb4_bin なので「はは」と「ぱぱ」、大文字と小文字は別の名前
        $shopping = $this->categoryId('買い物');
        foreach ([
            ['冷蔵', $shopping],
            ['冷蔵', $this->categoryId('旅行・お泊まり')],
            ['はは', $shopping],
            ['ぱぱ', $shopping],
            ['Drug', $shopping],
            ['drug', $shopping],
        ] as [$name, $categoryId]) {
            $this->save(['name' => $name, 'category_id' => $categoryId])->assertCreated();
        }

        $this->assertSame(6, $this->user->savedGroups()->count());
    }

    public function test_ほかの人に同じ候補があっても、自分の候補として保存する(): void
    {
        SavedGroup::factory()->create(['name' => '冷蔵', 'category_id' => $this->categoryId('買い物')]);

        $this->save(['name' => '冷蔵', 'category_id' => $this->categoryId('買い物')])->assertCreated();

        $this->assertSame(1, $this->user->savedGroups()->count());
    }

    public function test_100件あれば新しい候補は422で、同名の既存候補は200で返す(): void
    {
        // D-102・V-21
        SavedGroup::factory()->count(99)->for($this->user)->create();
        $existing = SavedGroup::factory()->for($this->user)->create([
            'name' => '冷蔵',
            'category_id' => $this->categoryId('買い物'),
        ]);
        // ほかの人の候補と、よく使う項目（saved_items）は数えない
        SavedGroup::factory()->count(2)->create();

        $this->save(['name' => '薬局', 'category_id' => $this->categoryId('買い物')])
            ->assertUnprocessable()
            ->assertExactJson(['message' => '保存できるのは100件までです。', 'code' => 'saved_group_limit_reached']);

        $this->save(['name' => '冷蔵', 'category_id' => $this->categoryId('買い物')])
            ->assertOk()
            ->assertJsonPath('data.id', $existing->id);

        $this->assertSame(100, $this->user->savedGroups()->count());
    }

    public function test_99件なら100件目を保存できる(): void
    {
        SavedGroup::factory()->count(99)->for($this->user)->create();

        $this->save(['name' => '薬局', 'category_id' => $this->categoryId('買い物')])->assertCreated();

        $this->assertSame(100, $this->user->savedGroups()->count());
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        return [
            '名前なし' => [['name' => null], 'name', '保存するグループ名を入力してください。'],
            '名前が空白だけ' => [['name' => " \u{3000}"], 'name', '保存するグループ名を入力してください。'],
            '名前が文字でない' => [['name' => 1], 'name', 'グループ名を文字で入力してください。'],
            '名前が51文字' => [['name' => str_repeat('あ', 51)], 'name', 'グループ名は50文字以内で入力してください。'],
            '名前の途中に改行' => [['name' => "冷\n蔵"], 'name', 'グループ名は改行せずに入力してください。'],
            '名前の途中にタブ' => [['name' => "冷\t蔵"], 'name', 'グループ名は改行せずに入力してください。'],
            '予約名の未分類' => [['name' => '未分類'], 'name', 'このグループ名は使用できません。'],
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
        $this->save(['name' => '冷蔵', 'category_id' => $this->categoryId('買い物'), ...$override])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [$message]);

        $this->assertSame(0, SavedGroup::count());
    }

    public function test_50文字はコードポイントで数えて受け付ける(): void
    {
        $this->save(['name' => str_repeat('😀', 50), 'category_id' => $this->categoryId('その他')])->assertCreated();
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $body = ['name' => '冷蔵', 'category_id' => $this->categoryId('買い物')];

        $this->actingAsUser($unverified)->postJson('/api/saved-groups', $body)
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->postJson('/api/saved-groups', $body)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertSame(0, SavedGroup::count());
    }
}
