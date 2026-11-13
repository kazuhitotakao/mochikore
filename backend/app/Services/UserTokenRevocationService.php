<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class UserTokenRevocationService
{
    /**
     * D-78：削除したログイン情報の件数を返す。対象がいなければnull。
     */
    public function revoke(int $userId): ?int
    {
        return DB::transaction(function () use ($userId) {
            // D-78：発行と同じ本人のロックで前後を確定し、先に発行された情報もすべて無効にする。
            $user = User::whereKey($userId)->lockForUpdate()->first();
            if (! $user) {
                return null;
            }

            return $user->tokens()->delete();
        }, 3);
    }
}
