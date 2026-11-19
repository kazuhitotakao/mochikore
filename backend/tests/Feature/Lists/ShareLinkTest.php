<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;

/**
 * API-46・47 限定公開のリンクを作る・止める（F-29、SC-07-4、D-114・D-24・D-43・D-48、C-03）。
 */
class ShareLinkTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 4,
            'updated_at' => now()->subDay(),
        ]);
    }

    public function test_推測できない32文字のリンクを作り、作り直さずに同じリンクを返す(): void
    {
        $token = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/share-link")
            ->assertOk()
            ->json('data.share_token');

        $this->assertMatchesRegularExpression('/\A[A-Za-z0-9]{32}\z/', $token);
        $this->assertSame($token, $this->list->fresh()->share_token);

        // 開き直して押しても同じリンク。送ったリンクを使えなくしない
        $this->postJson("/api/lists/{$this->list->id}/share-link")
            ->assertOk()
            ->assertExactJson(['data' => ['share_token' => $token]]);
        $this->getJson("/api/lists/{$this->list->id}")->assertJsonPath('data.share_token', $token);
    }

    public function test_非公開のまま、持ち物0件でも作れ、一覧の順番とrevisionは変えない(): void
    {
        $updatedAt = $this->list->updated_at->toJSON();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/share-link")
            ->assertOk();

        $list = $this->list->fresh();
        $this->assertFalse($list->is_public);
        $this->assertSame(0, $list->items()->count());
        // D-24：リンクはリストの内容ではないので、自分のリスト一覧の順番を変えない
        $this->assertSame($updatedAt, $list->updated_at->toJSON());
        $this->assertSame(4, $list->grouping_revision);
    }

    public function test_止めると空になり、止めたリンクは404で、作り直すと別のリンクになる(): void
    {
        PackingListItem::factory()->for($this->list)->create();
        $old = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/share-link")
            ->json('data.share_token');
        $updatedAt = $this->list->fresh()->updated_at->toJSON();

        $this->deleteJson("/api/lists/{$this->list->id}/share-link")->assertNoContent();

        $list = $this->list->fresh();
        $this->assertNull($list->share_token);
        $this->assertSame($updatedAt, $list->updated_at->toJSON());
        $this->getJson("/api/shared/lists/{$old}")->assertNotFound()->assertJsonPath('code', 'not_found');

        // リンクがなくても止める操作は成功にする（送り直しでエラーにしない）
        $this->deleteJson("/api/lists/{$this->list->id}/share-link")->assertNoContent();

        $new = $this->postJson("/api/lists/{$this->list->id}/share-link")->json('data.share_token');
        $this->assertNotSame($old, $new);
        $this->getJson("/api/shared/lists/{$new}")->assertOk();
    }

    public function test_運営が非公開にしたリストは403で作らず、止めることはできる(): void
    {
        $this->list->forceFill(['moderated_at' => now(), 'share_token' => str_repeat('a', 32)])->save();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/share-link")
            ->assertForbidden()
            ->assertExactJson(['message' => 'このリストは運営により非公開になっています。', 'code' => 'list_moderated']);
        $this->deleteJson("/api/lists/{$this->list->id}/share-link")->assertNoContent();
        $this->assertNull($this->list->fresh()->share_token);
    }

    public function test_他人のリスト・存在しないリストは同じ404で、作ったり止めたりしない(): void
    {
        $other = User::factory()->create();
        $othersList = PackingList::factory()->for($other)->create(['is_public' => true, 'share_token' => str_repeat('b', 32)]);

        foreach ([$othersList->id, 9999999] as $id) {
            $this->actingAsUser($this->user)->postJson("/api/lists/{$id}/share-link")->assertNotFound()->assertJsonPath('code', 'not_found');
            $this->deleteJson("/api/lists/{$id}/share-link")->assertNotFound()->assertJsonPath('code', 'not_found');
        }
        $this->assertSame(str_repeat('b', 32), $othersList->fresh()->share_token);
    }

    public function test_本文で値を送ると未定義キーとして422(): void
    {
        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$this->list->id}/share-link", ['share_token' => str_repeat('c', 32)])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.share_token', ['この項目は送信できません。']);

        $this->assertNull($this->list->fresh()->share_token);
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)->postJson("/api/lists/{$list->id}/share-link")
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->app['auth']->forgetGuards();
        $this->withoutToken()->postJson("/api/lists/{$this->list->id}/share-link")
            ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        $this->assertNull($list->fresh()->share_token);
    }
}
