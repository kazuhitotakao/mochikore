<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-53・54 公開リスト・限定公開のリストから、選んだ持ち物を自分のリストへ取り込む（F-33、SC-11・SC-18、
 * D-118・D-24・D-43・D-48・D-50・D-59・D-97・D-106・D-114・D-117）。入力は V-26（09_バリデーション）と C-01〜08。
 */
class ImportItemsTest extends ListApiTestCase
{
    private User $user;

    private User $owner;

    private PackingList $public;

    private PackingList $shared;

    private PackingList $target;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->owner = User::factory()->create();
        $this->public = PackingList::factory()->for($this->owner)->create([
            'title' => 'キャンプの持ち物', 'category_id' => $this->categoryId('趣味・スポーツ'),
            'is_public' => true, 'grouping_revision' => 3, 'updated_at' => now()->subDays(2),
        ]);
        // D-114：限定公開のリンクは、非公開のままでも使える
        $this->shared = PackingList::factory()->for($this->owner)->create([
            'title' => '家族の旅行', 'share_token' => Str::random(PackingList::SHARE_TOKEN_LENGTH),
        ]);
        $this->target = PackingList::factory()->for($this->user)->create([
            'title' => '夏のキャンプ', 'grouping_revision' => 5, 'updated_at' => now()->subDay(),
        ]);
    }

    private function publicPath(?PackingList $list = null): string
    {
        return '/api/public/lists/'.($list ?? $this->public)->id.'/items/import';
    }

    private function sharedPath(?string $token = null): string
    {
        return '/api/shared/lists/'.($token ?? $this->shared->share_token).'/items/import';
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function send(string $path, array $body): TestResponse
    {
        return $this->actingAsUser($this->user)->postJson($path, $body);
    }

    public function test_公開リストから選んだ持ち物を、元の並び順で末尾に未チェックで取り込み、元のリストは変えない(): void
    {
        $group = PackingListGroup::factory()->for($this->public)->create(['name' => '寝具']);
        $sleepingBag = PackingListItem::factory()->for($this->public)->create(['name' => '寝袋', 'sort_order' => 5, 'group_id' => $group->id, 'is_checked' => true]);
        $lantern = PackingListItem::factory()->for($this->public)->create(['name' => 'ランタン', 'sort_order' => 2]);
        PackingListItem::factory()->for($this->public)->create(['name' => '選ばない', 'sort_order' => 3]);
        PackingListItem::factory()->for($this->target)->create(['name' => 'ランタン', 'sort_order' => 7]);
        // D-106：空でチェックを記録していたグループに入れたら、記録を外す
        $targetGroup = PackingListGroup::factory()->for($this->target)->create(['name' => '道具', 'is_checked' => true]);
        $publicUpdatedAt = $this->public->fresh()->updated_at->toJSON();

        // 取り込み先と件数だけを返し、元のリストの情報は返さない
        $this->send($this->publicPath(), [
            'item_ids' => [$sleepingBag->id, $lantern->id],
            'destination_list_id' => $this->target->id,
            'destination_group_id' => $targetGroup->id,
        ])->assertCreated()->assertExactJson(['data' => [
            'list' => ['id' => $this->target->id, 'title' => '夏のキャンプ'],
            'count' => 2,
        ]]);

        // 元の並び順のまま、末尾（最大値＋1）から。同じ名前も別の持ち物として入れる（D-29）
        $imported = $this->target->items()->where('sort_order', '>', 7)->orderBy('sort_order')->get();
        $this->assertSame(['ランタン', '寝袋'], $imported->pluck('name')->all());
        $this->assertSame([8, 9], $imported->pluck('sort_order')->all());
        $this->assertSame([false, false], $imported->pluck('is_checked')->all());
        $this->assertSame([$targetGroup->id, $targetGroup->id], $imported->pluck('group_id')->all());
        $this->assertFalse($targetGroup->fresh()->is_checked);
        // グループそのものは写さない
        $this->assertSame(1, $this->target->groups()->count());

        // 元のリストは変わらない（持ち物・チェック・revision・更新日時）
        $this->assertSame(3, $this->public->items()->count());
        $this->assertTrue($sleepingBag->fresh()->is_checked);
        $this->assertSame(3, $this->public->fresh()->grouping_revision);
        $this->assertSame($publicUpdatedAt, $this->public->fresh()->updated_at->toJSON());
        // D-24・D-59：取り込み先は revision を増やし、一覧の上に戻る
        $this->assertSame(6, $this->target->fresh()->grouping_revision);
        $this->getJson('/api/lists')->assertJsonPath('data.0.id', $this->target->id);
        // D-97：持ち物が増えるので、件数で1時間の回数に数える
        $this->assertSame(2, $this->itemAdditions($this->user));
    }

    public function test_限定公開のリンクのリストから、非公開のままでも取り込める(): void
    {
        $item = PackingListItem::factory()->for($this->shared)->create(['name' => '保険証', 'is_checked' => true]);

        $this->send($this->sharedPath(), [
            'item_ids' => [$item->id],
            'destination_list_id' => $this->target->id,
        ])->assertCreated()->assertExactJson(['data' => [
            'list' => ['id' => $this->target->id, 'title' => '夏のキャンプ'],
            'count' => 1,
        ]]);

        $this->assertSame(['保険証'], $this->target->items()->pluck('name')->all());
        $this->assertFalse($this->target->items()->sole()->is_checked);
        $this->assertNull($this->target->items()->sole()->group_id);
        $this->assertFalse($this->shared->fresh()->is_public);
        $this->assertSame(1, $this->shared->items()->count());
    }

    public function test_新しいリストを作って取り込め、カテゴリーは元と同じで非公開、コピー元は記録しない(): void
    {
        $item = PackingListItem::factory()->for($this->public)->create(['name' => 'テント']);

        $id = $this->send($this->publicPath(), [
            'item_ids' => [$item->id],
            'destination_list_id' => null,
            'new_list_title' => ' キャンプの持ち物（コピー） ',
        ])->assertCreated()->assertJsonPath('data.list.title', 'キャンプの持ち物（コピー）')->json('data.list.id');

        $created = PackingList::findOrFail($id);
        $this->assertSame($this->user->id, $created->user_id);
        $this->assertSame($this->public->category_id, $created->category_id);
        $this->assertFalse($created->is_public);
        // D-118（利用者の指示）：一部の取り込みは、よくコピーされている順（D-117）に数えない
        $this->assertNull($created->source_list_id);
        $this->assertSame(['テント'], $created->items()->pluck('name')->all());
        $this->getJson('/api/public/lists?sort=most_copied')->assertJsonPath('data.0.id', $this->public->id);
    }

    public function test_自分の公開リストからも取り込め、元と同じリストは選べない(): void
    {
        $own = PackingList::factory()->for($this->user)->create(['is_public' => true]);
        $item = PackingListItem::factory()->for($own)->create();

        $this->send($this->publicPath($own), ['item_ids' => [$item->id], 'destination_list_id' => $own->id])
            ->assertUnprocessable()->assertJsonPath('errors.destination_list_id', ['取り込み先のリストを選び直してください。']);
        $this->assertSame(1, $own->items()->count());

        $this->send($this->publicPath($own), ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id])
            ->assertCreated();
        $this->assertSame(1, $this->target->items()->count());
    }

    public function test_公開でない・運営が非公開・止めたリンク・存在しないリストからは404で、回数にも数えない(): void
    {
        $private = PackingList::factory()->for($this->owner)->create();
        $privateItem = PackingListItem::factory()->for($private)->create();
        $sharedItem = PackingListItem::factory()->for($this->shared)->create();
        $moderated = PackingList::factory()->for($this->owner)->create([
            'is_public' => true, 'moderated_at' => now(), 'share_token' => Str::random(PackingList::SHARE_TOKEN_LENGTH),
        ]);
        $moderatedItem = PackingListItem::factory()->for($moderated)->create();
        $stopped = Str::random(PackingList::SHARE_TOKEN_LENGTH);

        $cases = [
            [$this->publicPath($private), $privateItem->id],
            [$this->publicPath($moderated), $moderatedItem->id],
            ['/api/public/lists/9999999/items/import', $privateItem->id],
            [$this->sharedPath($moderated->share_token), $moderatedItem->id],
            [$this->sharedPath($stopped), $sharedItem->id],
            // 形の違うリンクは経路に合わず404
            [$this->sharedPath(substr($stopped, 1)), $sharedItem->id],
        ];
        foreach ($cases as [$path, $itemId]) {
            $this->send($path, ['item_ids' => [$itemId], 'destination_list_id' => $this->target->id])
                ->assertNotFound()->assertJsonPath('code', 'not_found');
        }
        $this->assertSame(0, $this->target->items()->count());
        $this->assertSame(0, $this->itemAdditions($this->user));
    }

    public function test_件数で1時間の回数に数え、超えるときは1件も入れない(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->public)->create();
        $this->useItemAdditions($this->user, PackingListItem::MAX_ADDED_PER_HOUR - 1);

        $this->send($this->publicPath(), ['item_ids' => $items->modelKeys(), 'destination_list_id' => $this->target->id])
            ->assertTooManyRequests()->assertJsonPath('code', 'too_many_requests');
        $this->assertSame(0, $this->target->items()->count());
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR - 1, $this->itemAdditions($this->user));

        $this->send($this->publicPath(), ['item_ids' => [$items[0]->id], 'destination_list_id' => $this->target->id])
            ->assertCreated();
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR, $this->itemAdditions($this->user));
    }

    public function test_リスト100件・取り込み先の安全上限のときは何も変えず、回数にも数えない(): void
    {
        $items = PackingListItem::factory()->count(2)->for($this->public)->create();
        PackingList::factory()->count(PackingList::MAX_PER_USER - 1)->for($this->user)->create();
        $this->send($this->publicPath(), [
            'item_ids' => [$items[0]->id], 'destination_list_id' => null, 'new_list_title' => '101件目',
        ])->assertUnprocessable()->assertExactJson(['message' => 'リストは100件までです。', 'code' => 'list_limit_reached']);
        $this->assertSame(PackingList::MAX_PER_USER, $this->user->packingLists()->count());

        $this->fillItems($this->target, PackingListItem::MAX_PER_LIST - 1);
        $this->send($this->sharedPath(), [
            'item_ids' => [PackingListItem::factory()->for($this->shared)->create()->id, PackingListItem::factory()->for($this->shared)->create()->id],
            'destination_list_id' => $this->target->id,
        ])->assertUnprocessable()->assertExactJson(['message' => '1つのリストに入れられる持ち物は2,000件までです。', 'code' => 'item_limit_reached']);
        $this->assertSame(PackingListItem::MAX_PER_LIST - 1, $this->target->items()->count());
        $this->assertSame(0, $this->itemAdditions($this->user));
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function invalidBodies(): array
    {
        return [
            '持ち物を選んでいない' => ['empty', 'item_ids'],
            '同じ持ち物を2回' => ['duplicate', 'item_ids.1'],
            '文字のID' => ['string-id', 'item_ids.0'],
            '別のリストの持ち物' => ['other-item', 'item_ids'],
            '削除した持ち物' => ['deleted-item', 'item_ids'],
            '2,001件' => ['too-many', 'item_ids'],
            '取り込み先を省略' => ['no-destination', 'destination_list_id'],
            '他人のリスト' => ['others-list', 'destination_list_id'],
            '存在しないリスト' => ['missing-list', 'destination_list_id'],
            '取り込み先と新しい名前の両方' => ['both', 'new_list_title'],
            '取り込み先のものでないグループ' => ['other-group', 'destination_group_id'],
            '新しいリストにグループ' => ['new-with-group', 'destination_group_id'],
            '新しいリストの名前が空' => ['empty-title', 'new_list_title'],
            '新しいリストの名前が51文字' => ['long-title', 'new_list_title'],
            '定義していない項目' => ['undefined', 'is_checked'],
        ];
    }

    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で何も変えない(string $case, string $field): void
    {
        $publicItem = PackingListItem::factory()->for($this->public)->create();
        $sharedItem = PackingListItem::factory()->for($this->shared)->create();
        $othersList = PackingList::factory()->for($this->owner)->create();
        $otherGroup = PackingListGroup::factory()->for($this->public)->create();
        $message = match ($case) {
            'empty' => '取り込む持ち物を選んでください。',
            'too-many' => '一度に選べる持ち物は2,000件までです。',
            'no-destination', 'others-list', 'missing-list', 'both' => '取り込み先のリストを選び直してください。',
            'other-group', 'new-with-group' => '入れるグループを選び直してください。',
            'empty-title' => 'リスト名を入力してください。',
            'long-title' => 'リスト名は50文字以内で入力してください。',
            'undefined' => 'この項目は送信できません。',
            default => '選んだ持ち物の情報が正しくありません。リストを読み直してください。',
        };
        $counts = [PackingList::count(), PackingListItem::count()];

        foreach ([[$this->publicPath(), $publicItem, $sharedItem], [$this->sharedPath(), $sharedItem, $publicItem]] as [$path, $item, $elsewhere]) {
            $deleted = PackingListItem::factory()->for($item->packingList)->create(['deleted_at' => now()]);
            $base = ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id];
            $body = match ($case) {
                'empty' => [...$base, 'item_ids' => []],
                'duplicate' => [...$base, 'item_ids' => [$item->id, $item->id]],
                'string-id' => [...$base, 'item_ids' => [(string) $item->id]],
                'other-item' => [...$base, 'item_ids' => [$elsewhere->id]],
                'deleted-item' => [...$base, 'item_ids' => [$deleted->id]],
                'too-many' => [...$base, 'item_ids' => range(1, PackingListItem::MAX_PER_LIST + 1)],
                'no-destination' => ['item_ids' => [$item->id]],
                'others-list' => [...$base, 'destination_list_id' => $othersList->id],
                'missing-list' => [...$base, 'destination_list_id' => 9999999],
                'both' => [...$base, 'new_list_title' => '新しいリスト'],
                'other-group' => [...$base, 'destination_group_id' => $otherGroup->id],
                'new-with-group' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => '新しい', 'destination_group_id' => $otherGroup->id],
                'empty-title' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => '　'],
                'long-title' => ['item_ids' => [$item->id], 'destination_list_id' => null, 'new_list_title' => str_repeat('あ', 51)],
                'undefined' => [...$base, 'is_checked' => true],
            };

            $response = $this->send($path, $body)->assertUnprocessable()->assertJsonPath('code', 'validation_error');
            // 項目名に「.」を含む（item_ids.0 など）ので、パスではなく項目名のまま取り出す
            $this->assertSame([$message], $response->json('errors')[$field] ?? null, $path);
        }
        // 削除した持ち物（ループの中で作る）は数に入らない
        $this->assertSame($counts, [PackingList::count(), PackingListItem::count()]);
        // 他人のリストには入れない
        $this->assertSame(0, $othersList->items()->count());
        $this->assertSame(0, $this->target->items()->count());
        $this->assertSame(0, $this->itemAdditions($this->user));
    }

    public function test_ログイン・メール認証を確かめる(): void
    {
        $item = PackingListItem::factory()->for($this->public)->create();
        $body = ['item_ids' => [$item->id], 'destination_list_id' => $this->target->id];

        $unverified = User::factory()->unverified()->create();
        foreach ([$this->publicPath(), $this->sharedPath()] as $path) {
            $this->app['auth']->forgetGuards();
            $this->actingAsUser($unverified)->postJson($path, $body)
                ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
            $this->app['auth']->forgetGuards();
            $this->withoutToken()->postJson($path, $body)
                ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        }
        $this->assertSame(0, $this->target->items()->count());
    }
}
