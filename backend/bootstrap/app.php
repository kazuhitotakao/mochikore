<?php

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Http\Middleware\UseClientIpFromNextJs;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // ログイン画面はNext.js側にあり、Laravelにはない。未ログインはリダイレクトせず401で返す
        $middleware->redirectGuestsTo(fn () => null);

        // D-41：回数制限（throttle・RateLimiter）より前に、利用者のIPへ置き換える
        $middleware->prepend(UseClientIpFromNextJs::class);

        // D-92・C-01：前後空白の削除と空文字→nullはLaravel標準のまま使う。
        // パスワード（password等は標準で対象外）と同じく、入力用tokenも空白を削らずに照合する
        $middleware->trimStrings(except: ['token']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // 利用者の操作で起こる想定内のエラーなので、ログに残さない
        $exceptions->dontReport([ApiException::class]);

        // D-53・D-54：Laravel標準のエラー応答には code がないので、APIでは message と code の形にそろえる
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => '入力内容を確認してください。',
                'code' => ApiErrorCode::ValidationError->value,
                'errors' => $e->errors(),
            ], 422);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return (new ApiException(ApiErrorCode::Unauthenticated, 'ログインしてください。'))->render();
        });

        $exceptions->render(function (ThrottleRequestsException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return (new ApiException(
                ApiErrorCode::TooManyRequests,
                'しばらくしてから再度お試しください。',
                (int) ($e->getHeaders()['Retry-After'] ?? 60),
            ))->render();
        });

        // D-72：署名付きリンクの不正・期限切れは、Laravel標準の403ではなく422 link_invalid にそろえる
        $exceptions->render(function (InvalidSignatureException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return (new ApiException(ApiErrorCode::LinkInvalid, 'リンクの有効期限が切れているか、無効です。'))->render();
        });

        // 想定外のエラーは、原因の詳細を利用者へ返さない（ログには残る）
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*') || $e instanceof HttpExceptionInterface || $e instanceof HttpResponseException) {
                return null;
            }

            return (new ApiException(ApiErrorCode::ServerError, 'サーバーでエラーが発生しました。'))->render();
        });
    })->create();
