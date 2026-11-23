<?php

namespace App\Http\Controllers;

use App\Http\Requests\ImportItemsRequest;
use App\Models\PackingList;
use App\Services\ItemTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * 公開リスト（SC-11）・限定公開のリスト（SC-18）から、選んだ持ち物を自分のリストへ取り込む（F-33、D-118）。
 * 画面は元のリストに残るので、取り込み先（id・title）と件数だけを返す。元のリストの情報は返さない（D-32）。
 */
class ImportItemsController extends Controller
{
    /**
     * API-53 公開リストから取り込む。公開中かはルートの EnsurePackingListIsPublic で先に確かめる。
     */
    public function fromPublic(ImportItemsRequest $request, PackingList $list, ItemTransferService $service): JsonResponse
    {
        Gate::authorize('copy', $list);

        return $this->respond($service->importFromPublic($request->user(), $list, ...$this->destination($request)));
    }

    /**
     * API-54 限定公開のリンクのリストから取り込む。止めたリンク・運営が非公開にしたリストは404（D-114）。
     */
    public function fromShared(ImportItemsRequest $request, string $token, ItemTransferService $service): JsonResponse
    {
        return $this->respond($service->importFromShared($request->user(), $token, ...$this->destination($request)));
    }

    /**
     * @return array{list<int>, int|null, string|null, int|null}
     */
    private function destination(ImportItemsRequest $request): array
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
    private function respond(array $result): JsonResponse
    {
        // D-53：返すデータは data に入れる
        return (new JsonResource([
            'list' => ['id' => $result['list']->id, 'title' => $result['list']->title],
            'count' => $result['count'],
        ]))->response()->setStatusCode(201);
    }
}
