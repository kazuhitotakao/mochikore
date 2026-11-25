<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePackingListRequest;
use App\Http\Requests\UpdatePackingListRequest;
use App\Http\Resources\PackingListDetailResource;
use App\Http\Resources\PackingListResource;
use App\Http\Resources\PackingListSummaryResource;
use App\Models\PackingList;
use App\Services\PackingListService;
use App\Services\RepeatCheckService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class PackingListController extends Controller
{
    /**
     * API-05 自分のリスト一覧。自分のリスト100件と参加しているリスト100件までなので、ページ分割しない（D-63・D-119）。
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        // D-119：所有するリストと、共同編集のメンバーとして参加しているリストを一緒に並べる
        $lists = PackingList::accessibleBy($request->user())
            ->with('category')
            ->withCount(['items', 'members'])
            // D-24：更新が新しい順。同じ日時なら新しく作った順
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();

        return PackingListSummaryResource::collection($lists);
    }

    /**
     * API-06 リストの作成。
     */
    public function store(StorePackingListRequest $request, PackingListService $service): PackingListResource
    {
        $list = $service->create($request->user(), $request->validated());

        // 新しく作ったデータを返すと、Laravelが201にする
        return new PackingListResource($list->load('category'));
    }

    /**
     * API-07 自分のリスト・参加しているリストの内容。削除済みの持ち物は返さない。
     */
    public function show(PackingList $list, RepeatCheckService $repeatChecks): PackingListDetailResource
    {
        Gate::authorize('view', $list);

        // 06_API一覧「グループ整理のAPI仕様」：どちらも sort_order ASC、id ASC
        $list->load([
            'category',
            'groups' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'items' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
        ])->loadCount('members');
        // D-122：繰り返し利用のグループのチェックは、日付が変わっていたらここで外す（定期処理は使わない）
        $repeatChecks->expireLoaded($list);

        return new PackingListDetailResource($list);
    }

    /**
     * API-08 リストの編集。送られた項目だけを変える（C-03）。
     */
    public function update(UpdatePackingListRequest $request, PackingList $list): PackingListResource
    {
        Gate::authorize('update', $list);

        // D-24：内容が変わったときだけ updated_at が新しくなり、一覧の上に戻る
        $list->update($request->validated());

        return new PackingListResource($list->load('category'));
    }

    /**
     * API-09 リストの削除。持ち物（削除済みを含む）・グループ・通報はDBが一緒に消す（04_テーブル定義）。
     */
    public function destroy(PackingList $list): Response
    {
        Gate::authorize('delete', $list);

        $list->delete();

        return response()->noContent();
    }
}
