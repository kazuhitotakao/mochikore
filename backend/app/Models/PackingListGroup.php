<?php

namespace App\Models;

use App\Enums\GroupCheckMode;
use Database\Factories\PackingListGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * リスト内の任意の分類（D-56）。リストの用途であるカテゴリー（Category）とは別物。
 */
#[Fillable(['name', 'sort_order', 'is_checked', 'check_mode'])]
class PackingListGroup extends Model
{
    /** @use HasFactory<PackingListGroupFactory> */
    use HasFactory;

    // D-57：1リスト0〜20グループ
    public const MAX_PER_LIST = 20;

    // D-57：グループ名に使えない予約名
    public const RESERVED_NAME = '未分類';

    /**
     * D-122：DBの既定値と同じ「通常」。作った直後のモデルでも、読み直さずに設定を返せるようにする。
     *
     * @var array<string, mixed>
     */
    protected $attributes = ['check_mode' => GroupCheckMode::Normal->value];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_checked' => 'boolean',
            'check_mode' => GroupCheckMode::class,
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
