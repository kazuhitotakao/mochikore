<?php

namespace App\Models;

use Database\Factories\PackingListFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
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

    // D-119：共同編集は、所有者を入れて1リスト10人まで
    public const MAX_PEOPLE = 10;

    // D-119：招待リンクの文字数（英数字）と、作ってから切れるまでの日数
    public const INVITE_TOKEN_LENGTH = 32;

    public const INVITE_LIFETIME_DAYS = 7;

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
            'invite_expires_at' => 'datetime',
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

    /**
     * 共同編集のメンバー（編集者）。所有者は含まない（D-119）。
     *
     * @return HasMany<PackingListMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(PackingListMember::class);
    }

    /**
     * D-119：所有者か、共同編集のメンバーとして使えるリストに絞る。
     *
     * @param  Builder<$this>  $query
     */
    public function scopeAccessibleBy(Builder $query, User $user): void
    {
        $query->where(fn (Builder $own) => $own
            ->where('user_id', $user->id)
            ->orWhereHas('members', fn (Builder $member) => $member->where('user_id', $user->id)));
    }

    public function isOwnedBy(User $user): bool
    {
        return $this->user_id === $user->id;
    }

    /**
     * D-119：所有者か、共同編集のメンバーか。
     */
    public function isAccessibleBy(User $user): bool
    {
        return $this->isOwnedBy($user) || $this->members()->where('user_id', $user->id)->exists();
    }

    /**
     * D-119：止めていない、期限内の招待リンクがあるか。
     */
    public function hasValidInvite(): bool
    {
        return $this->invite_token !== null && $this->invite_expires_at?->isFuture() === true;
    }

    /**
     * D-119：共同編集中（メンバーがいる、または有効な招待リンクがある）は、公開・リンクで共有と両立させない。
     */
    public function isCollaborative(): bool
    {
        return $this->hasValidInvite() || $this->members()->exists();
    }
}
