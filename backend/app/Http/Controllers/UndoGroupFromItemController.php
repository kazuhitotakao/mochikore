<?php

namespace App\Http\Controllers;

use App\Http\Requests\UndoGroupFromItemRequest;
use App\Http\Resources\PackingListItemResource;
use App\Models\PackingListItem;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class UndoGroupFromItemController extends Controller
{
    /**
     * API-64 重ねてグループにしたのを元に戻す（F-24、D-123）。SC-07 で、重ねた直後に出す「元に戻す」から呼ぶ。
     * URL の持ち物は、見出しに変わった持ち物（一時削除中）。できたグループをなくし、2つの持ち物を元の場所へ戻す。
     */
    public function __invoke(UndoGroupFromItemRequest $request, PackingListItem $item, GroupingService $service): JsonResponse
    {
        // D-43：持ち物が入っているリストの所有者・メンバーでなければ、存在しない持ち物と同じ404（D-119）
        Gate::authorize('editContents', $item->packingList);

        $result = $service->undoCreateFromItem(
            $item,
            $request->validated('group_id'),
            $request->validated('item_id'),
            $request->validated('previous_group_id'),
        );

        return response()->json([
            'data' => [
                'restored' => (new PackingListItemResource($result['restored']))->resolve($request),
                'item' => (new PackingListItemResource($result['item']))->resolve($request),
            ],
        ]);
    }
}
