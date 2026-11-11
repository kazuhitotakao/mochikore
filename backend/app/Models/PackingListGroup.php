<?php

namespace App\Models;

use Database\Factories\PackingListGroupFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * リスト内の任意の分類（D-56）。リストの用途であるカテゴリー（Category）とは別物。
 */
class PackingListGroup extends Model
{
    /** @use HasFactory<PackingListGroupFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<PackingList, $this>
     */
    public function packingList(): BelongsTo
    {
        return $this->belongsTo(PackingList::class);
    }
}
