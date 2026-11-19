<?php

namespace Tests\Feature\Lists;

use App\Models\Category;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * リスト関連APIのテストで共通の準備。カテゴリーは Seeder で登録する（利用者は追加できない）。
 */
abstract class ListApiTestCase extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CategorySeeder::class);
    }

    protected function categoryId(string $name): int
    {
        return Category::where('name', $name)->value('id');
    }

    /**
     * 本番と同じトークンの発行（D-78）で、その利用者として送る。
     */
    protected function actingAsUser(User $user): static
    {
        return $this->withToken(app(AuthService::class)->issueToken($user));
    }

    /**
     * D-97 の安全上限を確かめるため、削除していない持ち物をまとめて入れる。1件ずつ作ると遅いため。
     */
    protected function fillItems(PackingList $list, int $count): void
    {
        $now = now();
        foreach (array_chunk(range(1, $count), 500) as $numbers) {
            PackingListItem::insert(array_map(fn (int $number) => [
                'packing_list_id' => $list->id,
                'name' => '持ち物'.$number,
                'sort_order' => $number,
                'is_checked' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ], $numbers));
        }
    }

    /**
     * D-97：この1時間に、すでに $count 件の持ち物を増やした状態にする。
     */
    protected function useItemAdditions(User $user, int $count): void
    {
        RateLimiter::increment(self::itemAdditionKey($user), 3600, $count);
    }

    protected function itemAdditions(User $user): int
    {
        return (int) RateLimiter::attempts(self::itemAdditionKey($user));
    }

    private static function itemAdditionKey(User $user): string
    {
        return 'item-additions:'.$user->id;
    }
}
