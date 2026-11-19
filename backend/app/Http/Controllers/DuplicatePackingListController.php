<?php

namespace App\Http\Controllers;

use App\Http\Requests\DuplicatePackingListRequest;
use App\Http\Resources\PackingListResource;
use App\Models\PackingList;
use App\Services\PackingListService;
use Illuminate\Support\Facades\Gate;

/**
 * API-50 自分のリストを丸ごと新しいリストにする（F-30、SC-07-4、D-116）。
 */
class DuplicatePackingListController extends Controller
{
    public function __invoke(DuplicatePackingListRequest $request, PackingList $list, PackingListService $service): PackingListResource
    {
        // D-43：他人のリスト・存在しないリストは同じ404
        Gate::authorize('view', $list);
        $copy = $service->duplicate($request->user(), $list, $request->validated('title'));

        return new PackingListResource($copy->load('category'));
    }
}
