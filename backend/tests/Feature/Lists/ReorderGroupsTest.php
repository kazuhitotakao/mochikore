<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Arr;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-36 グループの順番を保存する（F-24、V-18、D-98・D-24・D-59）。
 */
class ReorderGroupsTest extends ListApiTestCase
{
    private const MESSAGE = 'リストの情報を読み直してください。';

    private User $user;

    private PackingList $list;

    /** @var array<string, PackingListGroup> */
    private array $groups;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
        $this->groups = [
            'スーパー' => PackingListGroup::factory()->for($this->list)->create(['name' => 'スーパー', 'sort_order' => 0]),
            '薬局' => PackingListGroup::factory()->for($this->list)->create(['name' => '薬局', 'sort_order' => 1]),
            '100均' => PackingListGroup::factory()->for($this->list)->create(['name' => '100均', 'sort_order' => 2]),
        ];
    }

    /**
     * @param  list<string>  $names
     * @return list<int>
     */
    private function ids(array $names): array
    {
        return array_map(fn (string $name) => $this->groups[$name]->id, $names);
    }

    public function test_配列の順にグループの順番を振り直し、204を返す(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create([
            'sort_order' => 1,
            'group_id' => $this->groups['薬局']->id,
            'is_checked' => true,
        ]);

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/groups/order", ['group_ids' => $this->ids(['100均', 'スーパー', '薬局'])])
            ->assertNoContent();

        $response = $this->actingAsUser($this->user)->getJson("/api/lists/{$this->list->id}")->assertOk();
        $this->assertSame(['100均', 'スーパー', '薬局'], array_column($response->json('data.groups'), 'name'));
        $this->assertSame([0, 1, 2], array_column($response->json('data.groups'), 'sort_order'));

        // 持ち物の所属・順番・チェックは変えない
        $fresh = $item->fresh();
        $this->assertSame($this->groups['薬局']->id, $fresh->group_id);
        $this->assertSame(1, $fresh->sort_order);
        $this->assertTrue($fresh->is_checked);

        // D-24・D-59：構造の変更なので revision を増やし、一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(5, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_グループがないリストだけ空の配列を受け付ける(): void
    {
        $empty = PackingList::factory()->for($this->user)->create();

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$empty->id}/groups/order", ['group_ids' => []])
            ->assertNoContent();

        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/groups/order", ['group_ids' => []])
            ->assertUnprocessable()
            ->assertJsonPath('errors.group_ids', [self::MESSAGE]);
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>}>
     */
    public static function invalidBodies(): array
    {
        return [
            '不足' => [fn (self $t) => ['group_ids' => $t->ids(['100均', 'スーパー'])]],
            '重複' => [fn (self $t) => ['group_ids' => $t->ids(['100均', 'スーパー', '薬局', 'スーパー'])]],
            '他リストのグループ' => [fn (self $t) => ['group_ids' => [...$t->ids(['100均', 'スーパー', '薬局']), PackingListGroup::factory()->create()->id]]],
            '存在しないID' => [fn (self $t) => ['group_ids' => [...$t->ids(['100均', 'スーパー']), 999999]]],
            '数字の文字列' => [fn (self $t) => ['group_ids' => array_map('strval', $t->ids(['100均', 'スーパー', '薬局']))]],
            '0' => [fn (self $t) => ['group_ids' => [0, ...$t->ids(['スーパー', '薬局'])]]],
            '配列でない' => [fn (self $t) => ['group_ids' => $t->groups['薬局']->id]],
            'キーつきの配列' => [fn (self $t) => ['group_ids' => ['a' => $t->groups['薬局']->id]]],
            'null' => [fn (self $t) => ['group_ids' => null]],
            'なし' => [fn (self $t) => []],
        ];
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_正しくなければ422で、順番もrevisionも変えない(\Closure $body): void
    {
        $response = $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/groups/order", $body($this))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');

        // V-18：どの違反でも、group_ids か group_ids.0 などに読み直しの案内を出す（空の送信は _form）
        $errors = $response->json('errors');
        $this->assertTrue(
            in_array(self::MESSAGE, Arr::flatten($errors), true) || isset($errors['_form']),
            json_encode($errors, JSON_UNESCAPED_UNICODE),
        );

        $this->assertSame([0, 1, 2], array_map(fn (PackingListGroup $group) => $group->fresh()->sort_order, array_values($this->groups)));
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_他人のリストは存在しないリストと同じ404(): void
    {
        // D-43
        $othersGroup = PackingListGroup::factory()->create();

        foreach ([$othersGroup->packing_list_id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->patchJson("/api/lists/{$id}/groups/order", ['group_ids' => [$othersGroup->id]])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)
            ->patchJson("/api/lists/{$list->id}/groups/order", ['group_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->patchJson("/api/lists/{$this->list->id}/groups/order", ['group_ids' => $this->ids(['100均', 'スーパー', '薬局'])])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
