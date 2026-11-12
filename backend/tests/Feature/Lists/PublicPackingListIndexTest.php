<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * F-09・SC-10・API-15、V-15・C-01〜08、D-18・23・32・53・63・81・92。
 */
class PublicPackingListIndexTest extends ListApiTestCase
{
    public function test_ログインなしで公開リストだけを公開用の項目で返す(): void
    {
        $list = PackingList::factory()->create(['is_public' => true, 'description' => '公開する説明']);
        PackingListItem::factory()->for($list)->create(['is_checked' => true]);
        PackingList::factory()->create(['title' => '非公開']);
        PackingList::factory()->create(['title' => '運営非公開', 'is_public' => true, 'moderated_at' => now()]);

        $response = $this->getJson('/api/public/lists')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonStructure(['data', 'links' => ['first', 'last', 'prev', 'next'], 'meta' => ['current_page', 'last_page', 'per_page', 'total']]);

        $this->assertSame([
            'id' => $list->id,
            'title' => $list->title,
            'description' => '公開する説明',
            'category' => ['id' => $list->category->id, 'name' => $list->category->name],
            'created_at' => $list->created_at->toJSON(),
        ], $response->json('data.0'));
    }

    public function test_メール未認証でも期限切れのトークンでも公開一覧は閲覧できる(): void
    {
        PackingList::factory()->create(['is_public' => true]);
        $this->actingAsUser(User::factory()->unverified()->create())->getJson('/api/public/lists')->assertOk();
        $this->withHeader('Authorization', 'Bearer invalid-token')->getJson('/api/public/lists')->assertOk();
    }

    public function test_キーワードとカテゴリーを組み合わせリスト名だけを検索する(): void
    {
        $category = $this->categoryId('旅行・お泊まり');
        $expected = PackingList::factory()->create(['is_public' => true, 'title' => '週末の旅行', 'category_id' => $category]);
        PackingList::factory()->create(['is_public' => true, 'title' => '旅行の買い物', 'category_id' => $this->categoryId('買い物')]);
        $description = PackingList::factory()->create(['is_public' => true, 'title' => '準備', 'description' => '旅行', 'category_id' => $category]);
        PackingListItem::factory()->for($description)->create(['name' => '旅行']);
        PackingList::factory()->create(['title' => '旅行', 'category_id' => $category]);

        $this->getJson($this->url(['keyword' => ' 旅行 ', 'category_id' => $category]))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $expected->id);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function literalKeywords(): array
    {
        return ['%' => ['%'], '_' => ['_'], 'escape' => ['!'], 'backslash' => ['\\'], 'combined' => ['!%_'], 'quote' => ["' OR 1=1 --"]];
    }

    #[DataProvider('literalKeywords')]
    public function test_ワイルドカードと_sq_lに似た入力も文字として検索する(string $keyword): void
    {
        $expected = PackingList::factory()->create(['is_public' => true, 'title' => '前'.$keyword.'後']);
        PackingList::factory()->create(['is_public' => true, 'title' => '前後']);
        PackingList::factory()->create(['is_public' => true, 'title' => '無関係なリスト']);

        $this->getJson($this->url(['keyword' => $keyword]))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $expected->id);
    }

    public function test_作成が新しい順に20件ずつ返し検索条件もページ移動に保つ(): void
    {
        $user = User::factory()->create();
        $category = $this->categoryId('旅行・お泊まり');
        $lists = [];
        for ($i = 0; $i < 23; $i++) {
            $lists[] = PackingList::factory()->for($user)->create([
                'is_public' => true,
                'title' => '旅行'.$i,
                'category_id' => $category,
                'created_at' => now()->subDays(23 - $i),
            ]);
        }
        $lists[0]->update(['title' => '旅行を編集しました']);
        $filters = ['keyword' => '旅行', 'category_id' => $category];
        $expected = array_reverse(array_map(fn (PackingList $list) => $list->id, $lists));

        $first = $this->getJson($this->url($filters))->assertOk()->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.current_page', 1)->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.total', 23);
        $this->assertSame(array_slice($expected, 0, 20), array_column($first->json('data'), 'id'));
        parse_str(parse_url($first->json('links.next'), PHP_URL_QUERY), $query);
        $this->assertSame('旅行', $query['keyword']);
        $this->assertSame((string) $category, $query['category_id']);
        $this->assertSame('2', $query['page']);

        $second = $this->getJson($this->url([...$filters, 'page' => 2]))->assertOk()->assertJsonCount(3, 'data')
            ->assertJsonPath('links.next', null)->assertJsonPath('meta.current_page', 2);
        $this->assertSame(array_slice($expected, 20), array_column($second->json('data'), 'id'));
    }

    public function test_同じ作成日時では_i_dが大きい順に返す(): void
    {
        $lists = PackingList::factory()->count(3)->create(['is_public' => true, 'created_at' => now()->subDay()]);
        $response = $this->getJson('/api/public/lists')->assertOk();
        $this->assertSame($lists->pluck('id')->reverse()->values()->all(), array_column($response->json('data'), 'id'));
    }

    public function test_空の検索語と標準の前後空白は条件なしとして扱う(): void
    {
        PackingList::factory()->create(['is_public' => true]);
        foreach (['', " \t\n\u{3000}\u{00A0}\u{200B}"] as $keyword) {
            $this->getJson($this->url(['keyword' => $keyword]))->assertOk()->assertJsonCount(1, 'data');
        }
    }

    public function test_キーワードは変換後にコードポイントで50文字まで許可する(): void
    {
        $keyword = str_repeat('😀', 50);
        $list = PackingList::factory()->create(['is_public' => true, 'title' => $keyword]);
        $this->getJson($this->url(['keyword' => ' '.$keyword.' ']))->assertOk()->assertJsonPath('data.0.id', $list->id);
        $this->getJson($this->url(['keyword' => $keyword.'😀']))->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')->assertJsonPath('errors.keyword', ['キーワードは50文字以内で入力してください。']);
    }

    public function test_該当なしと範囲外のページも標準の空の一覧を返す(): void
    {
        PackingList::factory()->create(['is_public' => true]);
        $this->getJson($this->url(['keyword' => '存在しない語']))->assertOk()->assertJsonCount(0, 'data');
        $this->getJson($this->url(['page' => '9007199254740991']))->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalidFilters(): array
    {
        $cases = ['keyword-array' => [['keyword' => ['旅行']], 'keyword']];
        foreach (['page', 'category_id'] as $field) {
            foreach (['', ' ', '0', '-1', '1.5', '01', '+1', '1e2', '9007199254740992', '999999999999999999999999', ['1']] as $index => $value) {
                $cases[$field.'-'.$index] = [[$field => $value], $field];
            }
        }
        $cases['unknown-category'] = [['category_id' => '999999'], 'category_id'];

        return $cases;
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    #[DataProvider('invalidFilters')]
    public function test_不正なクエリを422と項目別の日本語で返す(array $filters, string $field): void
    {
        $message = match ($field) {
            'page' => 'ページ番号が正しくありません。',
            'category_id' => '有効なカテゴリーを選択してください。',
            'keyword' => 'キーワードを文字で入力してください。',
        };
        $this->getJson($this->url($filters))->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')->assertJsonPath('errors.'.$field, [$message]);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function url(array $filters): string
    {
        return '/api/public/lists?'.http_build_query($filters);
    }
}
