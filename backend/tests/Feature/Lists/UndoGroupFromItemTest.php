<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-64 重ねてグループにしたのを元に戻す（D-123、V-30、D-24・D-59・D-97・D-111）。
 */
class UndoGroupFromItemTest extends ListApiTestCase
{
    private const MESSAGE = 'リストが変わったため、元に戻せません。リストを読み直してください。';

    private User $user;

    private PackingList $list;

    // 重ねた持ち物が、もともと入っていたグループ
    private PackingListGroup $group;

    // 重ねられる側（グループの外）。重ねると見出しに変わる
    private PackingListItem $base;

    // 重ねる側（グループ「スーパー」の中・チェック済み）
    private PackingListItem $moved;

    // 重ねてできたグループ
    private PackingListGroup $created;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create(['grouping_revision' => 4]);
        $this->group = PackingListGroup::factory()->for($this->list)->create(['name' => 'スーパー', 'sort_order' => 0]);
        $this->moved = PackingListItem::factory()->for($this->list)->create([
            'name' => '歯ブラシ', 'group_id' => $this->group->id, 'sort_order' => 1, 'is_checked' => true,
        ]);
        $this->base = PackingListItem::factory()->for($this->list)->create([
            'name' => '洗面用具', 'sort_order' => 2, 'is_checked' => true,
        ]);

