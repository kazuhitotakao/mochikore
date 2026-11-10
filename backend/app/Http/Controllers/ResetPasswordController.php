<?php

namespace App\Http\Controllers;

use App\Http\Requests\ResetPasswordRequest;
use App\Services\PasswordResetService;
use Illuminate\Http\Response;

class ResetPasswordController extends Controller
{
    /**
     * API-21 新しいパスワードを保存する。ログイン不要
     */
    public function __invoke(ResetPasswordRequest $request, PasswordResetService $passwordReset): Response
    {
        $passwordReset->reset(
            $request->validated('token'),
            $request->validated('email'),
            $request->validated('password'),
        );

        return response()->noContent();
    }
}
