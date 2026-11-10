<?php

namespace App\Providers;

use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Services\EmailVerification;
use App\Services\TokenLifetime;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Events\TokenAuthenticated;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // D-41：登録済みのアドレスを大量に調べられないよう、同じIPアドレスから1時間に10回まで
        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));

        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        // D-05・D-36：トークンを確かめるたびに、first_login_at（1年）と last_activity_at（180日）で判定する。
        // 期限切れは無効なトークンと同じ扱いになり、401 unauthenticated を返す
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid): bool => $isValid && app(TokenLifetime::class)->isActive($token),
        );

        // D-36：Next.jsが利用者の操作のときだけ付ける印（X-User-Activity）があれば期限を延ばす。
        // トークンが有効と分かった後に動くので、期限切れのトークンが延長で使えるようにはならない
        Event::listen(TokenAuthenticated::class, function (TokenAuthenticated $event): void {
            if (request()->header('X-User-Activity') === '1') {
                app(TokenLifetime::class)->recordActivity($event->token);
            }
        });

        // D-72：確認メールのリンクは、LaravelではなくNext.jsのSC-04を開かせる
        VerifyEmail::createUrlUsing(
            fn (User $user): string => app(EmailVerification::class)->verificationUrl($user),
        );

        VerifyEmail::toMailUsing(fn (User $user, string $url): MailMessage => (new MailMessage)
            ->subject('【もちこれ】メールアドレスの確認')
            ->greeting('もちこれへのご登録ありがとうございます。')
            ->line('下のボタンを押して登録を完了してください。リンクの有効期限は60分です。')
            ->action('メールアドレスを確認する', $url)
            ->line('心当たりがない場合は、このメールを削除してください。')
            ->salutation('もちこれ'));
    }
}
