<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AccountDeletionService
{
    public const MAX_ATTEMPTS = 5;

    public const LOCK_SECONDS = 60;

    public function delete(User $user, string $password): void
    {
        $throttleKey = 'account-deletion:'.$user->id;
        $failure = DB::transaction(function () use ($user, $password, $throttleKey): ?ApiException {
            // D-72：端末やIPを変えても、同じ本人の確認と失敗回数を直列に扱う
            $account = User::whereKey($user->id)->lockForUpdate()->first();
            if (! $account) {
                return new ApiException(ApiErrorCode::Unauthenticated, 'ログインしてください。');
            }

            if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
                return new ApiException(
                    ApiErrorCode::TooManyRequests,
                    'しばらくしてから再度お試しください。',
                    RateLimiter::availableIn($throttleKey),
                );
            }

            if (! Hash::check($password, $account->password)) {
                RateLimiter::hit($throttleKey, self::LOCK_SECONDS);

                // DBキャッシュの失敗回数までロールバックしないよう、確定してから例外を投げる
                return new ApiException(ApiErrorCode::InvalidPassword, 'パスワードが正しくありません。');
            }

            // D-09・52：外部キーがない認証情報だけはコードで削除し、全体を一緒に確定する
            $account->tokens()->delete();
            DB::table('password_reset_tokens')->where('email', $account->email)->delete();
            $account->delete();
            // D-09・22・61・66・102：本人データのCASCADEと、他人のコピーのSET NULLはDBに任せる
            RateLimiter::clear($throttleKey);

            return null;
        }, 3);

        if ($failure) {
            throw $failure;
        }
    }
}
