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
