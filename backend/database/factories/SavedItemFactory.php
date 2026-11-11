<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\SavedItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SavedItem>
 */
class SavedItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            // カテゴリーは CategorySeeder で登録したものを使う
            'category_id' => fn () => Category::query()->orderBy('sort_order')->value('id'),
            // 同じ人・同じカテゴリーの同名は1件だけ（UNIQUE）なので、毎回ちがう名前にする
            'name' => fn () => '候補'.fake()->unique()->numberBetween(1, 1_000_000),
        ];
    }
}
