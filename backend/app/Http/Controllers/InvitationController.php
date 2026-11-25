<?php

namespace App\Http\Controllers;

use App\Http\Requests\InvitationRequest;
use App\Models\PackingList;
use App\Services\CollaborationService;
use App\Services\ListChangeNotifier;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 共同編集の招待リンクを開いた人（F-34、SC-19、D-119）。ログインとメール認証が必要。
 */
class InvitationController extends Controller
{
    /**
     * API-61 招待の内容。参加する前に見せるのは、リスト名・所有者の表示名・人数だけ（持ち物は返さない）。
     */
    public function show(Request $request, string $token, CollaborationService $service): JsonResource
    {
        $list = $service->findByInvite($token) ?? abort(404);
        $list->load('user')->loadCount('members');
        $user = $request->user();

        return new JsonResource([
            'list' => ['id' => $list->id, 'title' => $list->title],
            'owner_display_name' => $list->user->display_name,
            // 所有者を除いたメンバーの数（API-05・07 と同じ数え方）
            'member_count' => $list->members_count,
            'status' => match (true) {
                $list->isOwnedBy($user) => 'owner',
                $list->isAccessibleBy($user) => 'member',
                $list->members_count + 1 >= PackingList::MAX_PEOPLE => 'full',
                default => 'joinable',
            },
        ]);
    }

    /**
     * API-62 参加する。所有者・参加済みの人が送っても、何も変えずに同じ応答を返す。
     */
    public function join(InvitationRequest $request, string $token, CollaborationService $service, ListChangeNotifier $notifier): JsonResource
    {
        $list = $service->join($request->user(), $token, $request->validated('display_name'));
        // F-35：開いている所有者・メンバーの画面で、人数をすぐ変える
        $notifier->notify($list->id, $request->header('X-Socket-ID'));

        return new JsonResource(['list' => ['id' => $list->id, 'title' => $list->title]]);
    }
}
