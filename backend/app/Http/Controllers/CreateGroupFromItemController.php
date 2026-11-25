<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateGroupFromItemRequest;
use App\Http\Resources\PackingListGroupResource;
use App\Http\Resources\PackingListItemResource;
use App\Models\PackingListItem;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class CreateGroupFromItemController extends Controller
{
    /**
     * API-45 持ち物を重ねてグループにする（F-24、D-111）。SC-07 で持ち物を、未分類の持ち物の行の真ん中に重ねて離したときに呼ぶ。
     * 重ねられた持ち物（URL）はグループの見出しに変わり、重ねた持ち物（item_id）がその中に入る。
     */
    public function __invoke(CreateGroupFromItemRequest $request, PackingListItem $item, GroupingService $service): JsonResponse
    {
        // D-43：持ち物が入っているリストの所有者・メンバーでなければ、存在しない持ち物と同じ404（D-119）
        Gate::authorize('editContents', $item->packingList);

        $result = $service->createFromItem($item, $request->validated('item_id'));

        return response()->json([
            'data' => [
                'group' => (new PackingListGroupResource($result['group']))->resolve($request),
                'item' => (new PackingListItemResource($result['item']))->resolve($request),
            ],
        ], 201);
    }
}
