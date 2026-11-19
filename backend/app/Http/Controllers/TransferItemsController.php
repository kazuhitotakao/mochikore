<?php

namespace App\Http\Controllers;

use App\Http\Requests\TransferItemsRequest;
use App\Models\PackingList;
use App\Services\ItemTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * 選んだ持ち物を、自分の別のリストへコピー・移動する（F-32、SC-07、D-118）。
 * 画面は元のリストに残るので、移し先（id・title）と件数、元のリストの is_public（D-51）を返す。
 */
class TransferItemsController extends Controller
{
    /**
     * API-51 コピー。
     */
    public function copy(TransferItemsRequest $request, PackingList $list, ItemTransferService $service): JsonResponse
    {
        Gate::authorize('update', $list);
        $result = $service->copy($request->user(), $list, ...$this->destination($request));

        return $this->respond($result, 201);
    }

    /**
     * API-52 移動。
     */
    public function move(TransferItemsRequest $request, PackingList $list, ItemTransferService $service): JsonResponse
    {
        Gate::authorize('update', $list);
        $result = $service->move($request->user(), $list, ...$this->destination($request));

        return $this->respond($result, 200);
    }

    /**
     * @return array{list<int>, int|null, string|null, int|null}
     */
    private function destination(TransferItemsRequest $request): array
    {
        return [
            $request->validated('item_ids'),
            $request->validated('destination_list_id'),
            $request->validated('new_list_title'),
            $request->validated('destination_group_id'),
        ];
    }

    /**
     * @param  array{list: PackingList, count: int, is_public: bool}  $result
     */
    private function respond(array $result, int $status): JsonResponse
    {
        // D-53：返すデータは data に入れる
        return (new JsonResource([
            'list' => ['id' => $result['list']->id, 'title' => $result['list']->title],
            'count' => $result['count'],
            'is_public' => $result['is_public'],
        ]))->response()->setStatusCode($status);
    }
}
