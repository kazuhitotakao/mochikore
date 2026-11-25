<?php

namespace App\Http\Controllers;

use App\Http\Requests\BulkCheckItemsRequest;
use App\Http\Resources\PackingListItemResource;
use App\Models\PackingList;
use App\Services\PackingListItemService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class BulkCheckItemsController extends Controller
{
    /**
     * API-37 選んだ持ち物をまとめてチェック・解除する（F-25、D-99）。SC-07 のグループの見出しのチェックで使う。
     * 変えた後の持ち物（チェックと前回の日付）を返す（D-122）。
     */
    public function __invoke(BulkCheckItemsRequest $request, PackingList $list, PackingListItemService $service): AnonymousResourceCollection
    {
        Gate::authorize('editContents', $list);

        return PackingListItemResource::collection(
            $service->setChecks($list, $request->validated('item_ids'), $request->validated('is_checked')),
        );
    }
}
