<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-08 リストの編集（F-04、V-04〜06・C-03・C-04、D-24・D-30）。
 */
class UpdatePackingListTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'title' => '旅行',
            'description' => 'メモ',
            'category_id' => $this->categoryId('旅行・お泊まり'),
            'updated_at' => now()->subDay(),
        ]);
    }

    public function test_名前・カテゴリー・説明文を変えて、リスト本体を返す(): void
    {
        $response = $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}", [
            'title' => ' 週末の買い物 ',
            'category_id' => $this->categoryId('買い物'),
            'description' => "前文\r\n後文",
        ]);

        $list = $this->list->fresh();
        $response->assertOk()->assertExactJson([
            'data' => [
                'id' => $list->id,
                'title' => '週末の買い物',
                'description' => "前文\n後文",
                'category' => ['id' => $this->categoryId('買い物'), 'name' => '買い物'],
                'is_public' => false,
                'moderated_at' => null,
                'updated_at' => $list->updated_at->toJSON(),
            ],
        ]);
        // D-24：内容を直したリストは一覧の上に戻る
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_送らなかった項目は変えない(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}", ['title' => '新しい名前'])
            ->assertOk();

        $list = $this->list->fresh();
        $this->assertSame('新しい名前', $list->title);
        $this->assertSame('メモ', $list->description);
        $this->assertSame($this->categoryId('旅行・お泊まり'), $list->category_id);
    }

    public function test_説明文は空文字・空白だけ・nullで消せる(): void
    {
        foreach (['', " \u{3000}\n", null] as $description) {
            $this->list->update(['description' => 'メモ']);

            $this->actingAsUser($this->user)
                ->patchJson("/api/lists/{$this->list->id}", ['description' => $description])
                ->assertOk()
                ->assertJsonPath('data.description', null);
            $this->assertNull($this->list->fresh()->description);
        }
    }

    public function test_同じ名前のほかのリストがあっても変えられ、そのリストには影響しない(): void
    {
        // D-30
        $other = PackingList::factory()->for($this->user)->create(['title' => '買い物']);

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}", ['title' => '買い物'])
            ->assertOk();

        $this->assertSame('買い物', $this->list->fresh()->title);
        $this->assertSame($other->updated_at->toJSON(), $other->fresh()->updated_at->toJSON());
    }

    public function test_同じ内容を送っただけでは更新日時を変えない(): void
    {
        $before = $this->list->updated_at->toJSON();

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}", ['title' => '旅行', 'description' => 'メモ'])
            ->assertOk();

        $this->assertSame($before, $this->list->fresh()->updated_at->toJSON());
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        return [
            'リスト名がnull' => [['title' => null], 'title', 'リスト名を入力してください。'],
            'リスト名が空文字' => [['title' => ''], 'title', 'リスト名を入力してください。'],
            'リスト名が51文字' => [['title' => str_repeat('あ', 51)], 'title', 'リスト名は50文字以内で入力してください。'],
            'リスト名の途中に改行' => [['title' => "旅行\r\n準備"], 'title', 'リスト名は改行せずに入力してください。'],
            'カテゴリーがnull' => [['category_id' => null], 'category_id', 'カテゴリーを選択してください。'],
            'カテゴリーが数字の文字列' => [['category_id' => '1'], 'category_id', '有効なカテゴリーを選択してください。'],
            '存在しないカテゴリー' => [['category_id' => 999999], 'category_id', '有効なカテゴリーを選択してください。'],
            '説明文が501文字' => [['description' => str_repeat('あ', 501)], 'description', '説明文は500文字以内で入力してください。'],
            '説明文が文字でない' => [['description' => 1], 'description', '説明文を文字で入力してください。'],
            '空の送信' => [[], '_form', '変更する項目を入力してください。'],
            '公開設定を混ぜる' => [['title' => '新しい名前', 'is_public' => true], 'is_public', 'この項目は送信できません。'],
            '作成者を混ぜる' => [['title' => '新しい名前', 'user_id' => 1], 'user_id', 'この項目は送信できません。'],
            'グループの連番を混ぜる' => [['grouping_revision' => 9], 'grouping_revision', 'この項目は送信できません。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidInputs')]
    public function test_入力が正しくなければ422で、何も変えない(array $body, string $field, string $message): void
    {
        $before = $this->list->fresh()->getAttributes();

        $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [$message]);

        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_他人のリストは存在しないリストと同じ404で、変えない(): void
    {
        // D-43
        $othersList = PackingList::factory()->create(['title' => 'ほかの人']);

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->patchJson("/api/lists/{$id}", ['title' => '乗っ取り'])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertSame('ほかの人', $othersList->fresh()->title);
    }

    public function test_メール未認証なら403(): void
    {
        $user = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($user)->create();

        $this->actingAsUser($user)
            ->patchJson("/api/lists/{$list->id}", ['title' => '新しい名前'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
    }

    public function test_ログインしていなければ401(): void
    {
        $this->patchJson("/api/lists/{$this->list->id}", ['title' => '新しい名前'])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
