<?php

namespace App\Http\Controllers;

use App\Http\Requests\CopySharedPackingListRequest;
use App\Http\Resources\PackingListResource;
use App\Http\Resources\PublicPackingListDetailResource;
use App\Models\PackingList;
use App\Services\PackingListService;

/**
 * 限定公開のリンクから見る・コピーする（F-29、SC-18、D-114）。
 */
class SharedPackingListController extends Controller
{
    /**
     * API-48 リンクを知っている人が、ログインなしでリストを見る。公開リスト詳細（API-16）と同じ形で返す。
     */
    public function show(string $token): PublicPackingListDetailResource
    {
        // D-43・D-48：止めたリンク・運営が非公開にしたリストは、存在しないリストと同じ404にする
        $list = PackingList::where('share_token', $token)->whereNull('moderated_at')->firstOrFail();
        $list->load([
            'category',
            'groups' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'items' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
        ]);

        return new PublicPackingListDetailResource($list);
    }

    /**
     * API-49 リンクのリストを自分用にコピーする。条件は公開リストのコピー（API-17）と同じ。
     */
    public function copy(CopySharedPackingListRequest $request, string $token, PackingListService $service): PackingListResource
    {
        $copy = $service->copyShared($request->user(), $token);

        return new PackingListResource($copy->load('category'));
    }
}
