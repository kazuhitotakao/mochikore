<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderPackingListItemsRequest;
use App\Models\PackingList;
use App\Services\PackingListItemService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class ReorderPackingListItemsController extends Controller
{
    /**
     * API-19 持ち物を並べ替えた順番を保存する（F-15、D-03）。
     */
    public function __invoke(ReorderPackingListItemsRequest $request, PackingList $list, PackingListItemService $service): Response
    {
        Gate::authorize('update', $list);

        $service->reorder($list, $request->validated('item_ids'));

        return response()->noContent();
    }
}
