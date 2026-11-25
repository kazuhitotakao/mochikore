<?php

namespace App\Http\Middleware;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\PackingListMember;
use App\Services\ListChangeNotifier;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 共同編集のリストを変える操作が成功したら、ほかのメンバーへ「変わった」と配信する（F-35、D-119）。
 * 配信をAPIごとに書かず、リストの中身・リストそのもの・メンバーを変えるルートにまとめて付ける。
 */
class NotifyListChange
{
    public function __construct(private ListChangeNotifier $notifier) {}

    public function handle(Request $request, Closure $next): Response
    {
        // 処理の前に、メンバーがいるリストだけを選んでおく。リストの削除・メンバーを外した後では、
        // 配信する相手がいたかが分からなくなるため。メンバーがいないリストでは何も送らない
        $listIds = $this->sharedListIds($request);

        $response = $next($request);

        if ($response->isSuccessful()) {
            foreach ($listIds as $listId) {
                // 操作した本人の画面は自分で表示を変えるので、配信先から外す
                $this->notifier->notify($listId, $request->header('X-Socket-ID'));
            }
        }

        return $response;
    }

    /**
     * @return list<int>
     */
    private function sharedListIds(Request $request): array
    {
        $list = $request->route('list');
        $item = $request->route('item');
        $group = $request->route('group');
        // API-51〜54：持ち物を入れる先のリスト（参加しているリストへ入れたとき）
        $destination = $request->input('destination_list_id');

        $candidates = array_filter([
            $list instanceof PackingList ? $list->id : null,
            $item instanceof PackingListItem ? $item->packing_list_id : null,
            $group instanceof PackingListGroup ? $group->packing_list_id : null,
            is_int($destination) ? $destination : null,
        ]);
        if ($candidates === []) {
            return [];
        }

        return PackingListMember::whereIn('packing_list_id', $candidates)
            ->distinct()
            ->pluck('packing_list_id')
            ->all();
    }
}
