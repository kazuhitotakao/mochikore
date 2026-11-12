<?php

namespace App\Http\Controllers;

use App\Http\Requests\CopyPublicPackingListRequest;
use App\Http\Resources\PackingListResource;
use App\Models\PackingList;
use App\Services\PackingListService;
use Illuminate\Support\Facades\Gate;

class CopyPublicPackingListController extends Controller
{
    public function __invoke(CopyPublicPackingListRequest $request, PackingList $list, PackingListService $service): PackingListResource
    {
        Gate::authorize('copy', $list);
        $copy = $service->copyPublic($request->user(), $list);

        return new PackingListResource($copy->load('category'));
    }
}
