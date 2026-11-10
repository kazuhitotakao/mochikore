<?php

namespace App\Services;

use App\Models\PersonalAccessToken;

/**
 * ログインの期限（D-05・D-36・D-74）。Sanctumのexpires_at・last_used_atは使わない。
 */
class TokenLifetime
{
    /**
     * 最初のログインから365日以内で、最後の操作から180日以内なら使える。
     */
    public function isActive(PersonalAccessToken $token): bool
    {
        // 型変換された日時は書き換えられるので、copy() してから足す
        return $token->first_login_at->copy()->addDays(PersonalAccessToken::MAX_LIFETIME_DAYS)->isFuture()
            && $token->last_activity_at->copy()->addDays(PersonalAccessToken::IDLE_LIFETIME_DAYS)->isFuture();
    }

    /**
     * 利用者の操作があった印として、最後の操作日時だけを進める。
     * D-74：トークンは更新せず、first_login_at も変えないので、最長1年は延びない。
     */
    public function recordActivity(PersonalAccessToken $token): void
    {
        $token->forceFill(['last_activity_at' => now()])->save();
    }
}
