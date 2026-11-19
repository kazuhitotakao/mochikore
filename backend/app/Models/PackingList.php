<?php

namespace App\Models;

use Database\Factories\PackingListFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * リスト。用途はカテゴリー（Category）、リスト内の任意の分類はグループ（PackingListGroup）。
 */
#[Fillable(['title', 'description', 'category_id'])]
class PackingList extends Model
{
    /** @use HasFactory<PackingListFactory> */
    use HasFactory;

    // D-50：非公開・公開・コピーしたリストをすべて数える
    public const MAX_PER_USER = 100;

    // D-114：限定公開のリンクの文字数（英数字）
    public const SHARE_TOKEN_LENGTH = 32;

    // D-117・V-25：公開リスト一覧（API-15）の並び順。省略は新しい順（D-23）
    public const SORT_NEWEST = 'newest';

    public const SORT_MOST_COPIED = 'most_copied';

    public const PUBLIC_SORTS = [self::SORT_NEWEST, self::SORT_MOST_COPIED];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_public' => 'boolean',
            'moderated_at' => 'datetime',
            'grouping_revision' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Category, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * 削除済み（SoftDeletes）の持ち物は含まない。
     *
     * @return HasMany<PackingListItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(PackingListItem::class);
    }

    /**
     * @return HasMany<PackingListGroup, $this>
     */
    public function groups(): HasMany
    {
        return $this->hasMany(PackingListGroup::class);
    }
}
