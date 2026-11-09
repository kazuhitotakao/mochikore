<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;

class LogoutController extends Controller
{
    /**
     * API-03 ログアウト
     */
    public function __invoke(Request $request): Response
    {
        // ほかの端末のログインは続けられるよう、今使っているトークンだけを削除する
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
