<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGroupRequest;
use App\Http\Resources\PackingListGroupResource;
use App\Models\PackingListGroup;
use App\Services\GroupingService;
use Illuminate\Support\Facades\Gate;

class UpdateGroupController extends Controller
{
    /**
     * API-44 グループの名前・チェックの動きの変更（D-109・D-122）。SC-07 の見出しから呼ぶ。送られた項目だけを変える（C-03）。
     */
    public function __invoke(UpdateGroupRequest $request, PackingListGroup $group, GroupingService $service): PackingListGroupResource
    {
        // D-43：グループが入っているリストの所有者・メンバーでなければ、存在しないグループと同じ404（D-119）
        Gate::authorize('editContents', $group->packingList);

        return new PackingListGroupResource($service->update($group, $request->validated()));
    }
}
