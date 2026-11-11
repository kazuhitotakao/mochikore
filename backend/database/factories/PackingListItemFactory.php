<?php

namespace Database\Factories;

use App\Models\PackingList;
use App\Models\PackingListItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PackingListItem>
 */
class PackingListItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'packing_list_id' => PackingList::factory(),
            'name' => '歯ブラシ',
        ];
    }
}