        // 実際の操作と同じく、重ねてグループにしてから戻す
        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$this->base->id}/group", ['item_id' => $this->moved->id])
            ->assertCreated();
        $this->created = PackingListGroup::where('name', '洗面用具')->sole();
        $this->list->forceFill(['updated_at' => now()->subDay()])->save();
    }

    /**
     * @param  array<string, mixed>  $override
     */
    private function undo(array $override = [], ?User $as = null, ?int $baseId = null): TestResponse
    {
        // 準備（setUp）で本人として送った後なので、別の人で送るときは認証の覚えを消す
        $this->app['auth']->forgetGuards();

        return $this->actingAsUser($as ?? $this->user)->deleteJson('/api/items/'.($baseId ?? $this->base->id).'/group', [
            'group_id' => $this->created->id,
            'item_id' => $this->moved->id,
            'previous_group_id' => $this->group->id,
            ...$override,
        ]);
    }

    private function assertStillGrouped(): void
    {
        $this->assertSoftDeleted($this->base);
        $this->assertSame($this->created->id, $this->moved->fresh()->group_id);
        $this->assertSame(2, $this->list->groups()->count());
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    public function test_グループをなくし、2つの持ち物を元の場所へ戻して200で返す(): void
    {
        $this->undo()->assertOk()->assertExactJson(['data' => [
            // 見出しに変わっていた持ち物は、名前・チェック・元の位置のまま戻る
            'restored' => [
                'id' => $this->base->id, 'name' => '洗面用具', 'group_id' => null,
                'sort_order' => 2, 'is_checked' => true, 'last_checked_at' => null,
            ],
            // 重ねた持ち物は、元のグループへ戻る。全体の順番とチェックは変えない（D-60）
            'item' => [
                'id' => $this->moved->id, 'name' => '歯ブラシ', 'group_id' => $this->group->id,
                'sort_order' => 1, 'is_checked' => true, 'last_checked_at' => null,
            ],
        ]]);

        $this->assertNotSoftDeleted($this->base);
        $this->assertModelMissing($this->created);
        $this->assertSame(['スーパー'], $this->list->groups()->pluck('name')->all());
        // D-24・D-59：構造の変更なので revision を増やし、一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(6, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_グループの外から重ねた持ち物は、グループの外へ戻す(): void
    {
        $outside = PackingListItem::factory()->for($this->list)->create(['name' => 'タオル', 'sort_order' => 3]);
        $other = PackingListItem::factory()->for($this->list)->create(['name' => '上着', 'sort_order' => 4]);
        $this->actingAsUser($this->user)
            ->postJson("/api/items/{$other->id}/group", ['item_id' => $outside->id])
            ->assertCreated();
        $created = PackingListGroup::where('name', '上着')->sole();

        $this->deleteJson("/api/items/{$other->id}/group", [
            'group_id' => $created->id, 'item_id' => $outside->id, 'previous_group_id' => null,
        ])->assertOk()
            ->assertJsonPath('data.restored.id', $other->id)
            ->assertJsonPath('data.restored.sort_order', 4)
            ->assertJsonPath('data.item.group_id', null);

        $this->assertModelMissing($created);
    }

    public function test_重ねた後に並べ替えていたら、見出しに変わっていた持ち物は一番下に戻る(): void
    {
        // D-31：削除した後に並べ替えると、削除済みの番号は空になる
        $this->actingAsUser($this->user)
            ->patchJson("/api/lists/{$this->list->id}/items/order", ['item_ids' => [$this->moved->id]])
            ->assertNoContent();

        $this->undo()->assertOk()->assertJsonPath('data.restored.sort_order', 2);
    }

    public function test_元のグループが空でチェック済みになっていたら、チェックの記録を外す(): void
    {
        // D-106：持ち物が戻ったグループは、中の持ち物からチェックを決める
        $this->actingAsUser($this->user)
            ->patchJson("/api/groups/{$this->group->id}/check", ['is_checked' => true])
            ->assertNoContent();

        $this->undo()->assertOk();

        $this->assertFalse($this->group->fresh()->is_checked);
    }

    /**
     * @return array<string, array{\Closure(self): void}>
     */
    public static function changedLists(): array
    {
        return [
            'できたグループにほかの持ち物が入った' => [function (self $test) {
                $extra = PackingListItem::factory()->for($test->list)->create(['sort_order' => 9]);
                $extra->forceFill(['group_id' => $test->created->id])->save();
            }],
            '重ねた持ち物がグループの外へ動いた' => [fn (self $test) => $test->moved->forceFill(['group_id' => null])->save()],
            '重ねた持ち物が削除された' => [fn (self $test) => $test->moved->delete()],
            'できたグループの名前が変わった' => [fn (self $test) => $test->created->update(['name' => '洗面'])],
            '元のグループが消えた' => [fn (self $test) => $test->group->delete()],
        ];
    }

    #[DataProvider('changedLists')]
    public function test_重ねた直後のままでなければ422で、何も変えない(\Closure $change): void
    {
        $change($this);
        $groups = $this->list->groups()->count();

        $this->undo()
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors._form', [self::MESSAGE]);

        $this->assertSoftDeleted($this->base);
        $this->assertModelExists($this->created);
        $this->assertSame($groups, $this->list->groups()->count());
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function mismatchedBodies(): array
    {
        return [
            '存在しないグループ' => [['group_id' => 999999]],
            '重ねた持ち物がいたグループ（できたグループではない）' => [['group_id' => 'group']],
            '存在しない持ち物' => [['item_id' => 999999]],
            '見出しに変わった持ち物自身' => [['item_id' => 'base']],
            '元のグループができたグループと同じ' => [['previous_group_id' => 'created']],
            '存在しない元のグループ' => [['previous_group_id' => 999999]],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('mismatchedBodies')]
    public function test_送った内容が合わなければ422で、何も変えない(array $override): void
    {
        $ids = ['group' => $this->group->id, 'base' => $this->base->id, 'created' => $this->created->id];
        $override = array_map(fn ($value) => is_string($value) ? $ids[$value] : $value, $override);

        $this->undo($override)->assertUnprocessable()->assertJsonPath('errors._form', [self::MESSAGE]);

        $this->assertStillGrouped();
    }

    public function test_すでに戻した後の送り直しは422で、二重に戻さない(): void
    {
        $this->undo()->assertOk();

        $this->undo()->assertUnprocessable()->assertJsonPath('errors._form', [self::MESSAGE]);

        $this->assertSame(6, $this->list->fresh()->grouping_revision);
        $this->assertSame(2, $this->list->items()->count());
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalidBodies(): array
    {
        return [
            'group_id が文字' => [['group_id' => '1'], 'group_id'],
            'group_id が null' => [['group_id' => null], 'group_id'],
            'group_id が 0' => [['group_id' => 0], 'group_id'],
            'item_id が小数' => [['item_id' => 1.5], 'item_id'],
            'item_id が配列' => [['item_id' => [1]], 'item_id'],
            'previous_group_id が文字' => [['previous_group_id' => '1'], 'previous_group_id'],
            'previous_group_id が 0' => [['previous_group_id' => 0], 'previous_group_id'],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('invalidBodies')]
    public function test_形が正しくなければ422で、何も変えない(array $override, string $field): void
    {
        $this->undo($override)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [self::MESSAGE]);

        $this->assertStillGrouped();
    }

    public function test_項目を省いたとき・定義していない項目を送ったときは422(): void
    {
        $this->actingAsUser($this->user)
            ->deleteJson("/api/items/{$this->base->id}/group", ['group_id' => $this->created->id, 'item_id' => $this->moved->id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.previous_group_id', [self::MESSAGE]);

        $this->undo(['name' => '洗面用具'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'この項目は送信できません。');

        $this->assertStillGrouped();
    }

    public function test_安全上限に届いているリストでは戻さない(): void
    {
        // D-97：戻すと1件増える。重ねた後にほかの人が足して2,000件になっていたら戻さない
        $this->fillItems($this->list, PackingListItem::MAX_PER_LIST - $this->list->items()->count());

        $this->undo()
            ->assertUnprocessable()
            ->assertExactJson(['message' => '1つのリストに入れられる持ち物は2,000件までです。', 'code' => 'item_limit_reached']);

        $this->assertStillGrouped();
    }

    public function test_共同編集のメンバーも戻せ、他人と未認証は戻せない(): void
    {
        // D-43：他人の持ち物は、存在しない持ち物と同じ404
        $this->undo(as: User::factory()->create())
            ->assertNotFound()->assertJsonPath('code', 'not_found');

        $this->undo(as: User::factory()->unverified()->create())
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertStillGrouped();

        // D-119：グループの操作は中身の操作なので、メンバーも戻せる
        $member = User::factory()->create();
        $this->list->members()->create(['user_id' => $member->id]);
        $this->undo(as: $member)->assertOk();
    }

    public function test_存在しない持ち物は404、ログインしていなければ401(): void
    {
        $this->undo(baseId: 999999)->assertNotFound()->assertJsonPath('code', 'not_found');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->deleteJson("/api/items/{$this->base->id}/group", [])
            ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }
}
