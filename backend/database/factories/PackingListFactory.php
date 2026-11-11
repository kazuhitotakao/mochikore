<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\PackingList;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PackingList>
 */
class PackingListFactory extends Factory
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
            // カテゴリーは CategorySeeder で登録したものを使う（利用者は追加できないため、Factory を作らない）
            'category_id' => fn () => Category::query()->orderBy('sort_order')->value('id'),
            'title' => '旅行の持ち物',
        ];
    }
}
