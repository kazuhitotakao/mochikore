<?php

namespace Tests\Feature\Lists;

use App\Models\ListReport;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\PackingListService;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * F-11・SC-11・API-17、C-01〜08（38〜45行・Jメモ）、D-10・19・22・43・50・61・72・92。
 * API-17は入力項目なし。本文の未定義キーはC-03の共通文言を使う。
 */
class CopyPublicPackingListTest extends ListApiTestCase
{
    public function test_内容と分類を新しい_i_dへ複製し非公開・未チェック・revision0で201を返す(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create([
            'title' => '旅行', 'description' => "1行目\n2行目", 'is_public' => true,
            'grouping_revision' => 9, 'created_at' => now()->subMonth(), 'updated_at' => now()->subDay(),
        ]);
        $later = PackingListGroup::factory()->for($source)->create(['name' => '洗面', 'sort_order' => 2]);
        $first = PackingListGroup::factory()->for($source)->create(['name' => '衣類', 'sort_order' => 0]);
        $empty = PackingListGroup::factory()->for($source)->create(['name' => '空', 'sort_order' => 3]);
        $lastItem = PackingListItem::factory()->for($source)->create(['name' => '同じ名前', 'group_id' => $later->id, 'sort_order' => 7, 'is_checked' => true]);
        $firstItem = PackingListItem::factory()->for($source)->create(['name' => '服', 'group_id' => $first->id, 'sort_order' => 1, 'is_checked' => true]);
        $unclassified = PackingListItem::factory()->for($source)->create(['name' => '同じ名前', 'sort_order' => 7]);
        PackingListItem::factory()->for($source)->create(['name' => '削除済み', 'deleted_at' => now()]);
        ListReport::create(['packing_list_id' => $source->id, 'reason' => 'other']);

        $response = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated();
        $copy = PackingList::findOrFail($response->json('data.id'));
        $response->assertExactJson(['data' => [
            'id' => $copy->id, 'title' => '旅行', 'description' => "1行目\n2行目",
            'category' => ['id' => $source->category->id, 'name' => $source->category->name],
            'is_public' => false, 'moderated_at' => null, 'updated_at' => $copy->updated_at->toJSON(),
        ]]);
        $this->assertSame($user->id, $copy->user_id);
        $this->assertSame($source->id, $copy->source_list_id);
        $this->assertSame(0, $copy->grouping_revision);
        $this->assertTrue($copy->created_at->greaterThan($source->created_at));
        $this->assertTrue($copy->updated_at->greaterThan($source->updated_at));
        $groups = $copy->groups()->orderBy('sort_order')->orderBy('id')->get();
        $this->assertSame(['衣類', '洗面', '空'], $groups->pluck('name')->all());
        $this->assertSame([0, 2, 3], $groups->pluck('sort_order')->all());
        $this->assertEmpty(array_intersect([$first->id, $later->id, $empty->id], $groups->pluck('id')->all()));
        $items = $copy->items()->orderBy('sort_order')->orderBy('id')->get();
        $this->assertSame(['服', '同じ名前', '同じ名前'], $items->pluck('name')->all());
        $this->assertSame([1, 7, 7], $items->pluck('sort_order')->all());
        $this->assertSame([$groups[0]->id, $groups[1]->id, null], $items->pluck('group_id')->all());
        $this->assertSame([false, false, false], $items->pluck('is_checked')->all());
        $this->assertEmpty(array_intersect([$firstItem->id, $lastItem->id, $unclassified->id], $items->pluck('id')->all()));
        $this->assertSame(3, $copy->items()->withTrashed()->count());
        $this->assertSame(1, ListReport::count());
        $this->assertSame(9, $source->fresh()->grouping_revision);
        $this->assertTrue($source->fresh()->updated_at->equalTo($source->updated_at));
        $this->assertTrue($firstItem->fresh()->is_checked);
    }

