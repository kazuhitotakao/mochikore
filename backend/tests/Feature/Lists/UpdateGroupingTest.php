<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-30 グループ整理の保存（F-19、V-13・V-14、D-56〜D-61、06_API一覧「グループ整理のAPI仕様」）。
 */
class UpdateGroupingTest extends ListApiTestCase
{
    private const RELOAD = 'リストの情報を読み直してください。';

    private User $user;

    private PackingList $list;

    /** @var array<string, PackingListItem> */
    private array $items;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 5,
            'updated_at' => now()->subDay(),
        ]);
        $this->items = [
            'A' => PackingListItem::factory()->for($this->list)->create(['name' => 'A', 'sort_order' => 1, 'is_checked' => true]),
            'B' => PackingListItem::factory()->for($this->list)->create(['name' => 'B', 'sort_order' => 2]),
            'C' => PackingListItem::factory()->for($this->list)->create(['name' => 'C', 'sort_order' => 3]),
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function save(array $body, ?PackingList $list = null): TestResponse
    {
        $list ??= $this->list;

        return $this->actingAsUser($this->user)->putJson("/api/lists/{$list->id}/grouping", $body);
    }

    /**
     * @param  array<string, string|null>  $groupKeys  持ち物の名前 → group_key
     * @return list<array{item_id: int, group_key: string|null}>
     */
    private function assignments(array $groupKeys): array
    {
        return array_map(
            fn (string $name) => ['item_id' => $this->items[$name]->id, 'group_key' => $groupKeys[$name] ?? null],
            array_keys($this->items),
        );
    }

    public function test_新しいグループを作って分類し、最新の状態とkeyの対応を返す(): void
    {
        $response = $this->save([
            'base_revision' => 5,
            'groups' => [
                ['key' => 'g1', 'id' => null, 'name' => ' スーパー '],
                ['key' => 'g2', 'id' => null, 'name' => '薬局'],
            ],
            'assignments' => $this->assignments(['A' => 'g1', 'B' => 'g2', 'C' => null]),
        ]);

        $supermarket = PackingListGroup::where('name', 'スーパー')->sole();
        $pharmacy = PackingListGroup::where('name', '薬局')->sole();
        $response->assertOk()->assertExactJson([
            'data' => [
                'grouping_revision' => 6,
                'groups' => [
                    ['id' => $supermarket->id, 'name' => 'スーパー', 'sort_order' => 0],
                    ['id' => $pharmacy->id, 'name' => '薬局', 'sort_order' => 1],
                ],
                'items' => [
                    ['id' => $this->items['A']->id, 'name' => 'A', 'group_id' => $supermarket->id, 'sort_order' => 1, 'is_checked' => true],
                    ['id' => $this->items['B']->id, 'name' => 'B', 'group_id' => $pharmacy->id, 'sort_order' => 2, 'is_checked' => false],
                    ['id' => $this->items['C']->id, 'name' => 'C', 'group_id' => null, 'sort_order' => 3, 'is_checked' => false],
                ],
                'group_key_map' => ['g1' => $supermarket->id, 'g2' => $pharmacy->id],
            ],
        ]);

        // D-24：分類を保存したリストは一覧の上に戻る
        $this->assertTrue($this->list->fresh()->updated_at->isAfter(now()->subMinute()));
    }

    public function test_名前の変更・順番の入れ替え・送らなかったグループの削除をまとめて行う(): void
    {
        $first = PackingListGroup::factory()->for($this->list)->create(['name' => '洗面', 'sort_order' => 0]);
        $second = PackingListGroup::factory()->for($this->list)->create(['name' => '服', 'sort_order' => 1]);
        $this->items['A']->forceFill(['group_id' => $first->id])->save();
        $this->items['B']->forceFill(['group_id' => $second->id])->save();
        // 削除済みの持ち物：消えるグループにいれば未分類へ、残るグループならそのまま。番号も変えない
        $deletedInFirst = PackingListItem::factory()->for($this->list)->create(['group_id' => $first->id, 'sort_order' => 9, 'deleted_at' => now()]);
        $deletedInSecond = PackingListItem::factory()->for($this->list)->create(['group_id' => $second->id, 'sort_order' => 8, 'deleted_at' => now()]);

        $this->save([
            'base_revision' => 5,
            'groups' => [
                ['key' => 'new', 'id' => null, 'name' => '靴'],
                ['key' => 'kept', 'id' => $second->id, 'name' => '着替え'],
            ],
            'assignments' => $this->assignments(['A' => null, 'B' => 'kept', 'C' => 'new']),
        ])->assertOk();

        $this->assertModelMissing($first);
        $this->assertSame(['name' => '着替え', 'sort_order' => 1], $second->fresh()->only(['name', 'sort_order']));
        $this->assertSame(0, PackingListGroup::where('name', '靴')->value('sort_order'));
        $this->assertNull($this->items['A']->fresh()->group_id);

        $deletedInFirst = PackingListItem::withTrashed()->find($deletedInFirst->id);
        $deletedInSecond = PackingListItem::withTrashed()->find($deletedInSecond->id);
        $this->assertNull($deletedInFirst->group_id);
        $this->assertSame($second->id, $deletedInSecond->group_id);
        // 分類の保存だけでは、削除済みの番号を空にしない
        $this->assertSame([9, 8], [$deletedInFirst->sort_order, $deletedInSecond->sort_order]);
    }

    public function test_何も変えずに保存しても、revisionも更新日時も変えない(): void
    {
        // 12_手動テスト 28-05
        $group = PackingListGroup::factory()->for($this->list)->create(['name' => '洗面', 'sort_order' => 0]);
        $this->items['A']->forceFill(['group_id' => $group->id])->save();
        $before = $this->list->fresh()->updated_at->toJSON();

        $this->save([
            'base_revision' => 5,
            'groups' => [['key' => 'g', 'id' => $group->id, 'name' => '洗面']],
            'assignments' => $this->assignments(['A' => 'g']),
        ])
            ->assertOk()
            ->assertJsonPath('data.grouping_revision', 5)
            ->assertJsonPath('data.group_key_map', ['g' => $group->id]);

        $this->assertSame($before, $this->list->fresh()->updated_at->toJSON());
    }

    public function test_グループを全部なくすと、持ち物は残って未分類になる(): void
    {
        // 12_手動テスト 28-04
        $group = PackingListGroup::factory()->for($this->list)->create();
        $this->items['A']->forceFill(['group_id' => $group->id])->save();

        $this->save(['base_revision' => 5, 'groups' => [], 'assignments' => $this->assignments([])])
            ->assertOk()
            ->assertJsonPath('data.groups', [])
            ->assertJsonPath('data.group_key_map', []);

        $this->assertSame(3, $this->list->items()->whereNull('group_id')->count());
    }

    public function test_大文字小文字や濁点が違う名前は、別のグループ名として使える(): void
    {
        // D-57：空白を削った後の完全一致で比べる。表記の自動統合はしない
        $this->save([
            'base_revision' => 5,
            'groups' => [
                ['key' => 'a', 'id' => null, 'name' => 'Super'],
                ['key' => 'b', 'id' => null, 'name' => 'super'],
                ['key' => 'c', 'id' => null, 'name' => 'はは'],
                ['key' => 'd', 'id' => null, 'name' => 'ぱぱ'],
            ],
            'assignments' => $this->assignments([]),
        ])->assertOk();

        $this->assertSame(4, $this->list->groups()->count());
    }

    public function test_別のリストなら同じグループ名を使える(): void
    {
        // 12_手動テスト 25-04
        $other = PackingList::factory()->for($this->user)->create();
        PackingListGroup::factory()->for($other)->create(['name' => 'スーパー']);

        $this->save([
            'base_revision' => 5,
            'groups' => [['key' => 'g', 'id' => null, 'name' => 'スーパー']],
            'assignments' => $this->assignments([]),
        ])->assertOk();
    }

    public function test_20グループまで保存でき、21グループは422(): void
    {
        $groups = fn (int $count) => array_map(
            fn (int $i) => ['key' => "g{$i}", 'id' => null, 'name' => "グループ{$i}"],
            range(1, $count),
        );

        $this->save(['base_revision' => 5, 'groups' => $groups(21), 'assignments' => $this->assignments([])])
            ->assertUnprocessable()
            ->assertJsonPath('errors.groups', [self::RELOAD]);

        $this->save(['base_revision' => 5, 'groups' => $groups(20), 'assignments' => $this->assignments([])])
            ->assertOk();
        $this->assertSame(20, $this->list->groups()->count());
    }

    public function test_古いrevisionなら409で、何も変えない(): void
    {
        $body = [
            'base_revision' => 5,
            'groups' => [['key' => 'g', 'id' => null, 'name' => 'スーパー']],
            'assignments' => $this->assignments(['A' => 'g']),
        ];
        $this->save($body)->assertOk();

        // 応答が届かずに同じ下書きを送り直しても、グループを重複して作らない（12_手動テスト 34-04）
        $this->save($body)
            ->assertStatus(409)
            ->assertExactJson(['message' => 'リストが変更されています。読み直してください。', 'code' => 'grouping_conflict']);

        $this->assertSame(1, $this->list->groups()->count());
        $this->assertSame(6, $this->list->fresh()->grouping_revision);
    }

    /**
     * @return array<string, array{\Closure(self): array<string, mixed>, string}>
     */
    public static function invalidBodies(): array
    {
        $group = fn (string $name) => [['key' => 'g', 'id' => null, 'name' => $name]];

        return [
            'グループ名が空' => [fn (self $t) => ['groups' => $group('')], 'グループ名を入力してください。'],
            'グループ名が空白だけ' => [fn (self $t) => ['groups' => $group(" \u{3000}")], 'グループ名を入力してください。'],
            'グループ名が文字でない' => [fn (self $t) => ['groups' => [['key' => 'g', 'id' => null, 'name' => 1]]], 'グループ名を文字で入力してください。'],
            'グループ名が51文字' => [fn (self $t) => ['groups' => $group(str_repeat('あ', 51))], 'グループ名は50文字以内で入力してください。'],
            'グループ名の途中に改行' => [fn (self $t) => ['groups' => $group("スー\nパー")], 'グループ名は改行せずに入力してください。'],
            '予約名' => [fn (self $t) => ['groups' => $group('未分類')], 'このグループ名は使用できません。'],
            '空白付きの予約名' => [fn (self $t) => ['groups' => $group(' 未分類 ')], 'このグループ名は使用できません。'],
            '同じリストの同名' => [fn (self $t) => ['groups' => [['key' => 'a', 'id' => null, 'name' => 'スーパー'], ['key' => 'b', 'id' => null, 'name' => ' スーパー']]], '同じ名前のグループがあります。'],
            'keyの重複' => [fn (self $t) => ['groups' => [['key' => 'g', 'id' => null, 'name' => 'A'], ['key' => 'g', 'id' => null, 'name' => 'B']]], self::RELOAD],
            'keyに使えない文字' => [fn (self $t) => ['groups' => [['key' => 'g 1', 'id' => null, 'name' => 'A']]], self::RELOAD],
            'idがない' => [fn (self $t) => ['groups' => [['key' => 'g', 'name' => 'A']]], self::RELOAD],
            'ほかのリストのグループID' => [fn (self $t) => ['groups' => [['key' => 'g', 'id' => PackingListGroup::factory()->create()->id, 'name' => 'A']]], self::RELOAD],
            '存在しないグループID' => [fn (self $t) => ['groups' => [['key' => 'g', 'id' => 999999, 'name' => 'A']]], self::RELOAD],
            '所属が足りない' => [fn (self $t) => ['assignments' => array_slice($t->assignments([]), 0, 2)], self::RELOAD],
            '所属の重複' => [fn (self $t) => ['assignments' => [...$t->assignments([]), ['item_id' => $t->items['A']->id, 'group_key' => null]]], self::RELOAD],
            'ほかのリストの持ち物' => [fn (self $t) => ['assignments' => [...$t->assignments([]), ['item_id' => PackingListItem::factory()->create()->id, 'group_key' => null]]], self::RELOAD],
            '削除済みの持ち物' => [fn (self $t) => ['assignments' => [...$t->assignments([]), ['item_id' => PackingListItem::factory()->for($t->list)->create(['deleted_at' => now()])->id, 'group_key' => null]]], self::RELOAD],
            '知らないgroup_key' => [fn (self $t) => ['assignments' => $t->assignments(['A' => 'unknown'])], self::RELOAD],
            'revisionが文字列' => [fn (self $t) => ['base_revision' => '5'], 'リストの更新情報が正しくありません。読み直してください。'],
        ];
    }

    /**
     * @param  \Closure(self): array<string, mixed>  $override
     */
    #[DataProvider('invalidBodies')]
    public function test_正しくなければ422で、何も変えない(\Closure $override, string $message): void
    {
        $response = $this->save([
            'base_revision' => 5,
            'groups' => [],
            'assignments' => $this->assignments([]),
            ...$override($this),
        ])->assertUnprocessable()->assertJsonPath('code', 'validation_error');

        // V-14：項目パスは groups.0.name・assignments など
        $this->assertContains($message, Arr::flatten($response->json('errors')));
        $this->assertSame(0, $this->list->groups()->count());
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    public function test_他人のリストは存在しないリストと同じ404(): void
    {
        $othersList = PackingList::factory()->create();

        foreach ([$othersList->id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->putJson("/api/lists/{$id}/grouping", ['base_revision' => 0, 'groups' => [], 'assignments' => []])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)
            ->putJson("/api/lists/{$list->id}/grouping", ['base_revision' => 0, 'groups' => [], 'assignments' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->putJson("/api/lists/{$this->list->id}/grouping", ['base_revision' => 5, 'groups' => [], 'assignments' => []])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
