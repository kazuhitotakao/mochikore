<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * API-04 本人の情報。メール未認証でも見られる
     */
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }
}
