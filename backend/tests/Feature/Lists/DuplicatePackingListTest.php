<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * API-50 自分のリストを複製する（F-30、SC-07-4、D-116・D-24・D-43・D-48・D-50・D-61・D-97・D-106・D-114）。
 * 名前は V-04（09_バリデーション 9行・Jメモ）と C-01〜08。
 */
class DuplicatePackingListTest extends ListApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function test_入力した名前で内容と分類を新しい_i_dへ写し、非公開・未チェック・コピー元なしで201を返す(): void
    {
        $source = PackingList::factory()->for($this->user)->create([
            'title' => '夏の旅行', 'description' => "1行目\n2行目", 'category_id' => $this->categoryId('旅行・お泊まり'),
            'is_public' => true, 'share_token' => str_repeat('a', 32), 'grouping_revision' => 9,
            'created_at' => now()->subMonth(), 'updated_at' => now()->subDay(),
        ]);
        $later = PackingListGroup::factory()->for($source)->create(['name' => '洗面', 'sort_order' => 2]);
        $first = PackingListGroup::factory()->for($source)->create(['name' => '衣類', 'sort_order' => 0]);
        // D-106：空のグループのチェックも外す
        PackingListGroup::factory()->for($source)->create(['name' => '空', 'sort_order' => 3, 'is_checked' => true]);
        PackingListItem::factory()->for($source)->create(['name' => '歯ブラシ', 'group_id' => $later->id, 'sort_order' => 7, 'is_checked' => true]);
        $checked = PackingListItem::factory()->for($source)->create(['name' => '服', 'group_id' => $first->id, 'sort_order' => 1, 'is_checked' => true]);
        PackingListItem::factory()->for($source)->create(['name' => '充電器', 'sort_order' => 8]);
        PackingListItem::factory()->for($source)->create(['name' => '削除済み', 'deleted_at' => now()]);
        $sourceUpdatedAt = $source->fresh()->updated_at->toJSON();

        $response = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => '冬の旅行'])
            ->assertCreated();

        $copy = PackingList::findOrFail($response->json('data.id'));
        $response->assertExactJson(['data' => [
            'id' => $copy->id, 'title' => '冬の旅行', 'description' => "1行目\n2行目",
            'category' => ['id' => $source->category->id, 'name' => '旅行・お泊まり'],
            'is_public' => false, 'moderated_at' => null, 'updated_at' => $copy->updated_at->toJSON(),
        ]]);
        $this->assertSame($this->user->id, $copy->user_id);
        // D-116：本人の複製はコピー元を記録しない（よくコピーされている順で数えない）
        $this->assertNull($copy->source_list_id);
        // D-114：限定公開のリンクは引き継がない
        $this->assertNull($copy->share_token);
        $this->assertSame(0, $copy->grouping_revision);
        $groups = $copy->groups()->orderBy('sort_order')->orderBy('id')->get();
        $this->assertSame(['衣類', '洗面', '空'], $groups->pluck('name')->all());
        $this->assertSame([0, 2, 3], $groups->pluck('sort_order')->all());
        $this->assertSame([false, false, false], $groups->pluck('is_checked')->all());
        $items = $copy->items()->orderBy('sort_order')->orderBy('id')->get();
        $this->assertSame(['服', '歯ブラシ', '充電器'], $items->pluck('name')->all());
        $this->assertSame([1, 7, 8], $items->pluck('sort_order')->all());
        $this->assertSame([$groups[0]->id, $groups[1]->id, null], $items->pluck('group_id')->all());
        $this->assertSame([false, false, false], $items->pluck('is_checked')->all());
        // 削除した持ち物は写さない
        $this->assertSame(3, $copy->items()->withTrashed()->count());

        // D-24・D-59：元のリストは読むだけなので、一覧の順番・revision・公開・リンク・チェックを変えない
        $original = $source->fresh();
        $this->assertSame($sourceUpdatedAt, $original->updated_at->toJSON());
        $this->assertSame(9, $original->grouping_revision);
        $this->assertTrue($original->is_public);
        $this->assertSame(str_repeat('a', 32), $original->share_token);
        $this->assertTrue($checked->fresh()->is_checked);

        // D-24：複製したリストは自分のリスト一覧の先頭に出る
        $this->getJson('/api/lists')->assertJsonPath('data.0.id', $copy->id);
    }

    public function test_元と同じ名前・グループなし・説明なし・持ち物0件でも複製でき、前後の空白は消す(): void
    {
        $source = PackingList::factory()->for($this->user)->create(['title' => '買い物', 'description' => null]);

        $first = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => '買い物'])
            ->assertCreated()
            ->json('data.id');
        $second = $this->postJson("/api/lists/{$source->id}/duplicate", ['title' => "　 買い物（コピー）\t "])
            ->assertCreated()
            ->assertJsonPath('data.title', '買い物（コピー）')
            ->json('data.id');

        $this->assertNotSame($first, $second);
        $copy = PackingList::findOrFail($first);
        $this->assertSame('買い物', $copy->title);
        $this->assertNull($copy->description);
        $this->assertSame(0, $copy->groups()->count());
        $this->assertSame(0, $copy->items()->count());
        $this->assertSame(3, $this->user->packingLists()->count());
    }

    public function test_50文字までの名前は複製できる(): void
    {
        $source = PackingList::factory()->for($this->user)->create();
        // C-01：文字数はコードポイントで数える（絵文字1つは1文字）
        $title = str_repeat('あ', 49).'🎒';

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => $title])
            ->assertCreated()
            ->assertJsonPath('data.title', $title);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidTitles(): array
    {
        return [
            '省略' => [[], 'リスト名を入力してください。'],
            'null' => [['title' => null], 'リスト名を入力してください。'],
            '空文字' => [['title' => ''], 'リスト名を入力してください。'],
            '空白だけ' => [['title' => " 　\t"], 'リスト名を入力してください。'],
            '数値' => [['title' => 123], 'リスト名を文字で入力してください。'],
            '配列' => [['title' => ['冬の旅行']], 'リスト名を文字で入力してください。'],
            '51文字' => [['title' => str_repeat('あ', 51)], 'リスト名は50文字以内で入力してください。'],
            '途中の改行' => [['title' => "冬の\n旅行"], 'リスト名は改行せずに入力してください。'],
            '途中のタブ' => [['title' => "冬の\t旅行"], 'リスト名は改行せずに入力してください。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidTitles')]
    public function test_名前が_v04に合わなければ422で何も作らない(array $body, string $message): void
    {
        $source = PackingList::factory()->for($this->user)->create();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.title', [$message]);

        $this->assertSame(1, $this->user->packingLists()->count());
    }

    public function test_名前のほかの項目は未定義キーとして422で何も作らない(): void
    {
        $source = PackingList::factory()->for($this->user)->create();
        $body = ['title' => '冬の旅行', 'description' => '上書き', 'category_id' => 1, 'is_public' => true, 'source_list_id' => $source->id];

        $response = $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');
        foreach (['description', 'category_id', 'is_public', 'source_list_id'] as $field) {
            $response->assertJsonPath('errors.'.$field, ['この項目は送信できません。']);
        }
        $response->assertJsonMissingPath('errors.title');

        $this->assertSame(1, $this->user->packingLists()->count());
    }

    public function test_100件目は作れ、101件目は部分保存せず拒否する(): void
    {
        $source = PackingList::factory()->for($this->user)->create();
        PackingListGroup::factory()->for($source)->create();
        PackingListItem::factory()->for($source)->create();
        PackingList::factory()->count(98)->for($this->user)->create();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => '100件目'])
            ->assertCreated();
        $counts = [PackingList::count(), PackingListGroup::count(), PackingListItem::count()];

        $this->postJson("/api/lists/{$source->id}/duplicate", ['title' => '101件目'])
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'リストは100件までです。', 'code' => 'list_limit_reached']);
        $this->assertSame(100, $this->user->packingLists()->count());
        $this->assertSame($counts, [PackingList::count(), PackingListGroup::count(), PackingListItem::count()]);
    }

    public function test_安全上限を超える持ち物のリストは422で写さず、1時間の追加の回数には数えない(): void
    {
        $source = PackingList::factory()->for($this->user)->create();
        $this->fillItems($source, PackingListItem::MAX_PER_LIST);
        // D-97：1時間の上限まで追加していても、複製は回数に数えないので作れる
        $this->useItemAdditions($this->user, PackingListItem::MAX_ADDED_PER_HOUR);

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => '2,000件'])
            ->assertCreated();
        $this->assertSame(PackingListItem::MAX_ADDED_PER_HOUR, $this->itemAdditions($this->user));

        // 安全上限より前に入っていた大きいリストは、複製しても上限を超えないよう断る
        PackingListItem::factory()->for($source)->create();
        $count = PackingList::count();
        $this->postJson("/api/lists/{$source->id}/duplicate", ['title' => '2,001件'])
            ->assertUnprocessable()
            ->assertExactJson(['message' => '1つのリストに入れられる持ち物は2,000件までです。', 'code' => 'item_limit_reached']);
        $this->assertSame($count, PackingList::count());
    }

    public function test_運営が非公開にしたリストは403で複製しない(): void
    {
        $source = PackingList::factory()->for($this->user)->create(['moderated_at' => now()]);
        PackingListItem::factory()->for($source)->create();

        $this->actingAsUser($this->user)
            ->postJson("/api/lists/{$source->id}/duplicate", ['title' => '冬の旅行'])
            ->assertForbidden()
            ->assertExactJson(['message' => 'このリストは運営により非公開になっています。', 'code' => 'list_moderated']);

        $this->assertSame(1, $this->user->packingLists()->count());
    }

    public function test_他人のリスト・公開リスト・存在しないリストは同じ404で複製しない(): void
    {
        $other = User::factory()->create();
        $private = PackingList::factory()->for($other)->create();
        $public = PackingList::factory()->for($other)->create(['is_public' => true]);
        PackingListItem::factory()->for($public)->create();
        $deleted = PackingList::factory()->for($this->user)->create();
        $deleted->delete();

        foreach ([$private->id, $public->id, $deleted->id, 9999999] as $id) {
            $this->actingAsUser($this->user)
                ->postJson("/api/lists/{$id}/duplicate", ['title' => '冬の旅行'])
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }

        $this->assertSame(0, $this->user->packingLists()->count());
        $this->assertSame(2, $other->packingLists()->count());
    }

    public function test_メール未認証なら403、ログインしていなければ401(): void
    {
        $unverified = User::factory()->unverified()->create();
        $list = PackingList::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)
            ->postJson("/api/lists/{$list->id}/duplicate", ['title' => '冬の旅行'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
        $this->app['auth']->forgetGuards();
        $this->withoutToken()
            ->postJson("/api/lists/{$list->id}/duplicate", ['title' => '冬の旅行'])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');

        $this->assertSame(1, $unverified->packingLists()->count());
    }
}
