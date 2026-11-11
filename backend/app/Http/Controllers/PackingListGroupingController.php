<?php

namespace App\Http\Controllers;

use App\Http\Resources\PackingListGroupingResource;
use App\Models\PackingList;
use Illuminate\Support\Facades\Gate;

class PackingListGroupingController extends Controller
{
    /**
     * API-29 グループ整理用の最新状態。よく使う項目の選択（SC-08）でも、
     * 一括追加（API-34）に使う最新の grouping_revision を読むために呼ぶ（D-79）。
     * 分類の保存（API-30）は手順書第15章で足す。
     */
    public function show(PackingList $list): PackingListGroupingResource
    {
        Gate::authorize('view', $list);

        // どちらも sort_order ASC、id ASC
        $list->load([
            'groups' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'items' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
        ]);

        return new PackingListGroupingResource($list);
    }
}
