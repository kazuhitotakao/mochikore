<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-44 グループ名の変更（D-109、V-14、D-24・D-57・D-59）。
 */
class UpdateGroupNameTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private PackingListGroup $group;

    private PackingListGroup $sibling;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
        $this->group = PackingListGroup::factory()->for($this->list)->create(['name' => 'スーパー', 'sort_order' => 0]);
        $this->sibling = PackingListGroup::factory()->for($this->list)->create(['name' => '薬局', 'sort_order' => 1]);
    }

    private function rename(mixed $name, ?User $as = null, ?int $groupId = null): TestResponse
    {
        return $this->actingAsUser($as ?? $this->user)
            ->patchJson('/api/groups/'.($groupId ?? $this->group->id), ['name' => $name]);
    }

    public function test_名前を変えて200でグループを返し、revisionと更新日時を変える(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create([
            'group_id' => $this->group->id, 'sort_order' => 3, 'is_checked' => true,
        ]);

        // 前後の空白は標準の TrimStrings が削る
        $this->rename('  食品  ')
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $this->group->id, 'name' => '食品', 'sort_order' => 0]]);

        $this->assertSame('食品', $this->group->fresh()->name);
        $this->getJson("/api/lists/{$this->list->id}")->assertOk()->assertJsonPath('data.groups.0.name', '食品');

        // D-59・D-109：グループの変更なので revision を増やし、D-24：一覧の上に戻る
        $list = $this->list->fresh();
        $this->assertSame(5, $list->grouping_revision);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));

        // 持ち物の所属・順番・チェック、ほかのグループは変えない
        $fresh = $item->fresh();
        $this->assertSame($this->group->id, $fresh->group_id);
        $this->assertSame(3, $fresh->sort_order);
        $this->assertTrue($fresh->is_checked);
        $this->assertSame('薬局', $this->sibling->fresh()->name);
    }

    public function test_同じ名前のままならrevisionも更新日時も変えない(): void
    {
        $before = $this->list->updated_at->toJSON();

        $this->rename('スーパー')->assertOk()->assertJsonPath('data.name', 'スーパー');

        $list = $this->list->fresh();
        $this->assertSame(4, $list->grouping_revision);
        $this->assertSame($before, $list->updated_at->toJSON());
    }

    public function test_名前を変えた後は開いたままの整理画面の古いrevisionでは上書きできない(): void
    {
        $this->rename('食品')->assertOk();

        // SC-09 を開いたときの revision（4）と古い名前で「保存」を押しても、409 で名前は戻らない
        $this->putJson("/api/lists/{$this->list->id}/grouping", [
            'base_revision' => 4,
            'groups' => [
                ['key' => 'g1', 'id' => $this->group->id, 'name' => 'スーパー'],
                ['key' => 'g2', 'id' => $this->sibling->id, 'name' => '薬局'],
            ],
            'assignments' => [],
        ])->assertConflict()->assertJsonPath('code', 'grouping_conflict');

        $this->assertSame('食品', $this->group->fresh()->name);
    }

    public function test_同じリストのほかのグループと同じ名前は拒否し何も変えない(): void
    {
        $this->rename('薬局')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.name.0', '同じ名前のグループがあります。');

        $this->assertSame('スーパー', $this->group->fresh()->name);
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_別のリストのグループと同じ名前や大文字小文字の違いは使える(): void
    {
        PackingListGroup::factory()->create(['name' => '食品']);
        $this->sibling->update(['name' => 'ABC']);

        $this->rename('食品')->assertOk();
        $this->rename('abc')->assertOk()->assertJsonPath('data.name', 'abc');
    }

    /**
     * @return array<string, array{mixed, string}>
     */
    public static function invalidNames(): array
    {
        return [
            '空欄' => ['', 'グループ名を入力してください。'],
            '空白だけ' => ['　 ', 'グループ名を入力してください。'],
            'null' => [null, 'グループ名を入力してください。'],
            '51文字' => [str_repeat('あ', 51), 'グループ名は50文字以内で入力してください。'],
            '途中の改行' => ["食\n品", 'グループ名は改行せずに入力してください。'],
            '途中のタブ' => ["食\t品", 'グループ名は改行せずに入力してください。'],
            '予約名' => ['未分類', 'このグループ名は使用できません。'],
            '数値' => [123, 'グループ名を文字で入力してください。'],
            '配列' => [['食品'], 'グループ名を文字で入力してください。'],
        ];
    }

    #[DataProvider('invalidNames')]
    public function test_グループ名の条件に合わないときは422で何も変えない(mixed $name, string $message): void
    {
        $this->rename($name)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.name.0', $message);

        $this->assertSame('スーパー', $this->group->fresh()->name);
        $this->assertSame(4, $this->list->fresh()->grouping_revision);
    }

    public function test_50文字までは使える(): void
    {
        $this->rename(str_repeat('あ', 50))->assertOk();
        $this->assertSame(str_repeat('あ', 50), $this->group->fresh()->name);
    }

    public function test_空の送信と定義していない項目は拒否する(): void
    {
        $this->actingAsUser($this->user)->patchJson("/api/groups/{$this->group->id}", [])
            ->assertUnprocessable()->assertJsonValidationErrors(['_form', 'name']);

        $this->patchJson("/api/groups/{$this->group->id}", ['name' => '食品', 'sort_order' => 5])
            ->assertUnprocessable()->assertJsonPath('errors.sort_order.0', 'この項目は送信できません。');

        $this->assertSame('スーパー', $this->group->fresh()->name);
        $this->assertSame(0, $this->group->fresh()->sort_order);
    }

    public function test_他人のグループと存在しないグループは同じ404で変えない(): void
    {
        $other = PackingListGroup::factory()->create(['name' => '他人']);

        foreach ([$other->id, 99999999] as $id) {
            $this->rename('食品', groupId: $id)
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }

        $this->assertSame('他人', $other->fresh()->name);
    }

    public function test_未ログインとメール未認証では変えられない(): void
    {
        $this->patchJson("/api/groups/{$this->group->id}", ['name' => '食品'])->assertUnauthorized();

        $unverified = User::factory()->unverified()->create();
        $group = PackingListGroup::factory()
            ->for(PackingList::factory()->for($unverified))
            ->create(['name' => 'スーパー']);

        $this->rename('食品', $unverified, $group->id)
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');

        $this->assertSame('スーパー', $group->fresh()->name);
        $this->assertSame('スーパー', $this->group->fresh()->name);
    }
}
