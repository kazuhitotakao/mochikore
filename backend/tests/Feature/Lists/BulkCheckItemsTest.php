<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Arr;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-37 選んだ持ち物をまとめてチェック・解除する（F-25、V-19、D-99・D-25）。
 */
class BulkCheckItemsTest extends ListApiTestCase
{
    private const MESSAGE = 'チェックする持ち物の情報が正しくありません。リストを読み直してください。';

    private const CHECK_MESSAGE = 'チェック状態が正しくありません。もう一度操作してください。';

    private User $user;

    private PackingList $list;

    /** @var array<string, PackingListItem> */
    private array $items;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 3,
            'updated_at' => now()->subDay(),
        ]);
        $group = PackingListGroup::factory()->for($this->list)->create();
        $this->items = [
            'A' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 1, 'group_id' => $group->id]),
            'B' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 2, 'group_id' => $group->id, 'is_checked' => true]),
            'C' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 3]),
            'D' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 4, 'deleted_at' => now()]),
        ];
    }

    /**
     * @param  list<string>  $names
     * @return list<int>
     */
    private function ids(array $names): array
    {
        return array_map(fn (string $name) => $this->items[$name]->id, $names);
    }

    public function test_指定した持ち物だけをまとめてチェックし、204を返す(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/checks", ['item_ids' => $this->ids(['A', 'B']), 'is_checked' => true])
            ->assertNoContent();

        $this->assertTrue($this->items['A']->fresh()->is_checked);
        $this->assertTrue($this->items['B']->fresh()->is_checked);
        // グループの外の持ち物は変えない
        $this->assertFalse($this->items['C']->fresh()->is_checked);

        // D-25：チェックだけなので、revision も親リストの更新日時も変えない（一覧の順番が変わらない）
        $list = $this->list->fresh();
        $this->assertSame(3, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isBefore(now()->subHours(12)));
    }

    public function test_まとめて外すこともできる(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/checks", ['item_ids' => $this->ids(['A', 'B']), 'is_checked' => false])
            ->assertNoContent();

        $this->assertFalse($this->items['A']->fresh()->is_checked);
        $this->assertFalse($this->items['B']->fresh()->is_checked);
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>}>
     */
    public static function invalidBodies(): array
    {
        return [
            '空の配列' => [fn (self $t) => ['item_ids' => [], 'is_checked' => true]],
            '重複' => [fn (self $t) => ['item_ids' => $t->ids(['A', 'A']), 'is_checked' => true]],
            '削除済み' => [fn (self $t) => ['item_ids' => $t->ids(['A', 'D']), 'is_checked' => true]],
            '他リストの持ち物' => [fn (self $t) => ['item_ids' => [...$t->ids(['A']), PackingListItem::factory()->create()->id], 'is_checked' => true]],
            '存在しないID' => [fn (self $t) => ['item_ids' => [...$t->ids(['A']), 999999], 'is_checked' => true]],
            '数字の文字列' => [fn (self $t) => ['item_ids' => array_map('strval', $t->ids(['A'])), 'is_checked' => true]],
            '0' => [fn (self $t) => ['item_ids' => [0], 'is_checked' => true]],
            '配列でない' => [fn (self $t) => ['item_ids' => $t->items['A']->id, 'is_checked' => true]],
            'item_idsがない' => [fn (self $t) => ['is_checked' => true]],
            'is_checkedが1' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'is_checked' => 1]],
            'is_checkedが文字列' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'is_checked' => 'true']],
            'is_checkedがnull' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'is_checked' => null]],
            'is_checkedがない' => [fn (self $t) => ['item_ids' => $t->ids(['A'])]],
            '定義外の項目' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'is_checked' => true, 'group_id' => 1]],
        ];
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_正しくなければ422で、チェックを変えない(\Closure $body): void
    {
        $response = $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/checks", $body($this))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');

        // V-19・V-09：持ち物の違反は読み直し、チェック状態の違反は操作のやり直しを案内する（定義外の項目はその項目に出る）
        $errors = $response->json('errors');
        $flat = Arr::flatten($errors);
        $this->assertTrue(
            in_array(self::MESSAGE, $flat, true) || in_array(self::CHECK_MESSAGE, $flat, true) || isset($errors['group_id']),
            json_encode($errors, JSON_UNESCAPED_UNICODE),
        );

        $this->assertFalse($this->items['A']->fresh()->is_checked);
        $this->assertTrue($this->items['B']->fresh()->is_checked);
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_他人のリストは存在しないリストと同じ404(): void
    {
        // D-43
        $othersItem = PackingListItem::factory()->create();

        foreach ([$othersItem->packing_list_id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->patchJson("/api/lists/{$id}/items/checks", ['item_ids' => [$othersItem->id], 'is_checked' => true])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertFalse($othersItem->fresh()->is_checked);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();
        $item = PackingListItem::factory()->for($list)->create();

        $this->actingAsUser($unverified)
            ->patchJson("/api/lists/{$list->id}/items/checks", ['item_ids' => [$item->id], 'is_checked' => true])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->patchJson("/api/lists/{$this->list->id}/items/checks", ['item_ids' => $this->ids(['A']), 'is_checked' => true])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
