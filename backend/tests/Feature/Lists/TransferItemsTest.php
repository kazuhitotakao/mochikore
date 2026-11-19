<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-51・52 選んだ持ち物を別のリストへコピー・移動する（F-32、SC-07、D-118・D-24・D-29・D-50・D-51・D-59・D-97・D-106・D-116）。
 * 入力は V-26（09_バリデーション）と C-01〜08。
 */
class TransferItemsTest extends ListApiTestCase
{
    private User $user;

    private PackingList $source;

    private PackingList $target;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->source = PackingList::factory()->for($this->user)->create([
            'title' => '夏の旅行', 'category_id' => $this->categoryId('旅行・お泊まり'),
            'grouping_revision' => 3, 'updated_at' => now()->subDays(2),
        ]);
        $this->target = PackingList::factory()->for($this->user)->create([
            'title' => '冬の旅行', 'grouping_revision' => 5, 'updated_at' => now()->subDay(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function send(string $action, array $body, ?PackingList $list = null): TestResponse
    {
        return $this->actingAsUser($this->user)->postJson('/api/lists/'.($list ?? $this->source)->id.'/items/'.$action, $body);
    }

    public function test_コピーは元を残し、元の並び順で移し先の末尾に未チェックで入れ、指定したグループにまとめる(): void
    {
        $group = PackingListGroup::factory()->for($this->source)->create(['name' => '洗面']);
        $toothbrush = PackingListItem::factory()->for($this->source)->create(['name' => '歯ブラシ', 'sort_order' => 5, 'group_id' => $group->id, 'is_checked' => true]);
        $towel = PackingListItem::factory()->for($this->source)->create(['name' => 'タオル', 'sort_order' => 2]);
        PackingListItem::factory()->for($this->source)->create(['name' => '選ばない', 'sort_order' => 3]);
        PackingListItem::factory()->for($this->target)->create(['name' => 'タオル', 'sort_order' => 7]);
        PackingListItem::factory()->for($this->target)->create(['name' => '削除済み', 'sort_order' => 20, 'deleted_at' => now()]);
        // D-106：空でチェックを記録していたグループに入れたら、記録を外す
        $targetGroup = PackingListGroup::factory()->for($this->target)->create(['name' => '持ち物', 'is_checked' => true]);
        $sourceUpdatedAt = $this->source->fresh()->updated_at->toJSON();

        $this->send('copy', [
            'item_ids' => [$toothbrush->id, $towel->id],
            'destination_list_id' => $this->target->id,
            'destination_group_id' => $targetGroup->id,
        ])->assertCreated()->assertExactJson(['data' => [
            'list' => ['id' => $this->target->id, 'title' => '冬の旅行'],
            'count' => 2,
            'is_public' => false,
        ]]);

        // 元の並び順（sort_order）のまま、削除していない持ち物の最大値＋1から。同じ名前も別の持ち物になる（D-29）
        $copied = $this->target->items()->where('sort_order', '>', 7)->orderBy('sort_order')->get();
        $this->assertSame(['タオル', '歯ブラシ'], $copied->pluck('name')->all());
        $this->assertSame([8, 9], $copied->pluck('sort_order')->all());
        $this->assertSame([false, false], $copied->pluck('is_checked')->all());
        $this->assertSame([$targetGroup->id, $targetGroup->id], $copied->pluck('group_id')->all());
        $this->assertNotContains($toothbrush->id, $copied->modelKeys());
        $this->assertFalse($targetGroup->fresh()->is_checked);
        // グループそのものは写さない
        $this->assertSame(1, $this->target->groups()->count());

        // 元のリストは変わらない（持ち物・チェック・revision・一覧の順番）
        $this->assertSame(3, $this->source->items()->count());
        $this->assertTrue($toothbrush->fresh()->is_checked);
        $this->assertSame(3, $this->source->fresh()->grouping_revision);
        $this->assertSame($sourceUpdatedAt, $this->source->fresh()->updated_at->toJSON());
        // D-24・D-59：移し先は revision を増やし、一覧の上に戻る
        $this->assertSame(6, $this->target->fresh()->grouping_revision);
        $this->getJson('/api/lists')->assertJsonPath('data.0.id', $this->target->id);
    }

    public function test_移動は同じ持ち物を移し先へ移し、チェックを保ち、両方のrevisionを増やす(): void
    {
        $group = PackingListGroup::factory()->for($this->source)->create();
        $checked = PackingListItem::factory()->for($this->source)->create(['name' => '充電器', 'sort_order' => 1, 'group_id' => $group->id, 'is_checked' => true]);
        $other = PackingListItem::factory()->for($this->source)->create(['name' => '帽子', 'sort_order' => 2]);
        $this->source->forceFill(['is_public' => true])->save();

        $this->send('move', [
            'item_ids' => [$checked->id],
            'destination_list_id' => $this->target->id,
            'destination_group_id' => null,
        ])->assertOk()->assertExactJson(['data' => [
            'list' => ['id' => $this->target->id, 'title' => '冬の旅行'],
            'count' => 1,
            'is_public' => true,
        ]]);

        $moved = $checked->fresh();
        $this->assertSame($this->target->id, $moved->packing_list_id);
        $this->assertNull($moved->group_id);
        $this->assertTrue($moved->is_checked);
        $this->assertSame(1, $moved->sort_order);
        $this->assertSame([$other->id], $this->source->items()->pluck('id')->all());
        $this->assertSame(4, $this->source->fresh()->grouping_revision);
        $this->assertSame(6, $this->target->fresh()->grouping_revision);
        // 一部だけ移したので、公開のまま
        $this->assertTrue($this->source->fresh()->is_public);
    }

    public function test_公開中のリストから全部移して0件になったら非公開にする(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->source)->create();
        PackingListItem::factory()->for($this->source)->create(['deleted_at' => now()]);
        $this->source->forceFill(['is_public' => true])->save();

        $this->send('move', [
            'item_ids' => $items->modelKeys(),
            'destination_list_id' => $this->target->id,
        ])->assertOk()->assertJsonPath('data.is_public', false);

        $this->assertFalse($this->source->fresh()->is_public);
        $this->assertSame(2, $this->target->items()->count());
    }

    public function test_新しいリストを作ってコピーでき、カテゴリーは元と同じで非公開、コピー元は記録しない(): void
    {
        $item = PackingListItem::factory()->for($this->source)->create(['name' => '水着', 'is_checked' => true]);

        $id = $this->send('copy', [
            'item_ids' => [$item->id],
            'destination_list_id' => null,
            'new_list_title' => ' 海の持ち物 ',
        ])->assertCreated()->assertJsonPath('data.list.title', '海の持ち物')->json('data.list.id');

        $created = PackingList::findOrFail($id);
        $this->assertSame($this->user->id, $created->user_id);
        $this->assertSame($this->source->category_id, $created->category_id);
        $this->assertFalse($created->is_public);
        $this->assertNull($created->source_list_id);
        $this->assertSame(['水着'], $created->items()->pluck('name')->all());
        $this->assertFalse($created->items()->sole()->is_checked);
        $this->assertSame(1, $created->grouping_revision);
    }

    public function test_新しいリストへ移動でき、100件のときは作らずに断る(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->source)->create();
        $this->send('move', [
            'item_ids' => [$items[0]->id],
            'destination_list_id' => null,
            'new_list_title' => '新しい移し先',
        ])->assertOk();
        $this->assertSame(1, $this->source->items()->count());

        PackingList::factory()->count(PackingList::MAX_PER_USER - 3)->for($this->user)->create();
        $this->assertSame(PackingList::MAX_PER_USER, $this->user->packingLists()->count());
        foreach (['copy', 'move'] as $action) {
            $this->send($action, [
                'item_ids' => [$items[1]->id],
                'destination_list_id' => null,
                'new_list_title' => '101件目',
            ])->assertUnprocessable()->assertExactJson(['message' => 'リストは100件までです。', 'code' => 'list_limit_reached']);
        }
        $this->assertSame(1, $this->source->items()->count());
    }

    public function test_移し先が安全上限を超えるときは何も変えない(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->source)->create();
        $this->fillItems($this->target, PackingListItem::MAX_PER_LIST - 1);

        foreach (['copy', 'move'] as $action) {
            $this->send($action, [
                'item_ids' => $items->modelKeys(),
                'destination_list_id' => $this->target->id,
            ])->assertUnprocessable()->assertExactJson(['message' => '1つのリストに入れられる持ち物は2,000件までです。', 'code' => 'item_limit_reached']);
        }
        $this->assertSame(2, $this->source->items()->count());
        $this->assertSame(PackingListItem::MAX_PER_LIST - 1, $this->target->items()->count());
        $this->assertSame(0, $this->itemAdditions($this->user));
    }

