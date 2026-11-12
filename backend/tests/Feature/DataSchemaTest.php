<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * 手順書第12章：04_テーブル定義・05_ER関係の制約と削除時の動きを、DBに直接書き込んで確かめる。
 */
class DataSchemaTest extends TestCase
{
    use RefreshDatabase;

    private int $categoryId;

    private int $otherCategoryId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CategorySeeder::class);
        $this->categoryId = Category::where('name', '買い物')->value('id');
        $this->otherCategoryId = Category::where('name', '旅行・お泊まり')->value('id');
    }

    public function test_リストと持ち物の初期値が設計どおり(): void
    {
        $user = User::factory()->create();
        $listId = $this->insertList($user->id);
        $itemId = $this->insert('packing_list_items', ['packing_list_id' => $listId, 'name' => '牛乳']);

        $list = DB::table('packing_lists')->find($listId);
        $this->assertSame(0, $list->is_public);
        $this->assertSame(0, $list->grouping_revision);
        $this->assertNull($list->description);
        $this->assertNull($list->source_list_id);
        $this->assertNull($list->moderated_at);

        $item = DB::table('packing_list_items')->find($itemId);
        $this->assertSame(0, $item->is_checked);
        $this->assertSame(0, $item->sort_order);
        $this->assertNull($item->group_id);
        $this->assertNull($item->deleted_at);
    }

    public function test_同じ名前のリスト・持ち物・グループを保存できる(): void
    {
        // D-29・D-30：名前ではなくidで区別する。グループの同名はサーバーで判定する（D-57）
        $user = User::factory()->create();
        $listId = $this->insertList($user->id, ['title' => '買い物']);
        $this->insertList($user->id, ['title' => '買い物']);
        $this->insert('packing_list_items', ['packing_list_id' => $listId, 'name' => '牛乳']);
        $this->insert('packing_list_items', ['packing_list_id' => $listId, 'name' => '牛乳']);
        $this->insert('packing_list_groups', ['packing_list_id' => $listId, 'name' => '冷蔵', 'sort_order' => 0]);
        $this->insert('packing_list_groups', ['packing_list_id' => $listId, 'name' => '冷蔵', 'sort_order' => 1]);

        $this->assertSame(2, DB::table('packing_lists')->where('title', '買い物')->count());
        $this->assertSame(2, DB::table('packing_list_items')->where('name', '牛乳')->count());
        $this->assertSame(2, DB::table('packing_list_groups')->where('name', '冷蔵')->count());
    }

    public function test_よく使う項目は「はは」と「ぱぱ」を別に保存できる(): void
    {
        $user = User::factory()->create();

        $this->insertSavedItem($user->id, $this->categoryId, 'はは');
        $this->insertSavedItem($user->id, $this->categoryId, 'ぱぱ');
        $this->insertSavedItem($user->id, $this->categoryId, 'Milk');
        $this->insertSavedItem($user->id, $this->categoryId, 'milk');

        $this->assertSame(4, DB::table('saved_items')->where('user_id', $user->id)->count());
        $this->assertSame('utf8mb4_bin', collect(Schema::getColumns('saved_items'))->firstWhere('name', 'name')['collation']);
    }

    public function test_よく使う項目は同じ本人・カテゴリー・名前を二重に保存できない(): void
    {
        $user = User::factory()->create();
        $this->insertSavedItem($user->id, $this->categoryId, '牛乳');

        $this->expectException(UniqueConstraintViolationException::class);

        $this->insertSavedItem($user->id, $this->categoryId, '牛乳');
    }

    public function test_よく使う項目はカテゴリーか本人が違えば同じ名前を保存できる(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $this->insertSavedItem($user->id, $this->categoryId, '牛乳');
        $this->insertSavedItem($user->id, $this->otherCategoryId, '牛乳');
        $this->insertSavedItem($otherUser->id, $this->categoryId, '牛乳');

        $this->assertSame(3, DB::table('saved_items')->where('name', '牛乳')->count());
    }

    public function test_よく使うグループは「はは」と「ぱぱ」を別に保存でき、同じ本人・カテゴリー・名前は二重に保存できない(): void
    {
        // D-102：saved_items と同じく、照合順序は utf8mb4_bin で UNIQUE(user_id, category_id, name)
        $user = User::factory()->create();
        $this->insertSavedGroup($user->id, $this->categoryId, 'はは');
        $this->insertSavedGroup($user->id, $this->categoryId, 'ぱぱ');
        $this->insertSavedGroup($user->id, $this->otherCategoryId, 'はは');

        $this->assertSame(3, DB::table('saved_groups')->where('user_id', $user->id)->count());
        $this->assertSame('utf8mb4_bin', collect(Schema::getColumns('saved_groups'))->firstWhere('name', 'name')['collation']);

        $this->expectException(UniqueConstraintViolationException::class);

        $this->insertSavedGroup($user->id, $this->categoryId, 'はは');
    }

    public function test_よく使うグループが使っているカテゴリーは削除できない(): void
    {
        $user = User::factory()->create();
        $this->insertSavedGroup($user->id, $this->categoryId, '冷蔵');

        $this->expectException(QueryException::class);

        DB::table('categories')->where('id', $this->categoryId)->delete();
    }

    public function test_利用者を削除すると、本人のよく使うグループも削除される(): void
    {
        // D-102・D-09：退会では本人のよく使うグループも消し、ほかの人の候補は残す
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $this->insertSavedGroup($user->id, $this->categoryId, '冷蔵');
        $this->insertSavedGroup($otherUser->id, $this->categoryId, '冷蔵');

        DB::table('users')->where('id', $user->id)->delete();

        $this->assertSame(0, DB::table('saved_groups')->where('user_id', $user->id)->count());
        $this->assertSame(1, DB::table('saved_groups')->where('user_id', $otherUser->id)->count());
    }

    public function test_リストが使っているカテゴリーは削除できない(): void
    {
        $user = User::factory()->create();
        $this->insertList($user->id);

        $this->expectException(QueryException::class);

        DB::table('categories')->where('id', $this->categoryId)->delete();
    }

    public function test_よく使う項目が使っているカテゴリーは削除できない(): void
    {
        $user = User::factory()->create();
        $this->insertSavedItem($user->id, $this->categoryId, '牛乳');

        $this->expectException(QueryException::class);

        DB::table('categories')->where('id', $this->categoryId)->delete();
    }

    public function test_リストを削除すると、持ち物・グループ・通報も削除される(): void
    {
        $user = User::factory()->create();
        $listId = $this->insertList($user->id);
        $groupId = $this->insert('packing_list_groups', ['packing_list_id' => $listId, 'name' => '冷蔵', 'sort_order' => 0]);
        $this->insert('packing_list_items', ['packing_list_id' => $listId, 'group_id' => $groupId, 'name' => '牛乳']);
        $this->insert('packing_list_items', ['packing_list_id' => $listId, 'name' => '卵', 'deleted_at' => now()]);
        $this->insert('list_reports', ['packing_list_id' => $listId, 'reason' => 'spam']);

        DB::table('packing_lists')->where('id', $listId)->delete();

        $this->assertSame(0, DB::table('packing_list_items')->where('packing_list_id', $listId)->count());
        $this->assertSame(0, DB::table('packing_list_groups')->where('packing_list_id', $listId)->count());
        $this->assertSame(0, DB::table('list_reports')->where('packing_list_id', $listId)->count());
    }

    public function test_利用者を削除すると、本人のリストとよく使う項目が削除される(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $listId = $this->insertList($user->id);
        $this->insert('packing_list_items', ['packing_list_id' => $listId, 'name' => '牛乳']);
        $this->insertSavedItem($user->id, $this->categoryId, '牛乳');
        $otherListId = $this->insertList($otherUser->id);
        $this->insertSavedItem($otherUser->id, $this->categoryId, '牛乳');

        DB::table('users')->where('id', $user->id)->delete();

        $this->assertSame(0, DB::table('packing_lists')->where('user_id', $user->id)->count());
        $this->assertSame(0, DB::table('packing_list_items')->where('packing_list_id', $listId)->count());
        $this->assertSame(0, DB::table('saved_items')->where('user_id', $user->id)->count());
        $this->assertTrue(DB::table('packing_lists')->where('id', $otherListId)->exists());
        $this->assertSame(1, DB::table('saved_items')->where('user_id', $otherUser->id)->count());
    }

    public function test_コピー元を削除しても、コピー先は残り元のidだけ空になる(): void
    {
        // D-22：退会でコピー元の作成者ごと消えても、ほかの人のコピーは残す
        $owner = User::factory()->create();
        $copier = User::factory()->create();
        $sourceId = $this->insertList($owner->id, ['is_public' => true]);
        $copyId = $this->insertList($copier->id, ['source_list_id' => $sourceId]);

        DB::table('users')->where('id', $owner->id)->delete();

        $this->assertFalse(DB::table('packing_lists')->where('id', $sourceId)->exists());
        $this->assertNull(DB::table('packing_lists')->where('id', $copyId)->value('source_list_id'));
    }

    public function test_グループを削除すると、削除済みも含めて持ち物は残り未分類になる(): void
    {
        $user = User::factory()->create();
        $listId = $this->insertList($user->id);
        $groupId = $this->insert('packing_list_groups', ['packing_list_id' => $listId, 'name' => '冷蔵', 'sort_order' => 0]);
        $itemId = $this->insert('packing_list_items', ['packing_list_id' => $listId, 'group_id' => $groupId, 'name' => '牛乳']);
        $deletedItemId = $this->insert('packing_list_items', [
            'packing_list_id' => $listId,
            'group_id' => $groupId,
            'name' => '卵',
            'deleted_at' => now(),
        ]);

        DB::table('packing_list_groups')->where('id', $groupId)->delete();

        $this->assertNull(DB::table('packing_list_items')->where('id', $itemId)->value('group_id'));
        $this->assertNull(DB::table('packing_list_items')->where('id', $deletedItemId)->value('group_id'));
    }

    public function test_グループの表示順で引けるインデックスがある(): void
    {
        $this->assertTrue(Schema::hasIndex('packing_list_groups', ['packing_list_id', 'sort_order']));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function insertList(int $userId, array $attributes = []): int
    {
        return $this->insert('packing_lists', [
            'user_id' => $userId,
            'category_id' => $this->categoryId,
            'title' => '買い物',
            ...$attributes,
        ]);
    }

    private function insertSavedItem(int $userId, int $categoryId, string $name): int
    {
        return $this->insert('saved_items', [
            'user_id' => $userId,
            'category_id' => $categoryId,
            'name' => $name,
        ]);
    }

    private function insertSavedGroup(int $userId, int $categoryId, string $name): int
    {
        return $this->insert('saved_groups', [
            'user_id' => $userId,
            'category_id' => $categoryId,
            'name' => $name,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function insert(string $table, array $attributes): int
    {
        // D-89：日時はDBの既定値ではなくLaravelのnow()で入れる
        return DB::table($table)->insertGetId([
            ...$attributes,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
