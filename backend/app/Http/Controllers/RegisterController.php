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
        );

        return (new AuthTokenResource($result))->response()->setStatusCode(201);
    }
}