    public function test_コピーは件数で1時間の回数に数え、移動は数えない(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->source)->create();
        $this->useItemAdditions($this->user, PackingListItem::MAX_ADDED_PER_HOUR - 1);
        $body = ['item_ids' => $items->modelKeys(), 'destination_list_id' => $this->target->id];

        // 2件のコピーは上限を超えるので、1件も入れない
        $this->send('copy', $body)->assertTooManyRequests()->assertJsonPath('code', 'too_many_requests');
        $this->assertSame(0, $this->target->items()->count());
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR - 1, $this->itemAdditions($this->user));

        // 移動は全体の数が増えないので数えない
        $this->send('move', $body)->assertOk();
        $this->assertSame(2, $this->target->items()->count());
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR - 1, $this->itemAdditions($this->user));
    }

    public function test_運営が非公開にしたリストからはコピー・移動できず、運営が非公開にしたリストへは入れられる(): void
    {
        $item = PackingListItem::factory()->for($this->source)->create();
        $this->source->forceFill(['moderated_at' => now()])->save();
        foreach (['copy', 'move'] as $action) {
            $this->send($action, ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id])
                ->assertForbidden()->assertJsonPath('code', 'list_moderated');
        }
        $this->assertSame(0, $this->target->items()->count());

        $this->source->forceFill(['moderated_at' => null])->save();
        $this->target->forceFill(['moderated_at' => now()])->save();
        $this->send('copy', ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id])->assertCreated();
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function invalidBodies(): array
    {
        return [
            '持ち物を選んでいない' => ['empty', 'item_ids'],
            '持ち物が配列でない' => ['not-array', 'item_ids'],
            // 配列の中の誤りは、要素ごとの項目名で返す
            '同じ持ち物を2回' => ['duplicate', 'item_ids.1'],
            '文字のID' => ['string-id', 'item_ids.0'],
            '別のリストの持ち物' => ['other-item', 'item_ids'],
            '削除した持ち物' => ['deleted-item', 'item_ids'],
            '2,001件' => ['too-many', 'item_ids'],
            '移し先を省略' => ['no-destination', 'destination_list_id'],
            '元と同じリスト' => ['same-list', 'destination_list_id'],
            '他人のリスト' => ['others-list', 'destination_list_id'],
            '存在しないリスト' => ['missing-list', 'destination_list_id'],
            '移し先と新しい名前の両方' => ['both', 'new_list_title'],
            '移し先のものでないグループ' => ['other-group', 'destination_group_id'],
            '新しいリストにグループ' => ['new-with-group', 'destination_group_id'],
            '新しいリストの名前が空' => ['empty-title', 'new_list_title'],
            '新しいリストの名前が51文字' => ['long-title', 'new_list_title'],
            '定義していない項目' => ['undefined', 'is_checked'],
        ];
    }

    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で何も変えない(string $case, string $field): void
    {
        $item = PackingListItem::factory()->for($this->source)->create();
        $other = User::factory()->create();
        $othersList = PackingList::factory()->for($other)->create();
        $deleted = PackingListItem::factory()->for($this->source)->create(['deleted_at' => now()]);
        $otherItem = PackingListItem::factory()->for($this->target)->create();
        $otherGroup = PackingListGroup::factory()->for($this->source)->create();
        $base = ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id];
        $body = match ($case) {
            'empty' => [...$base, 'item_ids' => []],
            'not-array' => [...$base, 'item_ids' => $item->id],
            'duplicate' => [...$base, 'item_ids' => [$item->id, $item->id]],
            'string-id' => [...$base, 'item_ids' => [(string) $item->id]],
            'other-item' => [...$base, 'item_ids' => [$otherItem->id]],
            'deleted-item' => [...$base, 'item_ids' => [$deleted->id]],
            'too-many' => [...$base, 'item_ids' => range(1, PackingListItem::MAX_PER_LIST + 1)],
            'no-destination' => ['item_ids' => [$item->id]],
            'same-list' => [...$base, 'destination_list_id' => $this->source->id],
            'others-list' => [...$base, 'destination_list_id' => $othersList->id],
            'missing-list' => [...$base, 'destination_list_id' => 9999999],
            'both' => [...$base, 'new_list_title' => '新しいリスト'],
            'other-group' => [...$base, 'destination_group_id' => $otherGroup->id],
            'new-with-group' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => '新しい', 'destination_group_id' => $otherGroup->id],
            'empty-title' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => '　'],
            'long-title' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => str_repeat('あ', 51)],
            'undefined' => [...$base, 'is_checked' => true],
        };
        $message = match ($case) {
            'empty' => 'コピー・移動する持ち物を選んでください。',
            'too-many' => '一度に選べる持ち物は2,000件までです。',
            'no-destination', 'same-list', 'others-list', 'missing-list', 'both' => '移し先のリストを選び直してください。',
            'other-group', 'new-with-group' => '入れるグループを選び直してください。',
            'empty-title' => 'リスト名を入力してください。',
            'long-title' => 'リスト名は50文字以内で入力してください。',
            'undefined' => 'この項目は送信できません。',
            default => '選んだ持ち物の情報が正しくありません。リストを読み直してください。',
        };
        $counts = [PackingList::count(), $this->source->items()->count(), $this->target->items()->count()];

        foreach (['copy', 'move'] as $action) {
            $response = $this->send($action, $body)->assertUnprocessable()->assertJsonPath('code', 'validation_error');
            // 項目名に「.」を含む（item_ids.0 など）ので、パスではなく項目名のまま取り出す
            $this->assertSame([$message], $response->json('errors')[$field] ?? null);
        }
        $this->assertSame($counts, [PackingList::count(), $this->source->items()->count(), $this->target->items()->count()]);
        // 他人のリストには入れない
        $this->assertSame(0, $othersList->items()->count());
    }

    public function test_他人のリスト・存在しないリストからは同じ404で、ログイン・メール認証を確かめる(): void
    {
        $other = User::factory()->create();
        $othersList = PackingList::factory()->for($other)->create();
        $othersItem = PackingListItem::factory()->for($othersList)->create();
        foreach ([$othersList->id, 9999999] as $id) {
            foreach (['copy', 'move'] as $action) {
                $this->actingAsUser($this->user)
                    ->postJson("/api/lists/{$id}/items/{$action}", ['item_ids' => [$othersItem->id], 'destination_list_id' => $this->target->id])
                    ->assertNotFound()->assertJsonPath('code', 'not_found');
            }
        }
        $this->assertSame($othersList->id, $othersItem->fresh()->packing_list_id);

        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();
        // 前の利用者のログインを引き継がないよう、確かめた本人を忘れてから送る
        $this->app['auth']->forgetGuards();
        $this->actingAsUser($unverified)->postJson("/api/lists/{$list->id}/items/copy", [])
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->app['auth']->forgetGuards();
        $this->withoutToken()->postJson("/api/lists/{$this->source->id}/items/move", [])
            ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }
}
