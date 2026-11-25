<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGroupNameRequest;
use App\Http\Resources\PackingListGroupResource;
use App\Models\PackingListGroup;
use App\Services\GroupingService;
use Illuminate\Support\Facades\Gate;

class UpdateGroupNameController extends Controller
{
    /**
     * API-44 グループ名の変更（D-109）。SC-07 の見出しの名前から呼ぶ。
     */
    public function __invoke(UpdateGroupNameRequest $request, PackingListGroup $group, GroupingService $service): PackingListGroupResource
    {
        // D-43：グループが入っているリストの所有者・メンバーでなければ、存在しないグループと同じ404（D-119）
        Gate::authorize('editContents', $group->packingList);

        return new PackingListGroupResource($service->rename($group, $request->validated('name')));
    }
}
