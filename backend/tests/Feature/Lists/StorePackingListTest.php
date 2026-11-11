<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-06 リストの作成（F-03、V-04〜06・C-01〜05、D-16・D-21・D-30・D-50）。
 */
class StorePackingListTest extends ListApiTestCase
{
    public function test_リストを非公開で作成し、リスト本体を返す(): void
    {
        $user = User::factory()->create();
        $categoryId = $this->categoryId('買い物');

        $response = $this->actingAsUser($user)->postJson('/api/lists', [
            'title' => '週末の買い物',
            'category_id' => $categoryId,
            'description' => '駅前のスーパー',
        ]);

        $list = PackingList::sole();
        $response->assertCreated()->assertExactJson([
            'data' => [
                'id' => $list->id,
                'title' => '週末の買い物',
                'description' => '駅前のスーパー',
                'category' => ['id' => $categoryId, 'name' => '買い物'],
                // D-16：最初は非公開
                'is_public' => false,
                'moderated_at' => null,
                'updated_at' => $list->updated_at->toJSON(),
            ],
        ]);
        $this->assertSame($user->id, $list->user_id);
        $this->assertSame(0, $list->grouping_revision);
    }

    public function test_説明文は省略・空欄・空白だけならnullで保存する(): void
    {
        // D-21：リスト名とカテゴリーだけで作れる
        $user = User::factory()->create();

        foreach ([[], ['description' => ''], ['description' => " \u{3000}\n"], ['description' => null]] as $extra) {
            $this->actingAsUser($user)
                ->postJson('/api/lists', ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり'), ...$extra])
                ->assertCreated()
                ->assertJsonPath('data.description', null);
        }
    }

    public function test_前後の空白を削り、説明文の途中の改行はそろえて残す(): void
    {
        $user = User::factory()->create();

        $this->actingAsUser($user)->postJson('/api/lists', [
            'title' => "\u{3000} 旅行 \t",
            'category_id' => $this->categoryId('旅行・お泊まり'),
            'description' => " 前文\r\n 中 \r後文 \n",
        ])
            ->assertCreated()
            ->assertJsonPath('data.title', '旅行')
            ->assertJsonPath('data.description', "前文\n 中 \n後文");
    }

    public function test_同じ名前のリストも別のリストとして作れる(): void
    {
        // D-30
        $user = User::factory()->create();
        $body = ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり')];

        $first = $this->actingAsUser($user)->postJson('/api/lists', $body)->assertCreated()->json('data.id');
        $second = $this->actingAsUser($user)->postJson('/api/lists', $body)->assertCreated()->json('data.id');

        $this->assertNotSame($first, $second);
        $this->assertSame(2, $user->packingLists()->count());
    }

    public function test_境界の文字数はコードポイントで数えて受け付ける(): void
    {
        $user = User::factory()->create();

        $this->actingAsUser($user)->postJson('/api/lists', [
            // C-01：絵文字1つは1文字。UTF-16では100文字分になる
            'title' => str_repeat('😀', 50),
            'category_id' => $this->categoryId('その他'),
            // 改行をLFにそろえた後で500文字
            'description' => str_repeat('あ', 249)."\r\n".str_repeat('い', 250),
        ])->assertCreated();
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        return [
            'リスト名なし' => [['title' => null], 'title', 'リスト名を入力してください。'],
            'リスト名が空白だけ' => [['title' => " \u{3000}\t"], 'title', 'リスト名を入力してください。'],
            'リスト名が文字でない' => [['title' => 123], 'title', 'リスト名を文字で入力してください。'],
            'リスト名が51文字' => [['title' => str_repeat('あ', 51)], 'title', 'リスト名は50文字以内で入力してください。'],
            'リスト名の途中に改行' => [['title' => "旅行\n準備"], 'title', 'リスト名は改行せずに入力してください。'],
            'リスト名の途中にタブ' => [['title' => "旅行\t準備"], 'title', 'リスト名は改行せずに入力してください。'],
            'カテゴリーなし' => [['category_id' => null], 'category_id', 'カテゴリーを選択してください。'],
            'カテゴリーが空文字' => [['category_id' => ''], 'category_id', 'カテゴリーを選択してください。'],
            'カテゴリーが数字の文字列' => [['category_id' => '1'], 'category_id', '有効なカテゴリーを選択してください。'],
            'カテゴリーが小数' => [['category_id' => 1.5], 'category_id', '有効なカテゴリーを選択してください。'],
            'カテゴリーがtrue' => [['category_id' => true], 'category_id', '有効なカテゴリーを選択してください。'],
            'カテゴリーが0' => [['category_id' => 0], 'category_id', '有効なカテゴリーを選択してください。'],
            'カテゴリーが負数' => [['category_id' => -1], 'category_id', '有効なカテゴリーを選択してください。'],
            '存在しないカテゴリー' => [['category_id' => 999999], 'category_id', '有効なカテゴリーを選択してください。'],
            '説明文が文字でない' => [['description' => 123], 'description', '説明文を文字で入力してください。'],
            '説明文が配列' => [['description' => ['a']], 'description', '説明文を文字で入力してください。'],
            '説明文が501文字' => [['description' => str_repeat('あ', 501)], 'description', '説明文は500文字以内で入力してください。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('invalidInputs')]
    public function test_入力が正しくなければ422で、保存しない(array $override, string $field, string $message): void
    {
        $user = User::factory()->create();
        $body = [
            'title' => '旅行',
            'category_id' => $this->categoryId('旅行・お泊まり'),
            ...$override,
        ];

        $this->actingAsUser($user)->postJson('/api/lists', $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            // C-04：1項目1文
            ->assertJsonPath("errors.{$field}", [$message]);

        $this->assertSame(0, PackingList::count());
    }

    public function test_空の送信では、すべての必須項目のエラーを返す(): void
    {
        $user = User::factory()->create();

        $this->actingAsUser($user)->postJson('/api/lists', [])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => '入力内容を確認してください。',
                'code' => 'validation_error',
                'errors' => [
                    'title' => ['リスト名を入力してください。'],
                    'category_id' => ['カテゴリーを選択してください。'],
                ],
            ]);
    }

    public function test_公開設定や作成者は受け取らない(): void
    {
        // D-16：公開はAPI-14で本人が切り替える。作成者はログインした本人
        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->actingAsUser($user)->postJson('/api/lists', [
            'title' => '旅行',
            'category_id' => $this->categoryId('旅行・お泊まり'),
            'is_public' => true,
            'user_id' => $other->id,
            'grouping_revision' => 5,
        ])->assertCreated()->assertJsonPath('data.is_public', false);

        $list = PackingList::sole();
        $this->assertSame($user->id, $list->user_id);
        $this->assertSame(0, $list->grouping_revision);
    }

    public function test_100件目までは作れて、101件目は422_list_limit_reachedで作らない(): void
    {
        // D-50：非公開・公開・コピーしたリストをすべて数える
        $user = User::factory()->create();
        PackingList::factory()->count(98)->for($user)->create();
        PackingList::factory()->for($user)->create(['is_public' => true]);
        // ほかの人のリストは数えない
        PackingList::factory()->count(3)->create();
        $body = ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり')];

        $this->actingAsUser($user)->postJson('/api/lists', $body)->assertCreated();

        $this->actingAsUser($user)->postJson('/api/lists', $body)
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'リストは100件までです。',
                'code' => 'list_limit_reached',
            ]);
        $this->assertSame(100, $user->packingLists()->count());
    }

    public function test_ログインしていなければ401(): void
    {
        $this->postJson('/api/lists', ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり')])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }

    public function test_メール未認証なら403で、作らない(): void
    {
        $user = User::factory()->unverified()->create();

        $this->actingAsUser($user)
            ->postJson('/api/lists', ['title' => '旅行', 'category_id' => $this->categoryId('旅行・お泊まり')])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
        $this->assertSame(0, PackingList::count());
    }
}
