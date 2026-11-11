<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePackingListItemRequest;
use App\Http\Requests\UpdatePackingListItemRequest;
use App\Http\Resources\PackingListItemResource;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Services\PackingListItemService;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

class PackingListItemController extends Controller
{
    /**
     * API-10 持ち物の追加。
     */
    public function store(StorePackingListItemRequest $request, PackingList $list, PackingListItemService $service): PackingListItemResource
    {
        Gate::authorize('update', $list);

        // 新しく作ったデータを返すと、Laravelが201にする
        return new PackingListItemResource($service->add($list, $request->validated('name')));
    }

    /**
     * API-11 持ち物の名前・チェックの変更。送られた項目だけを変える（C-03）。
     */
    public function update(UpdatePackingListItemRequest $request, PackingListItem $item, PackingListItemService $service): PackingListItemResource
    {
        // D-43：持ち物が入っているリストの本人でなければ、存在しない持ち物と同じ404
        Gate::authorize('update', $item->packingList);

        return new PackingListItemResource($service->update($item, $request->validated()));
    }

    /**
     * API-12 持ち物の削除。画面が非公開の案内を出せるよう、親リストの is_public を返す（D-51・D-62）。
     */
    public function destroy(PackingListItem $item, PackingListItemService $service): JsonResource
    {
        Gate::authorize('update', $item->packingList);

        return new JsonResource(['is_public' => $service->delete($item)]);
    }
}
