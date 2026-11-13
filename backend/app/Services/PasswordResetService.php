<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\PasswordResetLinkSent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

/**
 * パスワード再設定（F-13・API-20・21）。Laravel標準の仕組み（Password）で送信・照合する。
 * 期限60分と同じアドレスへの再送待ち60秒は config/auth.php の標準設定（expire・throttle）を使う。
 */
class PasswordResetService
{
    /**
     * API-20：登録の有無・再送待ちにかかわらず、呼び出し元は同じ204を返す（D-40・D-93）。
     */
    public function sendLinkAfterResponse(string $email): void
    {
        // 登録済みのときだけ token のbcrypt化とメールの作成・送信が走り、標準の時間そろえ（200ms）を超えて
        // 応答が遅くなる。応答を返してから送ると、応答までの処理に登録の有無が入らず、時間からも分からない。
        // 送信の結果は利用者に知らせない（D-93）ので、戻り値は使わない
        defer(function () use ($email) {
            $notification = DB::transaction(function () use ($email) {
                // D-49・D-52：退会・定期削除・メール変更と同じロックを使い、古いアドレスの再設定情報を残さない。
                if (! User::where('email', $email)->lockForUpdate()->first()) {
                    return null;
                }

                $notification = null;
                Password::sendResetLink(['email' => $email], function (User $user, string $token) use (&$notification) {
                    $notification = ['user' => $user, 'token' => $token];
                });

                return $notification;
            }, 3);

            // メールの応答待ちでは本人のロックを保持しない。標準の通知・送信イベントは引き続き使う。
            if ($notification !== null) {
                $notification['user']->sendPasswordResetNotification($notification['token']);
                event(new PasswordResetLinkSent($notification['user']));
            }
        });
    }

    /**
     * API-21：期限内で未使用のリンクなら新しいパスワードを保存し、古いログイン情報をすべて無効にする。
     */
    public function reset(string $token, string $email, string $password): void
    {
        $status = DB::transaction(function () use ($token, $email, $password) {
            // F-18・D-49：メール変更で旧アドレスの再設定情報が消える処理と、照合から保存までを直列にする
            if (! User::where('email', $email)->lockForUpdate()->first()) {
                return Password::INVALID_USER;
            }

            return Password::reset(
                ['token' => $token, 'email' => $email, 'password' => $password],
                function (User $user, string $password): void {
                    // password は hashed の型変換で保存時にハッシュ化される
                    $user->forceFill(['password' => $password])->save();
                    // 開発規約2-8：再設定では本人のトークンをすべて消す。外部キーがないのでコードで消す
                    $user->tokens()->delete();

                    event(new PasswordReset($user));
                },
            );
        }, 3);

        // 未登録のメールと、違う・期限切れ・使用済みのtokenを同じ応答にし、登録の有無を知らせない
        if ($status !== Password::PASSWORD_RESET) {
            throw new ApiException(ApiErrorCode::LinkInvalid, 'リンクの有効期限が切れているか、すでに使われています。');
        }
    }

    /**
     * 再設定メールのリンク。Next.jsのSC-15を開かせ、画面が入力を受けてからAPI-21を呼ぶ。
     * 開いただけでは無効にならない（02_画面配置 SC-15-1）。
     */
    public function resetUrl(User $user, string $token): string
    {
        return rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $token,
            'email' => $user->getEmailForPasswordReset(),
        ]);
    }
}
