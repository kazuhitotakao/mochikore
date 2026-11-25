<?php

namespace App\Http\Controllers;

use App\Http\Resources\PackingListItemResource;
use App\Models\PackingListItem;
use App\Services\PackingListItemService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class RestorePackingListItemController extends Controller
{
    /**
     * API-25 この画面で削除した持ち物を1件戻す（F-05、D-28・D-35）。
     */
    public function __invoke(Request $request, PackingListItem $item, PackingListItemService $service): PackingListItemResource
    {
        // D-43・D-119：持ち物が入っているリストの所有者・メンバーでなければ、存在しない持ち物と同じ404
        Gate::authorize('editContents', $item->packingList);

        return new PackingListItemResource($service->restore($request->user(), $item));
    }
}
