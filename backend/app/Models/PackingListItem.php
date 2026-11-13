<?php

namespace App\Models;

use Database\Factories\PackingListItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * 持ち物。D-35：削除は一時削除にして、同じ内容画面の間は同じidのまま戻せるようにする。
 */
#[Fillable(['name', 'is_checked', 'sort_order'])]
class PackingListItem extends Model
{
    /** @use HasFactory<PackingListItemFactory> */
    use HasFactory, SoftDeletes;

    public const TRASH_RETENTION_DAYS = 7;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_checked' => 'boolean',
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
