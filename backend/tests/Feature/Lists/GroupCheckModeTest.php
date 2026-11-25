<?php

namespace Tests\Feature\Lists;

use App\Enums\GroupCheckMode;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * D-122・V-29 グループごとのチェックの動き（通常／繰り返し利用）を変える。
 * SC-07 の見出しからは API-44、グループ整理（SC-09）からは API-30 で保存する。
 */
class GroupCheckModeTest extends ListApiTestCase
{
    private const MESSAGE = 'チェックの動きを選び直してください。';

    private User $user;

    private PackingList $list;

    private PackingListGroup $repeat;

    private PackingListGroup $normal;

    private PackingListItem $milk;

    private PackingListItem $miso;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(Carbon::parse('2026-11-24 10:00:00'));
        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
        $this->repeat = PackingListGroup::factory()->for($this->list)->create([
            'name' => 'いつもの買い物', 'sort_order' => 0, 'check_mode' => GroupCheckMode::Repeat,
        ]);
        $this->normal = PackingListGroup::factory()->for($this->list)->create(['name' => 'その他の買い物', 'sort_order' => 1]);
        $this->milk = PackingListItem::factory()->for($this->list)->create(['name' => '牛乳', 'sort_order' => 1, 'group_id' => $this->repeat->id]);
        $this->miso = PackingListItem::factory()->for($this->list)->create(['name' => '味噌', 'sort_order' => 2, 'group_id' => $this->normal->id]);
    }

    private function change(PackingListGroup $group, mixed $checkMode, ?User $as = null): TestResponse
    {
        return $this->actingAsUser($as ?? $this->user)->patchJson("/api/groups/{$group->id}", ['check_mode' => $checkMode]);
    }

    private function check(PackingListItem $item): void
    {
        $this->actingAsUser($this->user)->patchJson("/api/items/{$item->id}", ['is_checked' => true])->assertOk();
    }

    /**
     * @param  list<array<string, mixed>>  $groups
     * @param  array<int, string|null>  $groupKeys  持ち物ID → group_key
     */
    private function saveGrouping(array $groups, array $groupKeys, ?int $baseRevision = null): TestResponse
    {
        return $this->actingAsUser($this->user)->putJson("/api/lists/{$this->list->id}/grouping", [
            'base_revision' => $baseRevision ?? $this->list->fresh()->grouping_revision,
            'groups' => $groups,
            'assignments' => array_map(
                fn (int $id) => ['item_id' => $id, 'group_key' => $groupKeys[$id]],
                array_keys($groupKeys),
            ),
        ]);
    }

    public function test_チェックの動きを変えて200でグループを返し、revisionと更新日時を変える(): void
    {
        $this->change($this->normal, 'repeat')
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => $this->normal->id, 'name' => 'その他の買い物', 'sort_order' => 1, 'check_mode' => 'repeat',
            ]]);

        $this->assertSame(GroupCheckMode::Repeat, $this->normal->fresh()->check_mode);
        // D-59・D-122：グループの変更なので revision を増やし、D-24：一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(5, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
    }

    public function test_同じ設定のままなら何も変えない(): void
    {
        $this->change($this->repeat, 'repeat')->assertOk()->assertJsonPath('data.check_mode', 'repeat');

        $list = $this->list->fresh();
        $this->assertSame(4, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isBefore(now()->subHours(12)));
    }

    public function test_名前とチェックの動きを一度に変えられ、名前だけの変更では設定を保つ(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/groups/{$this->normal->id}", ['name' => '日用品', 'check_mode' => 'repeat'])
            ->assertOk()
            ->assertJsonPath('data.name', '日用品')
            ->assertJsonPath('data.check_mode', 'repeat');

        // C-03：送らなかった項目は変えない
        $this->patchJson("/api/groups/{$this->normal->id}", ['name' => '消耗品'])
            ->assertOk()
            ->assertJsonPath('data.check_mode', 'repeat');
        $this->assertSame(6, $this->list->fresh()->grouping_revision);
    }

    public function test_前後の空白は削ってから比べる(): void
    {
        // C-01：Laravel 標準の空白削除の後に判定する
        $this->change($this->normal, ' repeat ')->assertOk()->assertJsonPath('data.check_mode', 'repeat');
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function invalidCheckModes(): array
    {
        return [
            'null' => [null],
            '空欄' => [''],
            '空白だけ' => ['  '],
            '定義外の値' => ['hidden'],
            '大文字' => ['REPEAT'],
            '数値' => [1],
            '真偽値' => [true],
            '配列' => [['repeat']],
        ];
    }

    #[DataProvider('invalidCheckModes')]
    public function test_チェックの動きが正しくなければ422で何も変えない(mixed $checkMode): void
    {
        $this->change($this->normal, $checkMode)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.check_mode', [self::MESSAGE]);

        $this->assertSame(GroupCheckMode::Normal, $this->normal->fresh()->check_mode);
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_通常へ変えるとき、昨日までのチェックは外し、今日のチェックは保つ(): void
    {
        $egg = PackingListItem::factory()->for($this->list)->create(['name' => '卵', 'sort_order' => 3, 'group_id' => $this->repeat->id]);
        $this->check($this->milk);

        // 日付が変わった後、読み直さずに（開いたままの画面から）通常へ変える
        $this->travelTo(Carbon::parse('2026-11-25 10:00:00'));
        $this->check($egg);
        $this->change($this->repeat, 'normal')->assertOk();

        // 昨日のチェックを、チェック済みとして通常のグループへ持ち出さない
        $this->assertFalse($this->milk->fresh()->is_checked);
        $this->assertTrue($this->milk->fresh()->last_checked_at->equalTo(Carbon::parse('2026-11-24 10:00:00')));
        $this->assertTrue($egg->fresh()->is_checked);
    }

    public function test_繰り返し利用へ変えると、読んだときに今日より前のチェックが外れる(): void
    {
        $this->check($this->miso);

        $this->travelTo(Carbon::parse('2026-11-25 10:00:00'));
        $this->change($this->normal, 'repeat')->assertOk();

        $items = collect($this->getJson("/api/lists/{$this->list->id}")->assertOk()->json('data.items'))->keyBy('name');
        $this->assertFalse($items['味噌']['is_checked']);
        $this->assertSame(Carbon::parse('2026-11-24 10:00:00')->toJSON(), $items['味噌']['last_checked_at']);
    }

    public function test_共同編集のメンバーも変えられ、他人と未認証は変えられない(): void
    {
        $member = User::factory()->create();
        $this->list->members()->create(['user_id' => $member->id]);

        // D-119・D-122：グループの設定は中身の操作なので、メンバーも変えられる
        $this->change($this->normal, 'repeat', $member)->assertOk();

        // D-43：他人のグループは、存在しないグループと同じ404
        $this->app['auth']->forgetGuards();
        $this->change($this->normal, 'normal', User::factory()->create())
            ->assertNotFound()->assertJsonPath('code', 'not_found');

        $this->app['auth']->forgetGuards();
        $this->change($this->normal, 'normal', User::factory()->unverified()->create())
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertSame(GroupCheckMode::Repeat, $this->normal->fresh()->check_mode);
    }

    public function test_グループ整理で設定を保存し、新しいグループにも設定を付けられる(): void
    {
        $response = $this->saveGrouping([
            ['key' => 'a', 'id' => $this->repeat->id, 'name' => 'いつもの買い物', 'check_mode' => 'normal'],
            ['key' => 'b', 'id' => $this->normal->id, 'name' => 'その他の買い物', 'check_mode' => 'normal'],
            ['key' => 'c', 'id' => null, 'name' => '日用品の補充', 'check_mode' => 'repeat'],
        ], [$this->milk->id => 'a', $this->miso->id => 'c'])->assertOk();

        $response->assertJsonPath('data.groups.0.check_mode', 'normal')
            ->assertJsonPath('data.groups.2.name', '日用品の補充')
            ->assertJsonPath('data.groups.2.check_mode', 'repeat');
        $this->assertSame(GroupCheckMode::Normal, $this->repeat->fresh()->check_mode);
        $this->assertSame(GroupCheckMode::Repeat, PackingListGroup::where('name', '日用品の補充')->sole()->check_mode);
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    public function test_グループ整理で設定だけを変えても保存し、何も変えなければ_revisionを変えない(): void
    {
        $groups = fn (string $mode) => [
            ['key' => 'a', 'id' => $this->repeat->id, 'name' => 'いつもの買い物', 'check_mode' => 'repeat'],
            ['key' => 'b', 'id' => $this->normal->id, 'name' => 'その他の買い物', 'check_mode' => $mode],
        ];
        $assignments = [$this->milk->id => 'a', $this->miso->id => 'b'];

        $this->saveGrouping($groups('normal'), $assignments)->assertOk();
        $this->assertSame(4, $this->list->fresh()->grouping_revision);

        $this->saveGrouping($groups('repeat'), $assignments)->assertOk()->assertJsonPath('data.grouping_revision', 5);
        $this->assertSame(GroupCheckMode::Repeat, $this->normal->fresh()->check_mode);
    }

    public function test_グループ整理で繰り返し利用のグループから移すとき、期限の切れたチェックを持ち出さない(): void
    {
        $this->check($this->milk);
        $this->check($this->miso);

        // 日付が変わった後、読み直さずに保存する。牛乳は通常のグループへ、味噌は繰り返し利用のグループへ
        $this->travelTo(Carbon::parse('2026-11-25 10:00:00'));
        $response = $this->saveGrouping([
            ['key' => 'a', 'id' => $this->repeat->id, 'name' => 'いつもの買い物', 'check_mode' => 'repeat'],
            ['key' => 'b', 'id' => $this->normal->id, 'name' => 'その他の買い物', 'check_mode' => 'normal'],
        ], [$this->milk->id => 'b', $this->miso->id => 'a'])->assertOk();

        $items = collect($response->json('data.items'))->keyBy('name');
        $this->assertSame($this->normal->id, $items['牛乳']['group_id']);
        $this->assertFalse($items['牛乳']['is_checked']);
        // 繰り返し利用のグループへ入った持ち物も、今日より前のチェックは外して返す
        $this->assertFalse($items['味噌']['is_checked']);
        $this->assertFalse($this->milk->fresh()->is_checked);
        $this->assertFalse($this->miso->fresh()->is_checked);
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function invalidGroupingCheckModes(): array
    {
        return [
            '省略' => [[]],
            'null' => [['check_mode' => null]],
            '定義外の値' => [['check_mode' => 'hidden']],
            '数値' => [['check_mode' => 1]],
            '配列' => [['check_mode' => ['repeat']]],
        ];
    }

    /**
     * @param  array<string, mixed>  $checkMode
     */
    #[DataProvider('invalidGroupingCheckModes')]
    public function test_グループ整理でチェックの動きが正しくなければ422で何も変えない(array $checkMode): void
    {
        $this->saveGrouping([
            ['key' => 'a', 'id' => $this->repeat->id, 'name' => 'いつもの買い物', 'check_mode' => 'repeat'],
            ['key' => 'b', 'id' => $this->normal->id, 'name' => '日用品', ...$checkMode],
        ], [$this->milk->id => 'a', $this->miso->id => 'b'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors', ['groups.1.check_mode' => [self::MESSAGE]]);

        $this->assertSame('その他の買い物', $this->normal->fresh()->name);
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }
}
