<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-48・49 限定公開のリンクから見る・コピーする（F-29、SC-18、D-114・D-32・D-43・D-48・D-50・D-97、C-03）。
 */
class SharedPackingListTest extends ListApiTestCase
{
    private const TOKEN = 'Abc123Abc123Abc123Abc123Abc123Ab';

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        // 非公開のままリンクを作ったリスト
        $this->list = PackingList::factory()->create([
            'title' => '家族の旅行',
            'description' => '説明',
            'category_id' => $this->categoryId('旅行・お泊まり'),
            'is_public' => false,
            'share_token' => self::TOKEN,
        ]);
    }

    public function test_ログインなしで、公開リスト詳細と同じ形で見られ、作成者とチェック状態は返さない(): void
    {
        $group = PackingListGroup::factory()->for($this->list)->create(['name' => '洗面', 'sort_order' => 0]);
        $a = PackingListItem::factory()->for($this->list)->create(['name' => '歯ブラシ', 'sort_order' => 1, 'is_checked' => true]);
        $a->group_id = $group->id;
        $a->save();
        $b = PackingListItem::factory()->for($this->list)->create(['name' => 'タオル', 'sort_order' => 2]);
        PackingListItem::factory()->for($this->list)->create(['sort_order' => 3, 'deleted_at' => now()]);

        $response = $this->getJson('/api/shared/lists/'.self::TOKEN)->assertOk();

        // API-16 と同じ項目にそろえる
        $public = PackingList::factory()->create(['is_public' => true]);
        $this->assertSame(
            array_keys($this->getJson("/api/public/lists/{$public->id}")->json('data')),
            array_keys($response->json('data')),
        );
        $response->assertJsonPath('data.title', '家族の旅行')
            ->assertJsonPath('data.groups', [['id' => $group->id, 'name' => '洗面', 'sort_order' => 0]])
            ->assertJsonPath('data.items', [
                ['id' => $a->id, 'name' => '歯ブラシ', 'group_id' => $group->id, 'sort_order' => 1],
                ['id' => $b->id, 'name' => 'タオル', 'group_id' => null, 'sort_order' => 2],
            ])
            ->assertJsonMissingPath('data.user_id')
            ->assertJsonMissingPath('data.share_token');
    }

    public function test_止めたリンク・運営が非公開にしたリスト・形の違うリンクは404(): void
    {
        $moderated = PackingList::factory()->create(['share_token' => str_repeat('m', 32), 'moderated_at' => now()]);

        foreach ([str_repeat('z', 32), $moderated->share_token, 'short', str_repeat('a', 33), str_repeat('-', 32)] as $token) {
            $this->getJson('/api/shared/lists/'.$token)->assertNotFound()->assertJsonPath('code', 'not_found');
        }
    }

    public function test_公開リストの_ap_iでは、リンクだけのリストは見られない(): void
    {
        // D-114：公開一覧・公開詳細には出さない
        $this->getJson("/api/public/lists/{$this->list->id}")->assertNotFound();
        $this->getJson('/api/public/lists')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_自分用にコピーすると、非公開・未チェックで分類も写し、リンクは引き継がない(): void
    {
        $user = User::factory()->create();
        $group = PackingListGroup::factory()->for($this->list)->create(['name' => '洗面', 'sort_order' => 0]);
        $item = PackingListItem::factory()->for($this->list)->create(['name' => '歯ブラシ', 'sort_order' => 1, 'is_checked' => true]);
        $item->group_id = $group->id;
        $item->save();

        $id = $this->actingAsUser($user)->postJson('/api/shared/lists/'.self::TOKEN.'/copy')
            ->assertCreated()
            ->assertJsonPath('data.title', '家族の旅行')
            ->assertJsonPath('data.is_public', false)
            ->json('data.id');

        $copy = PackingList::findOrFail($id);
        $this->assertSame($user->id, $copy->user_id);
        $this->assertSame($this->list->id, $copy->source_list_id);
        $this->assertNull($copy->share_token);
        $copiedItem = $copy->items()->sole();
        $this->assertFalse($copiedItem->is_checked);
        $this->assertSame('洗面', $copy->groups()->whereKey($copiedItem->group_id)->value('name'));
        // 元のリストは変えない
        $this->assertSame(self::TOKEN, $this->list->fresh()->share_token);
        $this->assertTrue($item->fresh()->is_checked);
    }

    public function test_止めたリンク・運営が非公開にしたリストはコピーせず404(): void
    {
        $user = User::factory()->create();
        $moderated = PackingList::factory()->create(['share_token' => str_repeat('m', 32), 'moderated_at' => now()]);

        foreach ([str_repeat('z', 32), $moderated->share_token] as $token) {
            $this->actingAsUser($user)->postJson("/api/shared/lists/{$token}/copy")->assertNotFound()->assertJsonPath('code', 'not_found');
        }
        $this->assertSame(0, $user->packingLists()->count());
    }

    public function test_リスト100件・安全上限は公開リストのコピーと同じく422、1時間の回数には数えない(): void
    {
        $user = User::factory()->create();
        PackingList::factory()->count(100)->for($user)->create();
        $this->actingAsUser($user)->postJson('/api/shared/lists/'.self::TOKEN.'/copy')
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'リストは100件までです。', 'code' => 'list_limit_reached']);

        $other = User::factory()->create();
        $this->useItemAdditions($other, 1000);
        $this->fillItems($this->list, 2001);
        $this->app['auth']->forgetGuards();
        $this->actingAsUser($other)->postJson('/api/shared/lists/'.self::TOKEN.'/copy')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'item_limit_reached');

        $this->list->items()->limit(1)->delete();
        $this->postJson('/api/shared/lists/'.self::TOKEN.'/copy')->assertCreated();
        $this->assertSame(1000, $this->itemAdditions($other));
    }

    public function test_ログインとメール認証を先に確かめ、本文は受け付けない(): void
    {
        $this->postJson('/api/shared/lists/'.self::TOKEN.'/copy')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        $unverified = User::factory()->unverified()->create();
        $this->actingAsUser($unverified)->postJson('/api/shared/lists/'.self::TOKEN.'/copy')
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');

        $user = User::factory()->create();
        $this->app['auth']->forgetGuards();
        $this->actingAsUser($user)->postJson('/api/shared/lists/'.self::TOKEN.'/copy', ['title' => '改ざん'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.title', ['この項目は送信できません。']);
        $this->assertSame(0, $user->packingLists()->count() + $unverified->packingLists()->count());
    }
}
