<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Arr;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-19 並べ替えた順番を保存する（F-15、V-10、D-03・D-24・D-31・D-59）。
 */
class ReorderPackingListItemsTest extends ListApiTestCase
{
    private const MESSAGE = '並べ替える持ち物の情報が正しくありません。リストを読み直してください。';

    private User $user;

    private PackingList $list;

    private PackingListGroup $group;

    /** @var array<string, PackingListItem> */
    private array $items;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 2,
            'updated_at' => now()->subDay(),
        ]);
        $this->group = PackingListGroup::factory()->for($this->list)->create();
        $this->items = [
            'A' => PackingListItem::factory()->for($this->list)->create(['name' => 'A', 'sort_order' => 1, 'is_checked' => true]),
            'B' => PackingListItem::factory()->for($this->list)->create(['name' => 'B', 'sort_order' => 2, 'group_id' => $this->group->id]),
            'C' => PackingListItem::factory()->for($this->list)->create(['name' => 'C', 'sort_order' => 3]),
            'D' => PackingListItem::factory()->for($this->list)->create(['name' => 'D', 'sort_order' => 4, 'deleted_at' => now()]),
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

    public function test_配列の順に番号を振り直し、204を返す(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", ['item_ids' => $this->ids(['C', 'A', 'B'])])
            ->assertNoContent();

        $response = $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk();
        $this->assertSame(['C', 'A', 'B'], array_column($response->json('data.items'), 'name'));

        // グループの所属とチェックは変えない
        $this->assertTrue($this->items['A']->fresh()->is_checked);
        $this->assertSame($this->items['B']->group_id, $this->items['B']->fresh()->group_id);

        $list = $this->list->fresh();
        // D-59・D-24
        $this->assertSame(3, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_並べ替えた後に削除済みを戻すと、一番下に入る(): void
    {
        // D-31：削除済みの番号は空になり、復元（API-25）では一番下に入る
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", ['item_ids' => $this->ids(['C', 'A', 'B'])])
            ->assertNoContent();
        $this->assertNull(PackingListItem::withTrashed()->find($this->items['D']->id)->sort_order);

        $this->actingAsUser($this->user)->postJson("/api/items/{$this->items['D']->id}/restore")->assertOk();

        $response = $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk();
        $this->assertSame(['C', 'A', 'B', 'D'], array_column($response->json('data.items'), 'name'));
    }

    public function test_持ち物が0件のリストだけ空の配列を受け付ける(): void
    {
        $empty = PackingList::factory()->for($this->user)->create();

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$empty->id}/items/order", ['item_ids' => []])
            ->assertNoContent();

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", ['item_ids' => []])
            ->assertUnprocessable()
            ->assertJsonPath('errors.item_ids', [self::MESSAGE]);
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>}>
     */
    public static function invalidBodies(): array
    {
        return [
            '不足' => [fn (self $t) => ['item_ids' => $t->ids(['C', 'A'])]],
            '重複' => [fn (self $t) => ['item_ids' => $t->ids(['C', 'A', 'B', 'A'])]],
            '削除済み' => [fn (self $t) => ['item_ids' => $t->ids(['C', 'A', 'B', 'D'])]],
            '他リストの持ち物' => [fn (self $t) => ['item_ids' => [...$t->ids(['C', 'A', 'B']), PackingListItem::factory()->create()->id]]],
            '存在しないID' => [fn (self $t) => ['item_ids' => [...$t->ids(['C', 'A']), 999999]]],
            '数字の文字列' => [fn (self $t) => ['item_ids' => array_map('strval', $t->ids(['C', 'A', 'B']))]],
            '小数' => [fn (self $t) => ['item_ids' => [1.5, ...$t->ids(['A', 'B'])]]],
            '0' => [fn (self $t) => ['item_ids' => [0, ...$t->ids(['A', 'B'])]]],
            '配列でない' => [fn (self $t) => ['item_ids' => $t->items['A']->id]],
            'キーつきの配列' => [fn (self $t) => ['item_ids' => ['a' => $t->items['A']->id]]],
            'null' => [fn (self $t) => ['item_ids' => null]],
            'なし' => [fn (self $t) => []],
            'グループを混ぜる' => [fn (self $t) => ['item_ids' => $t->ids(['C', 'A', 'B']), 'group_id' => 1]],
            // V-17：移動先（move）の違反
            '移動先が他リストのグループ' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['A']->id, 'group_id' => PackingListGroup::factory()->create()->id]]],
            '移動先が存在しないグループ' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['A']->id, 'group_id' => 999999]]],
            '並べ替えない持ち物を動かす' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['D']->id, 'group_id' => null]]],
            'moveが配列でない' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => 1]],
            'moveがnull' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => null]],
            'moveに定義外のキー' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['A']->id, 'group_id' => null, 'name' => 'x']]],
            'moveにgroup_idがない' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['A']->id]]],
            'moveのgroup_idが文字列' => [fn (self $t) => ['item_ids' => $t->ids(['B', 'A', 'C']), 'move' => ['item_id' => $t->items['A']->id, 'group_id' => (string) $t->group->id]]],
        ];
    }

    public function test_別のグループへ動かすと、所属と順番を一緒に保存する(): void
    {
        // D-98：未分類のAを、グループにいるBのすぐ後ろへ動かす
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", [
                'item_ids' => $this->ids(['B', 'A', 'C']),
                'move' => ['item_id' => $this->items['A']->id, 'group_id' => $this->group->id],
            ])
            ->assertNoContent();

        $response = $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk();
        $this->assertSame(['B', 'A', 'C'], array_column($response->json('data.items'), 'name'));
        $this->assertSame($this->group->id, $this->items['A']->fresh()->group_id);
        // 動かした1件だけ所属を変え、チェックは変えない
        $this->assertNull($this->items['C']->fresh()->group_id);
        $this->assertTrue($this->items['A']->fresh()->is_checked);
        $this->assertSame(3, $this->list->fresh()->grouping_revision);
    }

    public function test_未分類へ動かすと、所属を空にする(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", [
                'item_ids' => $this->ids(['A', 'C', 'B']),
                'move' => ['item_id' => $this->items['B']->id, 'group_id' => null],
            ])
            ->assertNoContent();

        $this->assertNull($this->items['B']->fresh()->group_id);
        $this->assertSame(3, $this->items['B']->fresh()->sort_order);
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_正しくなければ422で、順番もrevisionも変えない(\Closure $body): void
    {
        $response = $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", $body($this))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');

        // V-10：どの違反でも、item_ids か item_ids.0 などに読み直しの案内を出す（定義外の項目はその項目に出る）
        $errors = $response->json('errors');
        $this->assertTrue(
            in_array(self::MESSAGE, Arr::flatten($errors), true) || isset($errors['group_id']),
            json_encode($errors, JSON_UNESCAPED_UNICODE),
        );

        $this->assertSame([1, 2, 3], array_map(fn (string $name) => $this->items[$name]->fresh()->sort_order, ['A', 'B', 'C']));
        $this->assertSame(4, PackingListItem::withTrashed()->find($this->items['D']->id)->sort_order);
        // 所属も変えない
        $this->assertNull($this->items['A']->fresh()->group_id);
        $this->assertNull(PackingListItem::withTrashed()->find($this->items['D']->id)->group_id);
        $this->assertSame(2, $this->list->fresh()->grouping_revision);
    }

    public function test_他人のリストは存在しないリストと同じ404(): void
    {
        // D-43
        $othersItem = PackingListItem::factory()->create(['sort_order' => 1]);

        foreach ([$othersItem->packing_list_id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->patchJson("/api/lists/{$id}/items/order", ['item_ids' => [$othersItem->id]])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)
            ->patchJson("/api/lists/{$list->id}/items/order", ['item_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->patchJson("/api/lists/{$this->list->id}/items/order", ['item_ids' => $this->ids(['C', 'A', 'B'])])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
