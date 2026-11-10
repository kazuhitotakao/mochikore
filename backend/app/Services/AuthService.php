<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

class AuthService
{
    // D-37：同じメールアドレスとIPアドレスの組み合わせで5回失敗したら、1分待たせる
    public const MAX_LOGIN_ATTEMPTS = 5;

    public const LOGIN_LOCK_SECONDS = 60;

    /**
     * @return array{user: User, token: string}
     */
    public function register(string $email, string $password): array
    {
        // D-40：登録済みのアドレスなら作らず、ログインか再設定を案内する
        if (User::where('email', $email)->exists()) {
            throw $this->emailAlreadyRegistered();
        }

        try {
            return DB::transaction(function () use ($email, $password) {
                $user = User::create(['email' => $email, 'password' => $password]);

                return ['user' => $user, 'token' => $this->issueToken($user)];
            });
        } catch (UniqueConstraintViolationException) {
            // 同じアドレスの登録が同時に届き、上の確認をすり抜けたときも同じ案内にする
            throw $this->emailAlreadyRegistered();
        }
    }

    /**
     * @return array{user: User, token: string}
     */
    public function login(string $email, string $password, string $ip): array
    {
        // D-37・V-03：LoginRequestで処理したメールをそのまま使う。キーだけに別の変換を重ねると、
        // 認証とずれたり、前後空白や大小文字の違いで制限を回避できたりするため
        $throttleKey = $email.'|'.$ip;

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            throw new ApiException(
                ApiErrorCode::TooManyRequests,
                'しばらくしてから再度お試しください。',
                RateLimiter::availableIn($throttleKey),
            );
        }

        // validate() は失敗時の処理時間を一定にそろえるので、応答時間からもアドレスの有無が分かりにくい。
        // セッションには書き込まない
        $guard = Auth::guard('web');

        if (! $guard->validate(['email' => $email, 'password' => $password])) {
            RateLimiter::hit($throttleKey, self::LOGIN_LOCK_SECONDS);

            // API-02：アドレスがない場合とパスワード違いを、同じ応答にする
            throw new ApiException(
                ApiErrorCode::InvalidCredentials,
                'メールアドレスまたはパスワードが正しくありません。',
            );
        }

        RateLimiter::clear($throttleKey);

        /** @var User $user */
        $user = $guard->getLastAttempted();

        return ['user' => $user, 'token' => $this->issueToken($user)];
    }

    /**
     * D-78：会員登録とログインのトークンは、ここでだけ発行する。
     */
    public function issueToken(User $user): string
    {
        $plainTextToken = $user->generateTokenString();
        $now = now();

        // first_login_at・last_activity_at はNOT NULLなので、標準の createToken() で作ってから
        // 書き足すことはできない。createToken() と同じ形で、2つの日時を最初から入れて作る
        $token = $user->tokens()->forceCreate([
            'name' => 'auth',
            'token' => hash('sha256', $plainTextToken),
            'abilities' => ['*'],
            'first_login_at' => $now,
            'last_activity_at' => $now,
        ]);

        return $token->getKey().'|'.$plainTextToken;
    }

    private function emailAlreadyRegistered(): ApiException
    {
        return new ApiException(
            ApiErrorCode::EmailAlreadyRegistered,
            'このメールアドレスはすでに登録されています。ログインするか、パスワードを再設定してください。',
        );
    }
}
