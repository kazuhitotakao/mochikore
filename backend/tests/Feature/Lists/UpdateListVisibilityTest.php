<?php

namespace Tests\Feature\Lists;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\PackingListService;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * F-08・API-14・V-07・C-01〜08、D-24・42・43・48・50・51・85・92。
 */
class UpdateListVisibilityTest extends ListApiTestCase
{
    private User $user;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->list = PackingList::factory()->for($this->user)->create([
            'grouping_revision' => 5,
            'updated_at' => now()->subDay(),
        ]);
    }

    public function test_チェック済みを含む持ち物があれば公開でき、公開範囲だけを返す(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create(['is_checked' => true]);
        $before = $item->fresh()->getAttributes();

        $this->visibility(true)->assertOk()->assertExactJson(['data' => ['is_public' => true]]);

        $list = $this->list->fresh();
        $this->assertTrue($list->is_public);
        $this->assertTrue($list->updated_at->isAfter(now()->subMinute()));
        $this->assertSame(5, $list->grouping_revision);
        $this->assertSame($before, $item->fresh()->getAttributes());
    }

    public function test_持ち物0件でも非公開にできる(): void
    {
        $this->list->forceFill(['is_public' => true])->save();
        $this->visibility(false)->assertOk()->assertExactJson(['data' => ['is_public' => false]]);
        $this->assertFalse($this->list->fresh()->is_public);
        $this->assertSame(5, $this->list->fresh()->grouping_revision);
    }

    public function test_同じ公開設定では更新日時を変えない(): void
    {
        $before = $this->list->fresh()->getAttributes();
        $this->visibility(false)->assertOk();
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_削除済みの持ち物だけでは公開できず何も変えない(): void
    {
        PackingListItem::factory()->for($this->list)->create(['deleted_at' => now()]);
        $before = $this->list->fresh()->getAttributes();

        $this->visibility(true)->assertUnprocessable()->assertExactJson([
            'message' => '公開するには持ち物が1件以上必要です。',
            'code' => 'list_has_no_items',
        ]);
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_運営が非公開にしたリストは公開できず非公開操作でも解除されない(): void
    {
        PackingListItem::factory()->for($this->list)->create();
        $this->list->forceFill(['moderated_at' => now()])->save();
        $before = $this->list->fresh()->getAttributes();

        $this->visibility(true)->assertForbidden()->assertExactJson([
            'message' => 'このリストは運営により非公開になっています。',
            'code' => 'list_moderated',
        ]);
        $this->assertSame($before, $this->list->fresh()->getAttributes());
        $this->visibility(false)->assertOk();
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_取得後に最後の持ち物が削除されても古い状態で公開しない(): void
    {
        $item = PackingListItem::factory()->for($this->list)->create();
        $stale = $this->list->fresh();
        $this->actingAsUser($this->user)->deleteJson("/api/items/{$item->id}")->assertOk();
        $before = $this->list->fresh()->getAttributes();

        try {
            app(PackingListService::class)->updateVisibility($stale, true);
            $this->fail('削除後の公開を拒否する必要があります。');
        } catch (ApiException $error) {
            $this->assertSame(ApiErrorCode::ListHasNoItems, $error->errorCode);
        }
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_取得後に運営が非公開にしても古い状態で公開しない(): void
    {
        PackingListItem::factory()->for($this->list)->create();
        $stale = $this->list->fresh();
        app(PackingListService::class)->moderate($this->list, false);
        $before = $this->list->fresh()->getAttributes();

        try {
            app(PackingListService::class)->updateVisibility($stale, true);
            $this->fail('運営による非公開を優先する必要があります。');
        } catch (ApiException $error) {
            $this->assertSame(ApiErrorCode::ListModerated, $error->errorCode);
        }
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        $message = '公開設定が正しくありません。もう一度操作してください。';

        return [
            '省略' => [[], 'is_public', $message],
            'null' => [['is_public' => null], 'is_public', $message],
            '空文字' => [['is_public' => ''], 'is_public', $message],
            '文字列false' => [['is_public' => 'false'], 'is_public', $message],
            '文字列true' => [['is_public' => 'true'], 'is_public', $message],
            '0' => [['is_public' => 0], 'is_public', $message],
            '1' => [['is_public' => 1], 'is_public', $message],
            '配列' => [['is_public' => [true]], 'is_public', $message],
            '未定義キー' => [['is_public' => true, 'title' => '不正な変更'], 'title', 'この項目は送信できません。'],
            '運営非公開を解除' => [['is_public' => true, 'moderated_at' => null], 'moderated_at', 'この項目は送信できません。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidInputs')]
    public function test_型や未定義キーの違反は公開条件より先に422で拒否する(array $body, string $field, string $message): void
    {
        $this->list->forceFill(['moderated_at' => now()])->save();
        $before = $this->list->fresh()->getAttributes();

        $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}/visibility", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}", [$message]);
        $this->assertSame($before, $this->list->fresh()->getAttributes());
    }

    public function test_他人の公開・非公開リストは存在しないリストと同じ404(): void
    {
        foreach ([true, false] as $isPublic) {
            $other = PackingList::factory()->create(['is_public' => $isPublic]);
            $before = $other->fresh()->getAttributes();
            $this->actingAsUser($this->user)->patchJson("/api/lists/{$other->id}/visibility", ['is_public' => ! $isPublic])
                ->assertNotFound()->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
            $this->assertSame($before, $other->fresh()->getAttributes());
        }
        $this->actingAsUser($this->user)->patchJson('/api/lists/999999/visibility', ['is_public' => true])
            ->assertNotFound()->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
    }

    public function test_未認証なら403で変えない(): void
    {
        $user = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($user)->create();
        $this->actingAsUser($user)->patchJson("/api/lists/{$list->id}/visibility", ['is_public' => true])
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertFalse($list->fresh()->is_public);
    }

    public function test_未ログインなら401(): void
    {
        $this->patchJson("/api/lists/{$this->list->id}/visibility", ['is_public' => true])
            ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }

    private function visibility(bool $isPublic): TestResponse
    {
        return $this->actingAsUser($this->user)->patchJson("/api/lists/{$this->list->id}/visibility", ['is_public' => $isPublic]);
    }
}
