<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBulkItemsRequest;
use App\Http\Resources\PackingListItemResource;
use App\Models\PackingList;
use App\Services\PackingListItemService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class BulkAddItemsController extends Controller
{
    /**
     * API-34 よく使う項目から一括追加（F-22）。追加した持ち物と、増えた grouping_revision を返す。
     */
    public function __invoke(StoreBulkItemsRequest $request, PackingList $list, PackingListItemService $service): JsonResponse
    {
        // 追加先のリストの本人でなければ、存在しないリストと同じ404（V-12）
        Gate::authorize('update', $list);

        $result = $service->addFromSavedItems(
            $list,
            $request->user(),
            $request->validated('saved_item_ids'),
            $request->validated('base_revision'),
        );

        return response()->json([
            'data' => [
                'grouping_revision' => $result['grouping_revision'],
                'items' => PackingListItemResource::collection($result['items'])->resolve($request),
            ],
        ], 201);
    }
}
