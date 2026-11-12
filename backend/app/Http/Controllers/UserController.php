<?php

namespace App\Http\Controllers;

use App\Http\Requests\DeleteAccountRequest;
use App\Http\Resources\UserResource;
use App\Services\AccountDeletionService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class UserController extends Controller
{
    /**
     * API-04 本人の情報。メール未認証でも見られる
     */
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function destroy(DeleteAccountRequest $request, AccountDeletionService $service): Response
    {
        // API-22：URLや本文のIDを使わず、認証された本人だけを削除する
        $service->delete($request->user(), $request->validated('password'));

        return response()->noContent();
    }
}
