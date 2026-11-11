<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderGroupsRequest;
use App\Models\PackingList;
use App\Services\GroupingService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class ReorderGroupsController extends Controller
{
    /**
     * API-36 グループの順番を保存する（F-24、D-98）。SC-07 で見出しを動かしたときに使う。
     */
    public function __invoke(ReorderGroupsRequest $request, PackingList $list, GroupingService $service): Response
    {
        Gate::authorize('update', $list);

        $service->reorderGroups($list, $request->validated('group_ids'));

        return response()->noContent();
    }
}
