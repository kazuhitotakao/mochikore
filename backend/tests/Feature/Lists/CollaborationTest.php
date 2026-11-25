<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\PackingListMember;
use App\Models\SavedItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * 共同編集の招待リンク・メンバー・権限（F-34、API-56〜62、D-119・D-43・D-50・D-97、V-27、C-03）。
 */
class CollaborationTest extends ListApiTestCase
{
    private const NOT_FOUND = ['message' => 'ページが見つかりません。', 'code' => 'not_found'];

    private User $owner;

    private User $member;

    private User $stranger;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['display_name' => 'おかあさん']);
        $this->member = User::factory()->create(['display_name' => 'たろう']);
        $this->stranger = User::factory()->create(['display_name' => 'しらない人']);
        $this->list = PackingList::factory()->for($this->owner)->create([
            'title' => '週末の買い物',
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
    }

    /**
     * 1つのテストの中で所有者・メンバーを入れ替えて送るので、前の人のログインを残さない。
     */
    protected function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return parent::actingAsUser($user);
    }

    private function addMember(User $user, ?PackingList $list = null): PackingListMember
    {
        return ($list ?? $this->list)->members()->create(['user_id' => $user->id]);
    }

    private function invite(?PackingList $list = null): string
    {
        return $this->actingAsUser($this->owner)
            ->postJson('/api/lists/'.($list ?? $this->list)->id.'/invite-link')
            ->assertOk()
            ->json('data.invite_token');
    }

    // ---- API-56・57 招待リンク ----

    public function test_所有者は32文字・7日で切れる招待リンクを作り、有効な間は同じリンクを返す(): void
    {
        $this->freezeSecond();
        $updatedAt = $this->list->updated_at->toJSON();

        $response = $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertOk();
        $token = $response->json('data.invite_token');

        $this->assertMatchesRegularExpression('/\A[A-Za-z0-9]{32}\z/', $token);
        $response->assertExactJson(['data' => [
            'invite_token' => $token,
            'invite_expires_at' => now()->addDays(7)->toJSON(),
        ]]);

        // 開き直して押しても同じリンクで、期限も延ばさない。送ったリンクを使えなくしない
        $this->travel(3)->days();
        $this->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertOk()
            ->assertJsonPath('data.invite_token', $token)
            ->assertJsonPath('data.invite_expires_at', now()->addDays(4)->toJSON());

        // D-24：招待はリストの内容ではないので、自分のリスト一覧の順番とrevisionを変えない
        $list = $this->list->fresh();
        $this->assertSame($updatedAt, $list->updated_at->toJSON());
        $this->assertSame(4, $list->grouping_revision);
        // API-07：所有者にだけ招待リンクを返す
        $this->getJson("/api/lists/{$this->list->id}")
            ->assertJsonPath('data.invite_token', $token)
            ->assertJsonPath('data.is_owner', true);
    }

    public function test_期限切れ・止めた後は別のリンクを作り、古いリンクは404(): void
    {
        $old = $this->invite();

        $this->travel(7)->days();
        $this->travel(1)->seconds();
        $this->actingAsUser($this->member)->getJson("/api/invites/{$old}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
        // 期限切れのリンクは、所有者の画面にも出さない
        $this->actingAsUser($this->owner)->getJson("/api/lists/{$this->list->id}")
            ->assertJsonPath('data.invite_token', null)
            ->assertJsonPath('data.invite_expires_at', null);

        $second = $this->invite();
        $this->assertNotSame($old, $second);

        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}/invite-link")->assertNoContent();
        // リンクがなくても成功にする
        $this->deleteJson("/api/lists/{$this->list->id}/invite-link")->assertNoContent();
        $this->assertNull($this->list->fresh()->invite_token);
        $this->actingAsUser($this->member)->getJson("/api/invites/{$second}")->assertNotFound();
        $this->postJson("/api/invites/{$second}/join")->assertNotFound();

        $this->assertNotSame($second, $this->invite());
    }

    public function test_表示名がない所有者は、表示名を入れて招待リンクを作る(): void
    {
        $this->owner->forceFill(['display_name' => null])->save();

        $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => '入力内容を確認してください。',
                'code' => 'validation_error',
                'errors' => ['display_name' => ['表示名を入力してください。']],
            ]);
        $this->assertNull($this->list->fresh()->invite_token);

        // V-27・C-01：前後の空白は標準どおり削ってから保存する
        $this->postJson("/api/lists/{$this->list->id}/invite-link", ['display_name' => '  おかあさん　'])->assertOk();
        $this->assertSame('おかあさん', $this->owner->fresh()->display_name);
        $this->assertNotNull($this->list->fresh()->invite_token);
    }

    public function test_公開中・リンクで共有中・運営が非公開にしたリストは招待リンクを作れない(): void
    {
        PackingListItem::factory()->for($this->list)->create();
        $notPrivate = ['message' => '公開中・リンクで共有中のリストは、共同編集にできません。', 'code' => 'list_not_private'];

        $this->list->forceFill(['is_public' => true])->save();
        $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertUnprocessable()->assertExactJson($notPrivate);

        $this->list->forceFill(['is_public' => false, 'share_token' => str_repeat('a', 32)])->save();
        $this->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertUnprocessable()->assertExactJson($notPrivate);

        $this->list->forceFill(['share_token' => null, 'moderated_at' => now()])->save();
        $this->postJson("/api/lists/{$this->list->id}/invite-link")
            ->assertForbidden()
            ->assertExactJson(['message' => 'このリストは運営により非公開になっています。', 'code' => 'list_moderated']);

        $this->assertNull($this->list->fresh()->invite_token);
    }

    public function test_共同編集中のリストは公開もリンクで共有もできない(): void
    {
        PackingListItem::factory()->for($this->list)->create();

        // 有効な招待リンクがあるだけでも、メンバーがいるだけでも共同編集中
        foreach (['invite', 'member'] as $state) {
            $list = PackingList::factory()->for($this->owner)->create();
            PackingListItem::factory()->for($list)->create();
            $state === 'invite' ? $this->invite($list) : $this->addMember($this->member, $list);

            $this->actingAsUser($this->owner)
                ->patchJson("/api/lists/{$list->id}/visibility", ['is_public' => true])
                ->assertUnprocessable()
                ->assertExactJson(['message' => '共同編集中のリストは公開できません。', 'code' => 'list_collaborative']);
            $this->postJson("/api/lists/{$list->id}/share-link")
                ->assertUnprocessable()
                ->assertExactJson(['message' => '共同編集中のリストは、リンクで共有できません。', 'code' => 'list_collaborative']);

            $list->refresh();
            $this->assertFalse($list->is_public);
            $this->assertNull($list->share_token);
        }

        // 招待リンクを止め、メンバーもいなければ、今までどおり公開・リンクで共有できる
        $this->invite();
        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}/invite-link")->assertNoContent();
        $this->patchJson("/api/lists/{$this->list->id}/visibility", ['is_public' => true])->assertOk();
        $this->postJson("/api/lists/{$this->list->id}/share-link")->assertOk();
    }

    public function test_招待リンクは本文を受け取らず、表示名のほかの項目は422(): void
    {
        $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/invite-link", ['invite_token' => str_repeat('a', 32)])
            ->assertUnprocessable()
            ->assertJsonPath('errors.invite_token.0', 'この項目は送信できません。');
        $this->invite();
        $this->deleteJson("/api/lists/{$this->list->id}/invite-link", ['user_id' => $this->member->id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.user_id.0', 'この項目は送信できません。');
        $this->assertNotNull($this->list->fresh()->invite_token);
    }

    // ---- API-61・62 招待を見て参加する ----

    public function test_招待リンクを開いた人は、リスト名・所有者の表示名・人数を見て参加できる(): void
    {
        PackingListItem::factory()->for($this->list)->create(['name' => '牛乳']);
        $token = $this->invite();
        $updatedAt = $this->list->fresh()->updated_at->toJSON();

        // 参加する前は、持ち物・メールアドレスを返さない
        $this->actingAsUser($this->member)->getJson("/api/invites/{$token}")
            ->assertOk()
            ->assertExactJson(['data' => [
                'list' => ['id' => $this->list->id, 'title' => '週末の買い物'],
                'owner_display_name' => 'おかあさん',
                'member_count' => 0,
                'status' => 'joinable',
            ]]);
        $this->getJson("/api/lists/{$this->list->id}")->assertNotFound();

        $this->postJson("/api/invites/{$token}/join")
            ->assertOk()
            ->assertExactJson(['data' => ['list' => ['id' => $this->list->id, 'title' => '週末の買い物']]]);

        $this->assertDatabaseHas('packing_list_members', ['packing_list_id' => $this->list->id, 'user_id' => $this->member->id]);
        // 参加はリストの内容ではないので、一覧の順番を変えない
        $this->assertSame($updatedAt, $this->list->fresh()->updated_at->toJSON());

        // 送り直しても2人にならず、同じ応答
        $this->postJson("/api/invites/{$token}/join")->assertOk();
        $this->assertSame(1, $this->list->members()->count());
        $this->getJson("/api/invites/{$token}")->assertJsonPath('data.status', 'member')->assertJsonPath('data.member_count', 1);
        // 所有者が自分のリンクを開いても、メンバーにはならない
        $this->actingAsUser($this->owner)->getJson("/api/invites/{$token}")->assertJsonPath('data.status', 'owner');
        $this->postJson("/api/invites/{$token}/join")->assertOk();
        $this->assertSame(1, $this->list->members()->count());
    }

    public function test_表示名がない人は、表示名を入れて参加する(): void
    {
        $token = $this->invite();
        $this->member->forceFill(['display_name' => null])->save();

        $this->actingAsUser($this->member)->postJson("/api/invites/{$token}/join")
            ->assertUnprocessable()
            ->assertJsonPath('errors.display_name.0', '表示名を入力してください。');
        $this->assertSame(0, $this->list->members()->count());

        $this->postJson("/api/invites/{$token}/join", ['display_name' => 'たろう'])->assertOk();
        $this->assertSame('たろう', $this->member->fresh()->display_name);
        $this->assertSame(1, $this->list->members()->count());
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidDisplayNames')]
    public function test_表示名が正しくなければ422で参加しない(array $body, string $message): void
    {
        $token = $this->invite();

        $this->actingAsUser($this->member)->postJson("/api/invites/{$token}/join", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.display_name.0', $message);
        $this->assertSame(0, $this->list->members()->count());
        $this->assertSame('たろう', $this->member->fresh()->display_name);
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalidDisplayNames(): array
    {
        return [
            '21文字' => [['display_name' => str_repeat('あ', 21)], '表示名は20文字以内で入力してください。'],
            '途中の改行' => [['display_name' => "たろ\nう"], '表示名は改行せずに入力してください。'],
            '数値' => [['display_name' => 123], '表示名を文字で入力してください。'],
            '配列' => [['display_name' => ['たろう']], '表示名を文字で入力してください。'],
        ];
    }

    public function test_10人のリストには参加できず、参加は100件まで(): void
    {
        $token = $this->invite();
        // 所有者を入れて10人
        User::factory()->count(9)->create()->each(fn (User $user) => $this->addMember($user));

        $this->actingAsUser($this->member)->getJson("/api/invites/{$token}")
            ->assertJsonPath('data.status', 'full')
            ->assertJsonPath('data.member_count', 9);
        $this->postJson("/api/invites/{$token}/join")
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'このリストのメンバーは10人までです。', 'code' => 'member_limit_reached']);

        // 自分のリストとは別に、参加は100件まで
        $second = PackingList::factory()->for($this->owner)->create();
        $secondToken = $this->invite($second);
        PackingList::factory()->count(100)->for($this->owner)->create()
            ->each(fn (PackingList $list) => $this->addMember($this->member, $list));

        $this->actingAsUser($this->member)->postJson("/api/invites/{$secondToken}/join")
            ->assertUnprocessable()
            ->assertExactJson(['message' => '参加できるリストは100件までです。', 'code' => 'joined_list_limit_reached']);
        $this->assertSame(100, $this->member->memberships()->count());
    }

    public function test_形の違う招待リンク・未ログイン・メール未認証は使えない(): void
    {
        $token = $this->invite();

        $this->actingAsUser($this->member)->getJson('/api/invites/'.substr($token, 1))->assertNotFound();
        $this->getJson('/api/invites/'.str_repeat('z', 32))->assertNotFound()->assertExactJson(self::NOT_FOUND);
        $this->postJson('/api/invites/'.str_repeat('z', 32).'/join')->assertNotFound();

        $this->actingAsUser(User::factory()->unverified()->create())
            ->postJson("/api/invites/{$token}/join", ['display_name' => 'みかくにん'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => ''])->getJson("/api/invites/{$token}")->assertUnauthorized();
        $this->assertSame(0, $this->list->members()->count());
    }

    // ---- API-58〜60 メンバーの一覧・外す・抜ける ----

    public function test_メンバーの一覧は表示名だけを参加した順に返し、所有者とメンバーが見られる(): void
    {
        $this->freezeSecond();
        $first = $this->addMember($this->member);
        $this->travel(1)->minutes();
        $second = $this->addMember($this->stranger);

        $this->actingAsUser($this->member)->getJson("/api/lists/{$this->list->id}/members")
            ->assertOk()
            ->assertExactJson(['data' => [
                'owner' => ['display_name' => 'おかあさん', 'is_me' => false],
                'members' => [
                    ['id' => $first->id, 'display_name' => 'たろう', 'joined_at' => $first->created_at->toJSON(), 'is_me' => true],
                    ['id' => $second->id, 'display_name' => 'しらない人', 'joined_at' => $second->created_at->toJSON(), 'is_me' => false],
                ],
            ]]);
        $this->actingAsUser($this->owner)->getJson("/api/lists/{$this->list->id}/members")
            ->assertOk()
            ->assertJsonPath('data.owner.is_me', true)
            ->assertJsonPath('data.members.0.is_me', false);

        // メンバーでない人には、リストがあることを知らせない
        $this->actingAsUser(User::factory()->create())->getJson("/api/lists/{$this->list->id}/members")
            ->assertNotFound()->assertExactJson(self::NOT_FOUND);
    }

    public function test_所有者はメンバーを外せ、外された人は404になり、足した持ち物は残る(): void
    {
        $row = $this->addMember($this->member);
        $this->actingAsUser($this->member)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => 'たろうの牛乳'])
            ->assertCreated();
        $updatedAt = $this->list->fresh()->updated_at->toJSON();

        // メンバーはほかのメンバーを外せない（所有者だけの操作は404）
        $other = $this->addMember($this->stranger);
        $this->deleteJson("/api/lists/{$this->list->id}/members/{$other->id}")->assertNotFound();
        // ほかのリストのメンバーの番号は404
        $otherList = PackingList::factory()->for($this->owner)->create();
        $otherRow = $this->addMember($this->member, $otherList);
        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}/members/{$otherRow->id}")->assertNotFound();
        $this->assertDatabaseHas('packing_list_members', ['id' => $otherRow->id]);

        $this->deleteJson("/api/lists/{$this->list->id}/members/{$row->id}")->assertNoContent();

        $this->assertDatabaseMissing('packing_list_members', ['id' => $row->id]);
        $this->assertDatabaseHas('packing_list_items', ['packing_list_id' => $this->list->id, 'name' => 'たろうの牛乳', 'deleted_at' => null]);
        $this->assertSame($updatedAt, $this->list->fresh()->updated_at->toJSON());
        $this->actingAsUser($this->member)->getJson("/api/lists/{$this->list->id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
        $this->postJson("/api/lists/{$this->list->id}/items", ['name' => 'もう足せない'])->assertNotFound();
    }

    public function test_メンバーは自分で抜けられ、所有者・メンバーでない人は404(): void
    {
        $this->addMember($this->member);
        $this->addMember($this->stranger);

        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}/membership")->assertNotFound();
        $this->actingAsUser(User::factory()->create())->deleteJson("/api/lists/{$this->list->id}/membership")->assertNotFound();
        $this->assertSame(2, $this->list->members()->count());

        $this->actingAsUser($this->member)->deleteJson("/api/lists/{$this->list->id}/membership")->assertNoContent();

        $this->assertSame([$this->stranger->id], $this->list->members()->pluck('user_id')->all());
        $this->getJson("/api/lists/{$this->list->id}")->assertNotFound();
        // 抜けた後にもう一度送っても404
        $this->deleteJson("/api/lists/{$this->list->id}/membership")->assertNotFound();
    }

    // ---- 権限：メンバーは中身だけ、所有者だけの操作は404 ----

    public function test_メンバーは一覧と内容を見られ、限定公開・招待のリンクは返らない(): void
    {
        $this->addMember($this->member);
        $this->invite();
        $own = PackingList::factory()->for($this->member)->create(['updated_at' => now()->subDays(2)]);

        $response = $this->actingAsUser($this->member)->getJson('/api/lists')->assertOk();
        // D-24：参加しているリストも、更新が新しい順に混ぜる
        $this->assertSame([$this->list->id, $own->id], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('data.0.is_owner', false)->assertJsonPath('data.0.member_count', 1)
            ->assertJsonPath('data.1.is_owner', true)->assertJsonPath('data.1.member_count', 0);
        // 所有者の一覧でも、メンバーがいる数が分かる
        $this->actingAsUser($this->owner)->getJson('/api/lists')
            ->assertJsonPath('data.0.is_owner', true)->assertJsonPath('data.0.member_count', 1);

        $this->actingAsUser($this->member)->getJson("/api/lists/{$this->list->id}")
            ->assertOk()
            ->assertJsonPath('data.is_owner', false)
            ->assertJsonPath('data.member_count', 1)
            // 招待リンクを扱えるのは所有者だけなので、メンバーには返さない
            ->assertJsonPath('data.invite_token', null)
            ->assertJsonPath('data.invite_expires_at', null)
            ->assertJsonPath('data.share_token', null);
        // F-35：グループ整理（SC-09）も、共同編集のリストかを見分けられる
        $this->getJson("/api/lists/{$this->list->id}/grouping")
            ->assertOk()
            ->assertJsonPath('data.is_owner', false)
            ->assertJsonPath('data.member_count', 1);
    }

    public function test_メンバーは持ち物とグループを追加・変更・チェック・並べ替え・削除できる(): void
    {
        $this->addMember($this->member);
        $group = PackingListGroup::factory()->for($this->list)->create(['name' => '冷蔵', 'sort_order' => 0]);
        $egg = PackingListItem::factory()->for($this->list)->create(['name' => '卵', 'sort_order' => 1]);
        $bread = PackingListItem::factory()->for($this->list)->create(['name' => 'パン', 'sort_order' => 2]);
        $saved = SavedItem::factory()->for($this->member)->create(['name' => '牛乳', 'category_id' => $this->list->category_id]);
        $id = $this->list->id;

        $this->actingAsUser($this->member);
        $milk = $this->postJson("/api/lists/{$id}/items", ['name' => 'バター'])->assertCreated()->json('data.id');
        $this->patchJson("/api/items/{$egg->id}", ['name' => 'たまご', 'is_checked' => true])->assertOk();
        $this->patchJson("/api/lists/{$id}/items/checks", ['item_ids' => [$bread->id], 'is_checked' => true])->assertOk();
        $this->patchJson("/api/lists/{$id}/items/order", ['item_ids' => [$bread->id, $egg->id, $milk]])->assertNoContent();
        $this->patchJson("/api/groups/{$group->id}", ['name' => '冷蔵庫'])->assertOk();
        $this->patchJson("/api/groups/{$group->id}/check", ['is_checked' => true])->assertNoContent();
        $this->patchJson("/api/lists/{$id}/groups/order", ['group_ids' => [$group->id]])->assertNoContent();
        $this->postJson("/api/lists/{$id}/reset-checks")->assertNoContent();
        $this->deleteJson("/api/items/{$bread->id}")->assertOk();
        $this->postJson("/api/items/{$bread->id}/restore")->assertOk();
        $this->postJson("/api/lists/{$id}/items/bulk-delete", ['item_ids' => [$bread->id], 'group_ids' => []])->assertOk();

        $revision = $this->list->fresh()->grouping_revision;
        // メンバー本人のよく使う項目から足せる
        $this->postJson("/api/lists/{$id}/items/bulk", ['saved_item_ids' => [$saved->id], 'base_revision' => $revision])->assertCreated();
        $grouping = $this->getJson("/api/lists/{$id}/grouping")->assertOk()->json('data');
        $this->putJson("/api/lists/{$id}/grouping", [
            'base_revision' => $grouping['grouping_revision'],
            'groups' => [['key' => 'g1', 'id' => $group->id, 'name' => '冷蔵庫', 'check_mode' => 'normal']],
            'assignments' => array_map(fn (array $item) => ['item_id' => $item['id'], 'group_key' => 'g1'], $grouping['items']),
        ])->assertOk();

        $this->assertSame(
            ['たまご', 'バター', '牛乳'],
            $this->list->items()->orderBy('sort_order')->orderBy('id')->pluck('name')->all(),
        );
        $this->assertSame(3, $this->list->items()->where('group_id', $group->id)->count());
    }

    public function test_メンバーはリストの編集・削除・公開・リンクで共有・招待ができず404(): void
    {
        $this->addMember($this->member);
        PackingListItem::factory()->for($this->list)->create();
        $id = $this->list->id;

        $this->actingAsUser($this->member);
        $this->patchJson("/api/lists/{$id}", ['title' => '書き換え'])->assertNotFound()->assertExactJson(self::NOT_FOUND);
        $this->deleteJson("/api/lists/{$id}")->assertNotFound();
        $this->patchJson("/api/lists/{$id}/visibility", ['is_public' => true])->assertNotFound();
        $this->postJson("/api/lists/{$id}/share-link")->assertNotFound();
        $this->deleteJson("/api/lists/{$id}/share-link")->assertNotFound();
        $this->postJson("/api/lists/{$id}/invite-link")->assertNotFound();
        $this->deleteJson("/api/lists/{$id}/invite-link")->assertNotFound();

        $list = $this->list->fresh();
        $this->assertSame('週末の買い物', $list->title);
        $this->assertFalse($list->is_public);
        $this->assertNull($list->share_token);
        $this->assertNull($list->invite_token);
    }

    public function test_持ち物を足す回数は、足した本人で数える(): void
    {
        $this->addMember($this->member);
        // D-97：所有者が上限まで足していても、メンバーは自分の回数で足せる
        $this->useItemAdditions($this->owner, PackingListItem::MAX_ADDED_PER_HOUR);

        $this->actingAsUser($this->member)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '牛乳'])
            ->assertCreated();
        $this->assertSame(1, $this->itemAdditions($this->member));
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR, $this->itemAdditions($this->owner));

        $item = $this->list->items()->firstOrFail();
        $this->deleteJson("/api/items/{$item->id}")->assertOk();
        $this->postJson("/api/items/{$item->id}/restore")->assertOk();
        $this->assertSame(2, $this->itemAdditions($this->member));

        $this->actingAsUser($this->owner)
            ->postJson("/api/lists/{$this->list->id}/items", ['name' => '卵'])
            ->assertTooManyRequests();
    }

    public function test_メンバーは複製して自分のリストにでき、参加しているリストへコピー・移動できる(): void
    {
        $this->addMember($this->member);
        $shared = PackingListItem::factory()->for($this->list)->create(['name' => '牛乳']);
        $own = PackingList::factory()->for($this->member)->create();
        $ownItem = PackingListItem::factory()->for($own)->create(['name' => '卵']);

        $this->actingAsUser($this->member);
        // 複製は本人の非公開リストになり、メンバーは引き継がない
        $copyId = $this->postJson("/api/lists/{$this->list->id}/duplicate", ['title' => '自分用'])->assertCreated()->json('data.id');
        $copy = PackingList::findOrFail($copyId);
        $this->assertSame($this->member->id, $copy->user_id);
        $this->assertSame(0, $copy->members()->count());
        $this->assertNull($copy->invite_token);

        // 自分のリストから、参加しているリストへ移す
        $this->postJson("/api/lists/{$own->id}/items/move", [
            'item_ids' => [$ownItem->id],
            'destination_list_id' => $this->list->id,
        ])->assertOk();
        $this->assertSame($this->list->id, $ownItem->fresh()->packing_list_id);
        // 参加しているリストから、自分のリストへコピーする
        $this->postJson("/api/lists/{$this->list->id}/items/copy", [
            'item_ids' => [$shared->id],
            'destination_list_id' => $own->id,
        ])->assertCreated();
        $this->assertSame(['牛乳'], $own->items()->pluck('name')->all());

        // 参加していない人のリストは、今までどおり移し先にできない
        $this->postJson("/api/lists/{$own->id}/items/copy", [
            'item_ids' => [$own->items()->firstOrFail()->id],
            'destination_list_id' => PackingList::factory()->for($this->stranger)->create()->id,
        ])->assertUnprocessable()->assertJsonPath('errors.destination_list_id.0', '移し先のリストを選び直してください。');
    }

    // ---- 削除・退会 ----

    public function test_所有者がリストを削除・退会するとメンバーも消え、メンバーの退会は外れるだけ(): void
    {
        $this->addMember($this->member);
        $this->addMember($this->stranger);
        $second = PackingList::factory()->for($this->owner)->create();
        $this->addMember($this->member, $second);
        PackingListItem::factory()->for($this->list)->create(['name' => '牛乳']);

        // メンバーが退会しても、リストと持ち物は残る
        $this->stranger->delete();
        $this->assertSame([$this->member->id], $this->list->members()->pluck('user_id')->all());
        $this->assertSame(1, $this->list->items()->count());

        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->list->id}")->assertNoContent();
        $this->assertDatabaseMissing('packing_list_members', ['packing_list_id' => $this->list->id]);
        $this->actingAsUser($this->member)->getJson("/api/lists/{$this->list->id}")->assertNotFound();

        // 所有者の退会では、リストごと消える
        $this->owner->delete();
        $this->assertDatabaseCount('packing_list_members', 0);
        $this->assertDatabaseMissing('packing_lists', ['id' => $second->id]);
        $this->assertDatabaseHas('users', ['id' => $this->member->id]);
    }
}
