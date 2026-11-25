<?php

namespace App\Http\Controllers;

use App\Http\Requests\DeleteAccountRequest;
use App\Http\Requests\UpdateProfileRequest;
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

    /**
     * API-55 表示名を変える（D-119）。共同編集のメンバーに見せる名前で、公開リストには出さない（D-32）。
     */
    public function update(UpdateProfileRequest $request): UserResource
    {
        $user = $request->user();
        $user->display_name = $request->validated('display_name');
        $user->save();

        return new UserResource($user);
    }

    public function destroy(DeleteAccountRequest $request, AccountDeletionService $service): Response
    {
        // API-22：URLや本文のIDを使わず、認証された本人だけを削除する
        $service->delete($request->user(), $request->validated('password'));

        return response()->noContent();
    }
}
