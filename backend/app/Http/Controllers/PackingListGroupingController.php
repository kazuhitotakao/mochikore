<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGroupingRequest;
use App\Http\Resources\PackingListGroupingResource;
use App\Models\PackingList;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class PackingListGroupingController extends Controller
{
    /**
     * API-29 グループ整理用の最新状態。グループ整理（SC-09）を開くときと、よく使う項目の選択（SC-08）で
     * 一括追加（API-34）に使う最新の grouping_revision を読むときに呼ぶ（D-79）。
     */
    public function show(PackingList $list): PackingListGroupingResource
    {
        Gate::authorize('view', $list);

        return new PackingListGroupingResource($this->loadGrouping($list));
    }

    /**
     * API-30 グループ整理の保存（F-19）。OKでグループの構成・順番・所属をまとめて置き換える（D-59）。
     */
    public function update(UpdateGroupingRequest $request, PackingList $list, GroupingService $service): JsonResponse
    {
        Gate::authorize('update', $list);

        $groupKeyMap = $service->save(
            $list,
            $request->validated('base_revision'),
            $request->validated('groups'),
            $request->validated('assignments'),
        );

        // 06_API一覧「保存成功」：GET と同じ項目・順序の最新値と、下書きの key → 保存後のグループID
        return response()->json([
            'data' => [
                ...(new PackingListGroupingResource($this->loadGrouping($list->refresh())))->resolve($request),
                'group_key_map' => (object) $groupKeyMap,
            ],
        ]);
    }

    /**
     * カテゴリーと、グループ・削除していない持ち物を（どちらも sort_order ASC、id ASC で）読む。
     */
    private function loadGrouping(PackingList $list): PackingList
    {
        return $list->load([
            'category',
            'groups' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'items' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
        ]);
    }
}
