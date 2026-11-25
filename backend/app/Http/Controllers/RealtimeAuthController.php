<?php

namespace App\Http\Controllers;

use App\Http\Requests\RealtimeAuthRequest;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Broadcast;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class RealtimeAuthController extends Controller
{
    /**
     * API-63 共同編集のチャンネルの認可（F-35、D-119）。
     * リストの所有者・メンバーにだけ、そのリストのチャンネルを聞くための署名を返す。
     */
    public function __invoke(RealtimeAuthRequest $request): JsonResource
    {
        try {
            $signed = Broadcast::auth($request);
        } catch (AccessDeniedHttpException) {
            // D-43：メンバーでない人・存在しないリストは同じ404にして、リストがあることを知らせない
            abort(404);
        }

        return new JsonResource(['auth' => $signed['auth']]);
    }
}
