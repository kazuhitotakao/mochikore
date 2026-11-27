<?php

namespace App\Http\Controllers;

use App\Http\Requests\NoBodyRequest;
use App\Models\PackingList;
use App\Models\PackingListMember;
use App\Services\CollaborationService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * 共同編集のメンバー（F-34、D-119）。一覧は所有者とメンバー、外すのは所有者、抜けるのはメンバー本人。
 */
class ListMemberController extends Controller
{
    /**
     * API-58 所有者とメンバーの一覧。見せるのは表示名と写真（D-128）だけで、メールアドレス・利用者のIDは返さない。
     */
    public function index(Request $request, PackingList $list): JsonResource
    {
        Gate::authorize('view', $list);

        $userId = $request->user()->id;
        // 参加した順。同じ日時なら先に入った順
        $list->load(['user.avatar', 'members' => fn ($query) => $query->with('user.avatar')->orderBy('created_at')->orderBy('id')]);

        return new JsonResource([
            'owner' => [
                'display_name' => $list->user->display_name,
                'avatar' => $list->user->avatarDataUrl(),
                'is_me' => $list->user_id === $userId,
            ],
            'members' => $list->members->map(fn (PackingListMember $member) => [
                // 外すときに使う番号。利用者のIDは出さない
                'id' => $member->id,
                'display_name' => $member->user->display_name,
                'avatar' => $member->user->avatarDataUrl(),
                'joined_at' => $member->created_at,
                'is_me' => $member->user_id === $userId,
            ]),
        ]);
    }

    /**
     * API-59 所有者がメンバーを外す。ほかのリストのメンバーの番号は404。
     */
    public function destroy(NoBodyRequest $request, PackingList $list, PackingListMember $member, CollaborationService $service): Response
    {
        Gate::authorize('update', $list);
        abort_unless($member->packing_list_id === $list->id, 404);

        $service->remove($member);

        return response()->noContent();
    }

    /**
     * API-60 メンバーが自分でリストから抜ける。所有者・メンバーでない人は404（D-43）。
     */
    public function leave(NoBodyRequest $request, PackingList $list, CollaborationService $service): Response
    {
        $member = $list->members()->where('user_id', $request->user()->id)->first() ?? abort(404);

        $service->remove($member);

        return response()->noContent();
    }
}
