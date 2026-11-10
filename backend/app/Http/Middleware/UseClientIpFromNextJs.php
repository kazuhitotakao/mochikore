<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * D-41：Next.jsの窓口から届いた通信だけ、Next.jsが渡す利用者のIPを $request->ip() として使う。
 * Laravelから見えるのはNext.js（本番はVercel）のIPで、全員が同じIPとして数えられてしまうため。
 * VercelのIPは決まっていないので、信頼する転送元をIPでは登録できない。代わりに合言葉で確かめる。
 * 合言葉が一致しない通信のヘッダーは無視し、X-Forwarded-For も今までどおり信じない。
 */
class UseClientIpFromNextJs
{
    public const CLIENT_IP_HEADER = 'X-Mochikore-Client-Ip';

    public const PROXY_KEY_HEADER = 'X-Mochikore-Proxy-Key';

    public function handle(Request $request, Closure $next): Response
    {
        $proxyKey = (string) config('services.nextjs.proxy_key');
        $sentKey = $request->header(self::PROXY_KEY_HEADER);
        $clientIp = $request->header(self::CLIENT_IP_HEADER);

        // 合言葉が未設定なら、どの通信のヘッダーも信じない
        if ($proxyKey !== ''
            && is_string($sentKey)
            && hash_equals($proxyKey, $sentKey)
            && is_string($clientIp)
            && filter_var($clientIp, FILTER_VALIDATE_IP) !== false) {
            $request->server->set('REMOTE_ADDR', $clientIp);
        }

        return $next($request);
    }
}
