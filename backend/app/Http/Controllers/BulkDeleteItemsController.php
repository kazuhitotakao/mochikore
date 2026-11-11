<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkDeleteItemsRequest;
use App\Models\PackingList;
use App\Services\PackingListItemService;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

class BulkDeleteItemsController extends Controller
{
    /**
     * API-38 選んだ持ち物とグループをまとめて削除する（F-26、D-100）。SC-07 の「選んで削除」で使う。
     * API-12 と同じく、削除した後の親リストの is_public を返す（D-51）。
     */
    public function __invoke(BulkDeleteItemsRequest $request, PackingList $list, PackingListItemService $service): JsonResource
    {
        Gate::authorize('update', $list);

        return new JsonResource([
            'is_public' => $service->bulkDelete($list, $request->validated('item_ids'), $request->validated('group_ids')),
        ]);
    }
}
