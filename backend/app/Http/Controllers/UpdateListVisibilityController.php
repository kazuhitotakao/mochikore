<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateListVisibilityRequest;
use App\Http\Resources\ListVisibilityResource;
use App\Models\PackingList;
use App\Services\PackingListService;
use Illuminate\Support\Facades\Gate;

class UpdateListVisibilityController extends Controller
{
    public function __invoke(UpdateListVisibilityRequest $request, PackingList $list, PackingListService $service): ListVisibilityResource
    {
        Gate::authorize('update', $list);

        return new ListVisibilityResource($service->updateVisibility($list, $request->validated('is_public')));
    }
}
