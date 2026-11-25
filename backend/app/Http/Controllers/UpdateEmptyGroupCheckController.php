<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateEmptyGroupCheckRequest;
use App\Models\PackingListGroup;
use App\Services\GroupCheckService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class UpdateEmptyGroupCheckController extends Controller
{
    public function __invoke(UpdateEmptyGroupCheckRequest $request, PackingListGroup $group, GroupCheckService $service): Response
    {
        Gate::authorize('editContents', $group->packingList);

        $service->setCheck($group, $request->validated('is_checked'));

        return response()->noContent();
    }
}
