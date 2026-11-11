<?php

namespace Tests\Feature\SavedItems;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\SavedItem;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-34 よく使う項目から一括追加（F-22、V-12・V-13、D-34・D-59・D-66・D-68）。
 */
class BulkAddItemsTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private SavedItem $milk;

    private SavedItem $egg;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 3,
            'updated_at' => now()->subDay(),
        ]);
        $this->milk = SavedItem::factory()->for($this->user)->create(['name' => '牛乳', 'category_id' => $this->categoryId('買い物')]);
        $this->egg = SavedItem::factory()->for($this->user)->create(['name' => '卵', 'category_id' => $this->categoryId('買い物')]);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function bulk(array $body, ?PackingList $list = null): TestResponse
    {
        $list ??= $this->list;

        return $this->actingAsUser($this->user)->postJson("/api/lists/{$list->id}/items/bulk", $body);
    }

    public function test_選んだ順に、未チェック・未分類で末尾へ追加し、201で返す(): void
    {
        $group = PackingListGroup::factory()->for($this->list)->create();
        $checked = PackingListItem::factory()->for($this->list)->create(['name' => '歯ブラシ', 'sort_order' => 1, 'is_checked' => true, 'group_id' => $group->id]);
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 5]);

        $response = $this->bulk(['saved_item_ids' => [$this->egg->id, $this->milk->id], 'base_revision' => 3]);

        $added = $this->list->items()->orderBy('sort_order')->get()->slice(2)->values();
        $response->assertCreated()->assertExactJson([
            'data' => [
                'grouping_revision' => 4,
                'items' => [
                    ['id' => $added[0]->id, 'name' => '卵', 'group_id' => null, 'sort_order' => 6, 'is_checked' => false],
                    ['id' => $added[1]->id, 'name' => '牛乳', 'group_id' => null, 'sort_order' => 7, 'is_checked' => false],
                ],
            ],
        ]);

        // 既にある持ち物のチェック・所属・順番は変えない
        $checked = $checked->fresh();
        $this->assertTrue($checked->is_checked);
        $this->assertSame($group->id, $checked->group_id);
        // D-66：保存元は残る
        $this->assertModelExists($this->milk);
        $this->assertModelExists($this->egg);
        // D-24：追加したリストは一覧の上に戻る
        $this->assertTrue($this->list->fresh()->updated_at->isAfter(now()->subMinute()));
    }

    public function test_同じ名前でも別の候補なら、別々の持ち物として追加する(): void
    {
        // V-12：名前が同じでも、異なる有効な候補IDなら別々に追加できる
        $travelMilk = SavedItem::factory()->for($this->user)->create(['name' => '牛乳', 'category_id' => $this->categoryId('旅行・お泊まり')]);
        PackingListItem::factory()->for($this->list)->create(['name' => '牛乳']);

        $this->bulk(['saved_item_ids' => [$this->milk->id, $travelMilk->id], 'base_revision' => 3])->assertCreated();

        $this->assertSame(3, $this->list->items()->where('name', '牛乳')->count());
    }

    public function test_古いrevisionなら409で、何も追加しない(): void
    {
        $this->bulk(['saved_item_ids' => [$this->milk->id], 'base_revision' => 2])
            ->assertStatus(409)
            ->assertExactJson(['message' => 'リストが変更されています。読み直してください。', 'code' => 'grouping_conflict']);

        $this->assertSame(0, $this->list->items()->count());
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_応答が届かずに同じ内容で送り直しても、二重に追加しない(): void
    {
        $body = ['saved_item_ids' => [$this->milk->id], 'base_revision' => 3];
        $this->bulk($body)->assertCreated();

        $this->bulk($body)->assertStatus(409)->assertJsonPath('code', 'grouping_conflict');

        $this->assertSame(1, $this->list->items()->count());
    }

    public function test_他人の候補・存在しない候補が1つでもあれば422で、全部追加しない(): void
    {
        $othersItem = SavedItem::factory()->create();

        foreach ([$othersItem->id, 999999] as $invalidId) {
            $this->bulk(['saved_item_ids' => [$this->milk->id, $invalidId], 'base_revision' => 3])
                ->assertUnprocessable()
                ->assertJsonPath('errors.saved_item_ids', ['追加する項目を選び直してください。']);
        }

        $this->assertSame(0, $this->list->items()->count());
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_199件に1件は追加でき、2件は全体を422で拒否する(): void
    {
        // D-34・12_手動テスト 38-01
        PackingListItem::factory()->count(199)->for($this->list)->create();

        $this->bulk(['saved_item_ids' => [$this->milk->id, $this->egg->id], 'base_revision' => 3])
            ->assertUnprocessable()
            ->assertExactJson(['message' => '持ち物は200件までです。', 'code' => 'item_limit_reached']);
        $this->assertSame(199, $this->list->items()->count());

        $this->bulk(['saved_item_ids' => [$this->milk->id], 'base_revision' => 3])->assertCreated();
        $this->assertSame(200, $this->list->items()->count());
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>, string}>
     */
    public static function invalidBodies(): array
    {
        $none = '追加する項目を1件以上選択してください。';
        $choose = '追加する項目を選び直してください。';
        $revision = 'リストの更新情報が正しくありません。読み直してください。';

        return [
            '候補が空の配列' => [fn (self $t) => ['saved_item_ids' => [], 'base_revision' => 3], $none],
            '候補がnull' => [fn (self $t) => ['saved_item_ids' => null, 'base_revision' => 3], $none],
            '候補が配列でない' => [fn (self $t) => ['saved_item_ids' => $t->milk->id, 'base_revision' => 3], $choose],
            '候補が201個' => [fn (self $t) => ['saved_item_ids' => range(1, 201), 'base_revision' => 3], $choose],
            '候補の重複' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id, $t->milk->id], 'base_revision' => 3], $choose],
            '候補が数字の文字列' => [fn (self $t) => ['saved_item_ids' => [(string) $t->milk->id], 'base_revision' => 3], $choose],
            '候補が0' => [fn (self $t) => ['saved_item_ids' => [0], 'base_revision' => 3], $choose],
            'revisionなし' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id]], $revision],
            'revisionがnull' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id], 'base_revision' => null], $revision],
            'revisionが負数' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id], 'base_revision' => -1], $revision],
            'revisionが小数' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id], 'base_revision' => 1.5], $revision],
            'revisionが数字の文字列' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id], 'base_revision' => '3'], $revision],
            'revisionが安全整数の範囲外' => [fn (self $t) => ['saved_item_ids' => [$t->milk->id], 'base_revision' => 9007199254740992], $revision],
        ];
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で、何も変えない(\Closure $body, string $message): void
    {
        $response = $this->bulk($body($this))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');

        // V-12：項目パスは saved_item_ids か saved_item_ids.0 など
        $this->assertContains($message, Arr::flatten($response->json('errors')));
        $this->assertSame(0, $this->list->items()->count());
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_追加先が他人のリストなら、存在しないリストと同じ404(): void
    {
        $othersList = PackingList::factory()->create();

        foreach ([$othersList, null] as $target) {
            $url = $target ? "/api/lists/{$target->id}/items/bulk" : '/api/lists/999999/items/bulk';
            $this->actingAsUser($this->user)
                ->postJson($url, ['saved_item_ids' => [$this->milk->id], 'base_revision' => 0])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertSame(0, $othersList->items()->count());
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)
            ->postJson("/api/lists/{$list->id}/items/bulk", ['saved_item_ids' => [1], 'base_revision' => 0])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/lists/{$this->list->id}/items/bulk", ['saved_item_ids' => [$this->milk->id], 'base_revision' => 3])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertSame(0, $this->list->items()->count());
    }
}
