<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;

/**
 * 登録時のメール認証（D-19・API-01・23・24）。
 */
class EmailVerification
{
    // API-24・D-19：同じアドレスへの確認メールは60秒あける。登録時の送信からも数える
    public const RESEND_INTERVAL_SECONDS = 60;

    public function sendAfterRegistration(User $user): void
    {
        // API-01：Registered イベントで、Laravel標準のリスナーが確認メールを送る
        event(new Registered($user));
        $this->startInterval($user);
    }

    public function resend(User $user): void
    {
        // API-24：認証済みなら送らずに終える（204）
        if ($user->hasVerifiedEmail()) {
            return;
        }

        $key = $this->intervalKey($user);
        if (RateLimiter::tooManyAttempts($key, 1)) {
            throw new ApiException(
                ApiErrorCode::TooManyRequests,
                'しばらくしてから再度お試しください。',
                RateLimiter::availableIn($key),
            );
        }

        $user->sendEmailVerificationNotification();
        $this->startInterval($user);
    }

    /**
     * API-23：署名と期限は signed:relative ミドルウェアで確かめた後に呼ぶ。
     */
    public function verify(User $user, string $id, string $hash): void
    {
        DB::transaction(function () use ($user, $id, $hash) {
            // D-44：定期削除との前後を確定させ、削除済みの本人を認証成功として返さない。
            $account = User::whereKey($user->id)->lockForUpdate()->first()
                ?? throw new ApiException(ApiErrorCode::Unauthenticated, 'ログインしてください。');

            // 別の利用者のリンクも、不正なリンクと同じ応答にする
            if (! hash_equals((string) $account->getKey(), $id)
                || ! hash_equals(sha1($account->getEmailForVerification()), $hash)) {
                throw new ApiException(ApiErrorCode::LinkInvalid, 'リンクの有効期限が切れているか、無効です。');
            }

            if ($account->hasVerifiedEmail()) {
                return;
            }

            $account->markEmailAsVerified();
            event(new Verified($account));
        }, 3);
    }

    /**
     * 確認メールのリンク。Next.jsのSC-04を開かせ、画面がAPI-23を呼ぶ（D-72）。
     * Next.jsはLaravelへ別のホストで送るので、署名にはホストを含めない（absolute: false）。
     * トークンはURLに入れない。
     */
    public function verificationUrl(User $user): string
    {
        $apiUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(config('auth.verification.expire', 60)),
            ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())],
            absolute: false,
        );
        parse_str((string) parse_url($apiUrl, PHP_URL_QUERY), $signed);

        return rtrim(config('app.frontend_url'), '/').'/verify-email?'.http_build_query([
            'id' => $user->getKey(),
            'hash' => sha1($user->getEmailForVerification()),
            'expires' => $signed['expires'],
            'signature' => $signed['signature'],
        ]);
    }

    private function startInterval(User $user): void
    {
        RateLimiter::hit($this->intervalKey($user), self::RESEND_INTERVAL_SECONDS);
    }

    private function intervalKey(User $user): string
    {
        return 'verification-email:'.$user->getEmailForVerification();
    }
}
