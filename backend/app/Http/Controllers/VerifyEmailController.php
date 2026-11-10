<?php

namespace App\Http\Controllers;

use App\Services\EmailVerification;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class VerifyEmailController extends Controller
{
    /**
     * API-23 確認メールのリンクでメール認証を完了する。
     * ログイン（auth:sanctum）と署名・期限（signed:relative）はルートで確かめる。
     */
    public function __invoke(Request $request, string $id, string $hash, EmailVerification $emailVerification): Response
    {
        $emailVerification->verify($request->user(), $id, $hash);

        return response()->noContent();
    }
}
