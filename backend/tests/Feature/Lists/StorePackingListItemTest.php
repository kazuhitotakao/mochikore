<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-10 持ち物の追加（F-05、V-08・C-05、D-24・D-29・D-34・D-59）。
 */
class StorePackingListItemTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create(['updated_at' => now()->subDay()]);
    }

    public function test_未分類・未チェックで末尾に追加し、持ち物1件を返す(): void
    {
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 4]);

        $response = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => ' 歯ブラシ ']);

        $item = PackingListItem::latest('id')->first();
        $response->assertCreated()->assertExactJson([
            'data' => [
                'id' => $item->id,
                'name' => '歯ブラシ',
                'group_id' => null,
                'sort_order' => 5,
                'is_checked' => false,
            ],
        ]);

        $list = $this->list->fresh();
        // D-59：構造を変えたので、分類の保存・一括追加の競合を見つけられるよう増やす
        $this->assertSame(1, $list->grouping_revision);
        // D-24：持ち物を追加したリストは一覧の上に戻る
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_削除済みの番号は使わず、削除していない持ち物の最大値の次にする(): void
    {
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 1]);
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 9, 'deleted_at' => now()]);

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '靴下'])
            ->assertCreated()
            ->assertJsonPath('data.sort_order', 2);
    }

    public function test_同じ名前でも別の持ち物として追加する(): void
    {
        // D-29
        foreach ([1, 2] as $_) {
            $this->actingAsUser($this->user)
                ->postJson("/api/lists/{$this->list->id}/items", ['name' => '靴下'])
                ->assertCreated();
        }

        $this->assertSame(2, $this->list->items()->where('name', '靴下')->count());
    }

    public function test_グループは受け取らず、未分類で追加する(): void
    {
        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '靴下', 'group_id' => 1, 'is_checked' => true])
            ->assertCreated()
            ->assertJsonPath('data.group_id', null)
            ->assertJsonPath('data.is_checked', false);
    }

    public function test_199件目までは追加でき、200件あれば422_item_limit_reachedで追加しない(): void
    {
        PackingListItem::factory()->count(199)->for($this->list)->create();
        // 削除済みは数えない
        PackingListItem::factory()->for($this->list)->create(['deleted_at' => now()]);

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '200件目'])
            ->assertCreated();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '201件目'])
            ->assertUnprocessable()
            ->assertExactJson(['message' => '持ち物は200件までです。', 'code' => 'item_limit_reached']);
        $this->assertSame(200, $this->list->items()->count());
        $this->assertSame(1, $this->list->fresh()->grouping_revision);
    }

    /**
     * @return array<string, array{mixed, string}>
     */
    public static function invalidNames(): array
    {
        return [
            'なし' => [null, '持ち物名を入力してください。'],
            '空白だけ' => [" \u{3000}", '持ち物名を入力してください。'],
            '文字でない' => [1, '持ち物名を文字で入力してください。'],
            '51文字' => [str_repeat('あ', 51), '持ち物名は50文字以内で入力してください。'],
            '途中に改行' => ["歯\nブラシ", '持ち物名は改行せずに入力してください。'],
            '途中にタブ' => ["歯\tブラシ", '持ち物名は改行せずに入力してください。'],
        ];
    }

    #[DataProvider('invalidNames')]
    public function test_名前が正しくなければ422で、追加しない(mixed $name, string $message): void
    {
        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => $name])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.name', [$message]);

        $this->assertSame(0, $this->list->items()->count());
        $this->assertSame(0, $this->list->fresh()->grouping_revision);
    }

    public function test_50文字はコードポイントで数えて受け付ける(): void
    {
        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => str_repeat('😀', 50)])
            ->assertCreated();
    }

    public function test_他人のリストには、存在しないリストと同じ404で追加しない(): void
    {
        // D-43
        $othersList = PackingList::factory()->create();

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->postJson("/api/lists/{$id}/items", ['name' => '靴下'])
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
            ->postJson("/api/lists/{$list->id}/items", ['name' => '靴下'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '靴下'])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