    public function test_グループなし・説明なし・同名のリストも別々にコピーできる(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['title' => '同じ名前', 'description' => null, 'is_public' => true]);
        PackingListItem::factory()->for($source)->create(['is_checked' => true]);
        PackingList::factory()->for($user)->create(['title' => '同じ名前']);
        $first = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy", [])->assertCreated()->json('data.id');
        $second = $this->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $this->assertNotSame($first, $second);
        $this->assertSame(3, $user->packingLists()->where('title', '同じ名前')->count());
        $copy = PackingList::findOrFail($first);
        $this->assertNull($copy->description);
        $this->assertSame(0, $copy->groups()->count());
        $this->assertNull($copy->items()->sole()->group_id);
    }

    public function test_自分の公開リストもコピーできる(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->for($user)->create(['is_public' => true]);
        PackingListItem::factory()->for($source)->create();
        $id = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $this->assertNotSame($source->id, $id);
        $this->assertSame(2, $user->packingLists()->count());
    }

    public static function hiddenSources(): array
    {
        return ['private' => [false, false], 'moderated' => [false, true], 'inconsistent' => [true, true]];
    }

    #[DataProvider('hiddenSources')]
    public function test_非公開・運営非公開は本人でも404でコピーしない(bool $public, bool $moderated): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->for($user)->create(['is_public' => $public, 'moderated_at' => $moderated ? now() : null]);
        $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertNotFound()
            ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        $this->postJson("/api/public/lists/{$source->id}/copy", ['title' => '不正'])->assertNotFound();
        $this->assertSame(1, $user->packingLists()->count());
    }

    public function test_不存在・削除済み・不正_i_dは404(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        $source->delete();
        foreach ([$source->id, '9999999', 'abc', '0'] as $id) {
            $this->actingAsUser($user)->postJson("/api/public/lists/{$id}/copy")->assertNotFound();
        }
        $this->assertSame(0, $user->packingLists()->count());
    }

    public function test_ログインとメール認証を先に確認する(): void
    {
        $source = PackingList::factory()->create(['is_public' => true]);
        foreach ([$source->id, '9999999'] as $id) {
            $this->postJson("/api/public/lists/{$id}/copy")->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        }
        $unverified = User::factory()->unverified()->create();
        foreach ([$source->id, '9999999'] as $id) {
            $this->actingAsUser($unverified)->postJson("/api/public/lists/{$id}/copy")->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        }
        $this->assertSame(0, $unverified->packingLists()->count());
    }

    public function test_本文での上書きを未定義キーとして拒否する(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        $body = ['title' => '改ざん', 'user_id' => $source->user_id, 'is_public' => true, 'source_list_id' => null, 'items' => []];
        $response = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy", $body)->assertUnprocessable()->assertJsonPath('code', 'validation_error');
        foreach (array_keys($body) as $field) {
            $response->assertJsonPath('errors.'.$field, ['この項目は送信できません。']);
        }
        $this->assertSame(0, $user->packingLists()->count());
    }

    public function test_100件目は作れ101件目は部分保存せず拒否し削除後は再び作れる(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingListGroup::factory()->for($source)->create();
        PackingListItem::factory()->for($source)->create();
        PackingList::factory()->count(97)->for($user)->create();
        PackingList::factory()->for($user)->create(['is_public' => true]);
        PackingList::factory()->for($user)->create(['source_list_id' => $source->id]);
        $copyId = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $counts = [PackingList::count(), PackingListGroup::count(), PackingListItem::count()];
        $this->postJson("/api/public/lists/{$source->id}/copy")->assertUnprocessable()
            ->assertExactJson(['message' => 'リストは100件までです。', 'code' => 'list_limit_reached']);
        $this->assertSame(100, $user->packingLists()->count());
        $this->assertSame($counts, [PackingList::count(), PackingListGroup::count(), PackingListItem::count()]);
        PackingList::findOrFail($copyId)->delete();
        $this->postJson("/api/public/lists/{$source->id}/copy")->assertCreated();
        $this->assertSame(100, $user->packingLists()->count());
    }

    public function test_元とコピーの編集・チェック・分類は独立し元の削除でも残る(): void
    {
        $owner = User::factory()->create();
        $user = User::factory()->create();
        $source = PackingList::factory()->for($owner)->create(['is_public' => true]);
        $group = PackingListGroup::factory()->for($source)->create(['name' => '元の分類']);
        $item = PackingListItem::factory()->for($source)->create(['name' => '元の持ち物', 'group_id' => $group->id, 'is_checked' => true]);
        $id = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $copy = PackingList::findOrFail($id);
        $copyItem = $copy->items()->sole();
        $copyGroup = $copy->groups()->sole();
        $item->update(['name' => '元だけ変更']);
        $group->update(['name' => '元だけ分類変更']);
        $this->assertSame('元の持ち物', $copyItem->fresh()->name);
        $this->assertSame('元の分類', $copyGroup->fresh()->name);
        $copyItem->update(['name' => 'コピーだけ変更', 'is_checked' => true]);
        $copyGroup->update(['name' => 'コピーだけ分類変更']);
        $this->assertSame('元だけ変更', $item->fresh()->name);
        $this->assertSame('元だけ分類変更', $group->fresh()->name);
        $this->assertTrue($item->fresh()->is_checked);
        $source->delete();
        $this->assertNull($copy->fresh()->source_list_id);
        $this->assertSame(1, $copy->groups()->count());
        $this->assertSame(1, $copy->items()->count());
        $copy->delete();
        $this->assertModelMissing($copyItem);
        $this->assertModelMissing($copyGroup);
    }

    public function test_元所有者を_d_bから削除しても他人のコピーは残る(): void
    {
        $owner = User::factory()->create();
        $user = User::factory()->create();
        $source = PackingList::factory()->for($owner)->create(['is_public' => true]);
        PackingListItem::factory()->for($source)->create();
        $id = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $owner->delete();
        $copy = PackingList::findOrFail($id);
        $this->assertNull($copy->source_list_id);
        $this->assertSame(1, $copy->items()->count());
    }

    public function test_途中で持ち物の保存が失敗したらリスト・グループを含め全件戻す(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingListGroup::factory()->for($source)->create();
        PackingListItem::factory()->count(3)->for($source)->create();
        $created = 0;
        Event::listen('eloquent.creating: '.PackingListItem::class, function () use (&$created) {
            if (++$created === 2) {
                throw new \RuntimeException('copy item failure');
            }
        });
        try {
            $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertServerError()->assertJsonPath('code', 'server_error');
        } finally {
            Event::forget('eloquent.creating: '.PackingListItem::class);
        }
        $this->assertSame(0, $user->packingLists()->count());
        $this->assertDatabaseCount('packing_lists', 1);
        $this->assertDatabaseCount('packing_list_groups', 1);
        $this->assertDatabaseCount('packing_list_items', 3);
    }

    public function test_読込後に非公開になった元をロック内で再確認する(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingList::whereKey($source->id)->update(['is_public' => false]);
        try {
            app(PackingListService::class)->copyPublic($user, $source);
            $this->fail('非公開になった元はコピーできません。');
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $this->assertSame(0, $user->packingLists()->count());
    }

    public function test_コピーしたリストを公開して複製すると直前の元_i_dを保存する(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingListItem::factory()->for($source)->create();
        $firstId = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        PackingList::whereKey($firstId)->update(['is_public' => true]);
        $lastId = $this->postJson("/api/public/lists/{$firstId}/copy")->assertCreated()->json('data.id');
        $this->assertSame($firstId, PackingList::findOrFail($lastId)->source_list_id);
    }

    public function test_持ち物が200件を超えても全部コピーする(): void
    {
        $user = User::factory()->create();
        $source = PackingList::factory()->create(['is_public' => true]);
        PackingListItem::factory()->count(205)->for($source)->create(['is_checked' => true]);
        $id = $this->actingAsUser($user)->postJson("/api/public/lists/{$source->id}/copy")->assertCreated()->json('data.id');
        $this->assertSame(205, PackingList::findOrFail($id)->items()->count());
        $this->assertSame(0, PackingList::findOrFail($id)->items()->where('is_checked', true)->count());
    }
}
