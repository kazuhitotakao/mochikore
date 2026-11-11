<?php

namespace Tests\Feature\Lists;

use App\Models\Category;
use App\Models\User;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
