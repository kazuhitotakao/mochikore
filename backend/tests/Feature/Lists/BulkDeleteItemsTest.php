<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Arr;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-38 選んだ持ち物とグループをまとめて削除する（F-26、V-20、D-100・D-51・D-24・D-59）。
 */
class BulkDeleteItemsTest extends ListApiTestCase
{
    private const MESSAGE = '削除する持ち物の情報が正しくありません。リストを読み直してください。';

    private const EMPTY_MESSAGE = '削除する持ち物を選んでください。';

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
            'is_public' => true,
            'grouping_revision' => 5,
            'updated_at' => now()->subDay(),
        ]);
        $this->group = PackingListGroup::factory()->for($this->list)->create();
        $this->items = [
            'A' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 1, 'group_id' => $this->group->id]),
            'B' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 2, 'is_checked' => true]),
            // 別の端末で足され、画面には見えていなかった持ち物
            'C' => PackingListItem::factory()->for($this->list)->create(['sort_order' => 3, 'group_id' => $this->group->id]),
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

    private function bulkDelete(array $body)
    {
        return $this->actingAsUser($this->user)->postJson("/api/lists/{$this->list->id}/items/bulk-delete", $body);
    }

    public function test_選んだ持ち物とグループを削除し、見えていなかった持ち物は未分類に残す(): void
    {
        $this->bulkDelete(['item_ids' => $this->ids(['A', 'B']), 'group_ids' => [$this->group->id]])
            ->assertOk()
            ->assertExactJson(['data' => ['is_public' => true]]);

        // 1件ずつの削除と同じ一時削除（D-35）
        $this->assertSoftDeleted($this->items['A']);
        $this->assertSoftDeleted($this->items['B']);
        $this->assertModelMissing($this->group);
        // D-100：送られていない持ち物は消さず、グループが消えたので未分類へ移る
        $this->assertNotSoftDeleted($this->items['C']);
        $this->assertNull($this->items['C']->fresh()->group_id);

        // D-24・D-59：構造が変わったので revision を増やし、一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(6, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_公開中のリストが0件になったら、自動で非公開にする(): void
    {
        // D-51
        $this->bulkDelete(['item_ids' => $this->ids(['A', 'B', 'C']), 'group_ids' => []])
            ->assertOk()
            ->assertExactJson(['data' => ['is_public' => false]]);

        $this->assertFalse($this->list->fresh()->is_public);
    }

    public function test_グループだけを選んで削除できる(): void
    {
        $empty = PackingListGroup::factory()->for($this->list)->create();

        $this->bulkDelete(['item_ids' => [], 'group_ids' => [$empty->id]])
            ->assertOk()
            ->assertExactJson(['data' => ['is_public' => true]]);

        $this->assertModelMissing($empty);
        $this->assertModelExists($this->group);
    }

    public function test_何も選んでいなければ422で、選ぶよう案内する(): void
    {
        $this->bulkDelete(['item_ids' => [], 'group_ids' => []])
            ->assertUnprocessable()
            ->assertJsonPath('errors.item_ids', [self::EMPTY_MESSAGE]);
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>}>
     */
    public static function invalidBodies(): array
    {
        return [
            '重複' => [fn (self $t) => ['item_ids' => $t->ids(['A', 'A']), 'group_ids' => []]],
            '削除済み' => [fn (self $t) => ['item_ids' => $t->ids(['A', 'D']), 'group_ids' => []]],
            '他リストの持ち物' => [fn (self $t) => ['item_ids' => [PackingListItem::factory()->create()->id], 'group_ids' => []]],
            '存在しない持ち物' => [fn (self $t) => ['item_ids' => [999999], 'group_ids' => []]],
            '他リストのグループ' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'group_ids' => [PackingListGroup::factory()->create()->id]]],
            'グループの重複' => [fn (self $t) => ['item_ids' => [], 'group_ids' => [$t->group->id, $t->group->id]]],
            '数字の文字列' => [fn (self $t) => ['item_ids' => array_map('strval', $t->ids(['A'])), 'group_ids' => []]],
            '0' => [fn (self $t) => ['item_ids' => [0], 'group_ids' => []]],
            '配列でない' => [fn (self $t) => ['item_ids' => $t->items['A']->id, 'group_ids' => []]],
            'item_idsがない' => [fn (self $t) => ['group_ids' => [$t->group->id]]],
            'group_idsがない' => [fn (self $t) => ['item_ids' => $t->ids(['A'])]],
            'group_idsがnull' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'group_ids' => null]],
            '定義外の項目' => [fn (self $t) => ['item_ids' => $t->ids(['A']), 'group_ids' => [], 'is_public' => false]],
        ];
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_正しくなければ422で、何も消さない(\Closure $body): void
    {
        $response = $this->bulkDelete($body($this))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');

        // V-20：どの違反でも読み直しを案内する（定義外の項目はその項目に出る）
        $errors = $response->json('errors');
        $this->assertTrue(
            in_array(self::MESSAGE, Arr::flatten($errors), true) || isset($errors['is_public']),
            json_encode($errors, JSON_UNESCAPED_UNICODE),
        );

        $this->assertNotSoftDeleted($this->items['A']);
        $this->assertNotSoftDeleted($this->items['B']);
        $this->assertModelExists($this->group);
        $list = $this->list->fresh();
        $this->assertSame(5, $list->grouping_revision);
        $this->assertTrue($list->is_public);
    }

    public function test_他人のリストは存在しないリストと同じ404(): void
    {
        // D-43
        $othersItem = PackingListItem::factory()->create();

        foreach ([$othersItem->packing_list_id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->postJson("/api/lists/{$id}/items/bulk-delete", ['item_ids' => [$othersItem->id], 'group_ids' => []])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertNotSoftDeleted($othersItem);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();
        $item = PackingListItem::factory()->for($list)->create();

        $this->actingAsUser($unverified)
            ->postJson("/api/lists/{$list->id}/items/bulk-delete", ['item_ids' => [$item->id], 'group_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/lists/{$this->list->id}/items/bulk-delete", ['item_ids' => $this->ids(['A']), 'group_ids' => []])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
