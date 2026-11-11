<?php

namespace Database\Factories;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PackingListGroup>
 */
class PackingListGroupFactory extends Factory
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
            'name' => '洗面用具',
            'sort_order' => 0,
        ];
    }
}
