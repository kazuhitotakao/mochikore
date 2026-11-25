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
     * D-97：1つのリストの削除していない持ち物の安全上限。画面には出さず、届いたときだけ断る（D-34）。
     */
    public const MAX_PER_LIST = 2000;

    /**
     * D-97：1人が1時間に増やせる持ち物の件数（追加・まとめて追加・戻す）。
     */
    public const MAX_ADDED_PER_HOUR = 1000;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_checked' => 'boolean',
            // D-122：最後にチェックを付けた日時と、その1つ前。Fillable には入れず、チェックの処理だけが変える
            'last_checked_at' => 'datetime',
            'previous_checked_at' => 'datetime',
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
