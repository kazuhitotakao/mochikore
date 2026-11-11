<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkCheckItemsRequest;
use App\Models\PackingList;
use App\Services\PackingListItemService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class BulkCheckItemsController extends Controller
{
    /**
     * API-37 選んだ持ち物をまとめてチェック・解除する（F-25、D-99）。SC-07 のグループの見出しのチェックで使う。
     */
    public function __invoke(BulkCheckItemsRequest $request, PackingList $list, PackingListItemService $service): Response
    {
        Gate::authorize('update', $list);

        $service->setChecks($list, $request->validated('item_ids'), $request->validated('is_checked'));

        return response()->noContent();
    }
}
