<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

/**
 * Sanctum標準のトークンに、期限判定用の2つの日時（04_テーブル定義）を足したもの。
 */
class PersonalAccessToken extends SanctumPersonalAccessToken
{
    // D-05・D-36：最後の操作から180日で再ログイン
    public const IDLE_LIFETIME_DAYS = 180;

    // D-05・D-74：最初のログインから最長1年。Cookieの期限（365日、D-78）とそろえて365日で数える
    public const MAX_LIFETIME_DAYS = 365;

    /**
     * Sanctum標準の型変換（$casts）に足される。
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'first_login_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }
}
