<?php

namespace App\Http\Controllers;

use App\Http\Requests\ForgotPasswordRequest;
use App\Services\PasswordResetService;
use Illuminate\Http\Response;

class ForgotPasswordController extends Controller
{
    /**
     * API-20 パスワード再設定用のメールを送る。ログイン不要
     */
    public function __invoke(ForgotPasswordRequest $request, PasswordResetService $passwordReset): Response
    {
        $passwordReset->sendLinkAfterResponse($request->validated('email'));

        return response()->noContent();
    }
}
