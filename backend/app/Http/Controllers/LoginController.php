<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Resources\AuthTokenResource;
use App\Services\AuthService;

class LoginController extends Controller
{
    /**
     * API-02 ログイン
     */
    public function __invoke(LoginRequest $request, AuthService $auth): AuthTokenResource
    {
        return new AuthTokenResource($auth->login(
            $request->validated('email'),
            $request->validated('password'),
            $request->ip(),
        ));
    }
}
