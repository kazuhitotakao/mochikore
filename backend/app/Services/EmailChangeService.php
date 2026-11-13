<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class EmailChangeService
{
    public const RESEND_INTERVAL_SECONDS = 60;

    public const LINK_LIFETIME_MINUTES = 60;

    public function send(User $user, string $pendingEmail, string $password): void
    {
        $account = DB::transaction(function () use ($user, $pendingEmail, $password): User {
            $account = $this->lockedAccount($user);
            if (! Hash::check($password, $account->password)) {
                throw new ApiException(ApiErrorCode::InvalidPassword, 'パスワードが正しくありません。');
            }

            // V-16：入力検証の後に別端末で変更が確定した場合も、現在と同じ宛先を受け付けない
            if ($pendingEmail === $account->email) {
                throw ValidationException::withMessages(['pending_email' => [__('validation.email_change.same')]]);
            }

            $remaining = $account->pending_email_requested_at
                ? $account->pending_email_requested_at->getTimestamp() + self::RESEND_INTERVAL_SECONDS - now()->getTimestamp()
                : 0;
            if ($remaining > 0) {
                throw new ApiException(ApiErrorCode::TooManyRequests, 'しばらくしてから再度お試しください。', $remaining);
            }

            // D-49・72：本人をロックし、同時送信でも依頼日時を1つにする。DBの秒精度とhashの値をそろえる
            $account->forceFill([
                'pending_email' => $pendingEmail,
                'pending_email_requested_at' => now()->startOfSecond(),
            ])->save();

            return $account;
        }, 3);

        // API-27：登録の有無や送信時間を受付応答に入れない。登録済みの変更先へは送らない
        defer(function () use ($account, $pendingEmail) {
            if (! User::where('email', $pendingEmail)->exists()) {
                $url = $this->confirmationUrl($account);
                Mail::raw(
                    "メールアドレス変更のご案内\n\n下のリンクを開いて変更を確定してください。リンクは60分間有効です。\n{$url}\n\n確定するまでは現在のメールアドレスを使います。心当たりがない場合は、このメールを削除してください。",
                    fn (Message $message) => $message->to($pendingEmail)->subject('【もちこれ】メールアドレス変更の確認'),
                );
            }
        });

        // 一方の送信に失敗しても、旧アドレスへの通知は別に試みる
        defer(fn () => Mail::raw(
            "メールアドレスの変更を受け付けました。\n\n変更先：{$pendingEmail}\n新しいアドレスに届く確認リンクで確定するまでは、現在のアドレスを使います。\n\n心当たりがない場合は、アカウント設定からパスワードを再設定してください。",
            fn (Message $message) => $message->to($account->email)->subject('【もちこれ】メールアドレス変更の受付'),
        ));
    }

    public function confirm(User $user, string $id, string $hash): void
    {
        try {
            $previousEmail = DB::transaction(function () use ($user, $id, $hash): string {
                $account = $this->lockedAccount($user);
                if (! hash_equals((string) $account->id, $id)
                    || ! $account->pending_email
                    || ! $account->pending_email_requested_at
                    || ! hash_equals($this->requestHash($account), $hash)
                    || $account->pending_email_requested_at->copy()->addMinutes(self::LINK_LIFETIME_MINUTES)->isPast()
                    || User::where('email', $account->pending_email)->exists()) {
                    throw $this->invalidLink();
                }

                $oldEmail = $account->email;
                // D-49・72：直近の依頼日時は残す。確定直後も60秒あけ、同じ秒の依頼で過去のhashを再利用させない
                $account->forceFill([
                    'email' => $account->pending_email,
                    'email_verified_at' => now(),
                    'pending_email' => null,
                ])->save();

                // D-49：確定した端末は残し、他のログインと変更前の再設定情報だけを無効にする
                $account->tokens()->where('id', '!=', $user->currentAccessToken()->getKey())->delete();
                DB::table('password_reset_tokens')->where('email', $oldEmail)->delete();

                return $oldEmail;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            // API-28：確認後に同じアドレスの登録・変更が競合した場合も、登録の有無を教えない
            throw $this->invalidLink();
        }

        // API-28：通知の送信障害で、確定済みの変更を失敗扱いにしない
        defer(fn () => Mail::raw(
            "メールアドレスの変更が完了しました。\n\n今後は新しいメールアドレスでログインしてください。ほかの端末では、ログインし直す必要があります。\n\n心当たりがない場合は、もちこれのお問い合わせ先へご連絡ください。",
            fn (Message $message) => $message->to($previousEmail)->subject('【もちこれ】メールアドレス変更の完了'),
        ));
    }

    public function confirmationUrl(User $account): string
    {
        // D-72：トークンは入れず、Next.jsから別ホストへPOSTしても確かめられる相対署名を使う
        $url = URL::temporarySignedRoute(
            'email-change.confirm',
            $account->pending_email_requested_at->copy()->addMinutes(self::LINK_LIFETIME_MINUTES),
            ['id' => $account->id, 'hash' => $this->requestHash($account)],
            absolute: false,
        );
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        return rtrim(config('app.frontend_url'), '/').'/account/email?'.http_build_query([
            'id' => $account->id,
            'hash' => $query['hash'],
            'expires' => $query['expires'],
            'signature' => $query['signature'],
        ]);
    }

    private function requestHash(User $account): string
    {
        return hash('sha256', $account->pending_email."\0".$account->pending_email_requested_at->getTimestamp());
    }

    private function lockedAccount(User $user): User
    {
        $account = User::whereKey($user->id)->lockForUpdate()->first();
        $token = $user->currentAccessToken();
        // 変更・退会・再設定で待機中にトークンが消えた場合は、古い本人情報だけで続けない
        if (! $account || ! $token || ! $account->tokens()->whereKey($token->getKey())->exists()) {
            throw new ApiException(ApiErrorCode::Unauthenticated, 'ログインしてください。');
        }
        if (! $account->hasVerifiedEmail()) {
            throw new ApiException(ApiErrorCode::EmailNotVerified, 'メール認証を済ませてください。');
        }

        return $account;
    }

    private function invalidLink(): ApiException
    {
        return new ApiException(ApiErrorCode::LinkInvalid, 'リンクの有効期限が切れているか、無効です。');
    }
}
