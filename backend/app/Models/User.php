<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['email', 'password'])]
#[Hidden(['password'])]
// D-19：メール認証が済むまで自分のリストは使えない。確認メールはLaravel標準の仕組みで送る
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const UNVERIFIED_LIFETIME_DAYS = 7;

    // D-119：共同編集のメンバーとして参加できるリストの数。自分のリスト100件（D-50）とは別に数える
    public const MAX_JOINED_LISTS = 100;

    // D-119・V-27：共同編集のメンバーに見せる表示名の文字数
    public const DISPLAY_NAME_MAX_LENGTH = 20;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'pending_email_requested_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * @return HasMany<PackingList, $this>
     */
    public function packingLists(): HasMany
    {
        return $this->hasMany(PackingList::class);
    }

    /**
     * @return HasMany<SavedItem, $this>
     */
    public function savedItems(): HasMany
    {
        return $this->hasMany(SavedItem::class);
    }

    /**
     * @return HasMany<SavedGroup, $this>
     */
    public function savedGroups(): HasMany
    {
        return $this->hasMany(SavedGroup::class);
    }

    /**
     * 共同編集のメンバーとして参加しているリスト（D-119）。自分が所有するリストは含まない。
     *
     * @return HasMany<PackingListMember, $this>
     */
    public function memberships(): HasMany
    {
        return $this->hasMany(PackingListMember::class);
    }

    /**
     * 本人だけのまとめ表示（D-124）。
     *
     * @return HasMany<CombinedView, $this>
     */
    public function combinedViews(): HasMany
    {
        return $this->hasMany(CombinedView::class);
    }
}
