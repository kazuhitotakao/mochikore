<?php

namespace App\Http\Controllers;

use App\Http\Requests\NoBodyRequest;
use App\Models\PackingList;
use App\Services\CollaborationService;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * 共同編集の招待リンクを作る・止める（F-34、D-119）。扱えるのはリストの所有者だけ。
 */
class InviteLinkController extends Controller
{
    /**
     * API-56 招待リンクを作る。有効なリンクがあれば同じものを返す。
     * 表示名は会員登録で入れてあるので、ここでは受け取らない（D-127）。
     */
    public function store(NoBodyRequest $request, PackingList $list, CollaborationService $service): JsonResource
    {
        Gate::authorize('update', $list);

        $list = $service->createInviteLink($list);

        return new JsonResource([
            'invite_token' => $list->invite_token,
            'invite_expires_at' => $list->invite_expires_at,
        ]);
    }

    /**
     * API-57 招待リンクを止める。止めたリンクは「ページが見つかりません」になる。
     */
    public function destroy(NoBodyRequest $request, PackingList $list, CollaborationService $service): Response
    {
        Gate::authorize('update', $list);
        $service->stopInviteLink($list);

        return response()->noContent();
    }
}
