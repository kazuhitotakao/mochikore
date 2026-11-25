<?php

namespace App\Http\Controllers;

use App\Services\CollaborationService;
use App\Services\EmailVerification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VerifyEmailController extends Controller
{
    /**
     * API-23 確認メールのリンクでメール認証を完了する。
     * ログイン（auth:sanctum）と署名・期限（signed:relative）はルートで確かめる。
     */
    public function __invoke(Request $request, string $id, string $hash, EmailVerification $emailVerification, CollaborationService $collaboration): JsonResource
    {
        $inviteToken = $emailVerification->verify($request->user(), $id, $hash);

        // D-121：共同編集の招待リンクから登録した人は、認証の後に招待の画面（SC-19）へ進める。
        // その間に止められた・期限が切れた招待は返さず、今までどおり自分のリスト一覧へ進める
        return new JsonResource([
            'invite_token' => $inviteToken !== null && $collaboration->findByInvite($inviteToken) !== null
                ? $inviteToken
                : null,
        ]);
    }
}
