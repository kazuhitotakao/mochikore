<?php

namespace App\Http\Controllers;

use App\Http\Requests\RegisterUserRequest;
use App\Http\Resources\AuthTokenResource;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;

class RegisterController extends Controller
{
    /**
     * API-01 会員登録
     */
    public function __invoke(RegisterUserRequest $request, AuthService $auth): JsonResponse
    {
        $result = $auth->register(
            $request->validated('email'),
            $request->validated('password'),
            // D-121：招待リンクから登録した人は、メール認証の後に招待の画面へ進める
            $request->validated('invite_token'),
        );

        return (new AuthTokenResource($result))->response()->setStatusCode(201);
    }
}
