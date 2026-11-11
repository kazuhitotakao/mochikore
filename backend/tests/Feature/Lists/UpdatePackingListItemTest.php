<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-11 持ち物の名前・チェックの変更（F-05・F-06、V-08・V-09・C-03、D-24・D-25）。
 */
class UpdatePackingListItemTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    private PackingListItem $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 3,
            'updated_at' => now()->subDay(),
        ]);
        $this->item = PackingListItem::factory()->for($this->list)->create(['name' => '靴下', 'sort_order' => 2]);
    }

    public function test_名前を変えると、持ち物1件を返し、リストを一覧の上に戻す(): void
    {
        $this->actingAsUser($this->user)
            ->patchJson("/api/items/{$this->item->id}", ['name' => ' 厚手の靴下 '])
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'id' => $this->item->id,
                    'name' => '厚手の靴下',
                    'group_id' => null,
                    'sort_order' => 2,
                    'is_checked' => false,
                ],
            ]);

        $list = $this->list->fresh();
        // D-24：名前を変えたリストは一覧の上に戻る。構造は変えないので revision は増やさない
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
        $this->assertSame(3, $list->grouping_revision);
    }

    public function test_チェックだけでは、リストの更新日時もrevisionも変えない(): void
    {
        // D-25
        $before = $this->list->updated_at->toJSON();

        $this->actingAsUser($this->user)
            ->patchJson("/api/items/{$this->item->id}", ['is_checked' => true])
            ->assertOk()
            ->assertJsonPath('data.is_checked', true)
            ->assertJsonPath('data.name', '靴下');

        $list = $this->list->fresh();
        $this->assertSame($before, $list->updated_at->toJSON());
        $this->assertSame(3, $list->grouping_revision);
        $this->assertTrue($this->item->fresh()->is_checked);
    }

    public function test_同じ名前のほかの持ち物には影響しない(): void
    {
        // D-29
        $twin = PackingListItem::factory()->for($this->list)->create(['name' => '靴下']);

        $this->actingAsUser($this->user)
            ->patchJson("/api/items/{$this->item->id}", ['name' => '手袋', 'is_checked' => true])
            ->assertOk();

        $this->assertSame('靴下', $twin->fresh()->name);
        $this->assertFalse($twin->fresh()->is_checked);
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        $check = 'チェック状態が正しくありません。もう一度操作してください。';

        return [
            '名前がnull' => [['name' => null], 'name', '持ち物名を入力してください。'],
            '名前が空文字' => [['name' => ''], 'name', '持ち物名を入力してください。'],
            '名前が51文字' => [['name' => str_repeat('あ', 51)], 'name', '持ち物名は50文字以内で入力してください。'],
            'チェックが文字列' => [['is_checked' => 'false'], 'is_checked', $check],
            'チェックが1' => [['is_checked' => 1], 'is_checked', $check],
            'チェックがnull' => [['is_checked' => null], 'is_checked', $check],
            '空の送信' => [[], '_form', '変更する項目を入力してください。'],
            'グループを混ぜる' => [['name' => '手袋', 'group_id' => 1], 'group_id', 'この項目は送信できません。'],
            '並び順を混ぜる' => [['sort_order' => 0], 'sort_order', 'この項目は送信できません。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidInputs')]
    public function test_入力が正しくなければ422で、何も変えない(array $body, string $field, string $message): void
    {
        $before = $this->item->fresh()->getAttributes();

        $this->actingAsUser($this->user)->patchJson("/api/items/{$this->item->id}", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [$message]);

        $this->assertSame($before, $this->item->fresh()->getAttributes());
    }

    public function test_他人の持ち物・削除済み・存在しない持ち物は同じ404(): void
    {
        // D-43
        $othersItem = PackingListItem::factory()->create(['name' => 'ほかの人']);
        $deleted = PackingListItem::factory()->for($this->list)->create(['deleted_at' => now()]);

        foreach ([$othersItem->id, $deleted->id, 999999] as $id) {
            $this->actingAsUser($this->user)
                ->patchJson("/api/items/{$id}", ['name' => '乗っ取り'])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertSame('ほかの人', $othersItem->fresh()->name);
    }

    public function test_メール未認証なら403(): void
    {
        $user = User::factory()->unverified()->create();
        $item = PackingListItem::factory()->for(PackingList::factory()->for($user))->create();

        $this->actingAsUser($user)
            ->patchJson("/api/items/{$item->id}", ['is_checked' => true])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
    }
}
