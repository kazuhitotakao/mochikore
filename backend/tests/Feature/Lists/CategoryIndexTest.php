<?php

namespace Tests\Feature\Lists;

use App\Models\Category;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * API-18 カテゴリーの一覧（F-12、D-33・D-69）。
 */
class CategoryIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_ログインなしで10種類を表示順に返す(): void
    {
        $this->seed(CategorySeeder::class);

        $response = $this->getJson('/api/categories')->assertOk();

        $this->assertSame(
            Category::orderBy('sort_order')->pluck('name')->all(),
            array_column($response->json('data'), 'name'),
        );
        $this->assertCount(10, $response->json('data'));
        $this->assertSame([
            'id' => Category::where('name', '買い物')->value('id'),
            'name' => '買い物',
            'example' => '食料品、日用品',
        ], $response->json('data.2'));
        $this->assertSame('その他', $response->json('data.9.name'));
    }
}
