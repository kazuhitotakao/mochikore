<?php

namespace App\Http\Controllers;

use App\Http\Requests\NoBodyRequest;
use App\Http\Requests\UpdateAvatarRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * 本人の写真（F-38、SC-05・SC-12、D-128）。URLや本文のIDを使わず、認証された本人のものだけを扱う。
 * 共同編集のメンバーの写真は、メンバーの一覧（API-58）で一緒に返す。
 */
class AvatarController extends Controller
{
    /**
     * API-70 本人の写真。載せていなければ null。
     */
    public function show(Request $request): JsonResource
    {
        // ログインの確認で読んだ利用者に覚えた値ではなく、今の写真を読む
        return new JsonResource(['avatar' => $request->user()->avatar()->first()?->dataUrl()]);
    }

    /**
     * API-71 写真を載せる・変える。前の写真は残さない。
     */
    public function update(UpdateAvatarRequest $request): JsonResource
    {
        $avatar = $request->user()->avatar()->updateOrCreate([], ['image' => $request->avatar()]);

        return new JsonResource(['avatar' => $avatar->dataUrl()]);
    }

    /**
     * API-72 写真を削除する。載せていなくても成功にする（送り直しても同じ）。
     */
    public function destroy(NoBodyRequest $request): Response
    {
        $request->user()->avatar()->delete();

        return response()->noContent();
    }
}
