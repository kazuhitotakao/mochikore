<?php

namespace App\Http\Middleware;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * D-19：メール認証が済むまで、自分のリストなどは使えない。
 * Laravel標準の verified は code のない403を返すので、画面がSC-04へ案内できるよう
 * 403 email_not_verified を返す（D-54、02_画面配置 共通8）。auth:sanctum の後に付ける。
 */
class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // auth:sanctum より前に付けてしまっても、未ログインを403にせず401のままにする
        if ($user === null) {
            throw new AuthenticationException;
        }

        if ($user instanceof MustVerifyEmail && ! $user->hasVerifiedEmail()) {
            throw new ApiException(ApiErrorCode::EmailNotVerified, 'メール認証を済ませてください。');
        }

        return $next($request);
    }
}
