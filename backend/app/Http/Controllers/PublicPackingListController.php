<?php

namespace App\Http\Controllers;

use App\Http\Requests\IndexPublicListsRequest;
use App\Http\Resources\PublicPackingListDetailResource;
use App\Http\Resources\PublicPackingListSummaryResource;
use App\Models\PackingList;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class PublicPackingListController extends Controller
{
    public function show(PackingList $list): PublicPackingListDetailResource
    {
        $list->load([
            'category',
            'groups' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
            'items' => fn ($query) => $query->orderBy('sort_order')->orderBy('id'),
        ]);

        return new PublicPackingListDetailResource($list);
    }

    public function index(IndexPublicListsRequest $request): AnonymousResourceCollection
    {
        $filters = $request->validated();
        $lists = PackingList::query()
            ->where('is_public', true)
            ->whereNull('moderated_at')
            ->with('category');

        if (($filters['keyword'] ?? null) !== null) {
            // D-18：入力の%・_をワイルドカードにせず、リスト名の部分一致だけで探す
            $keyword = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $filters['keyword']);
            $lists->whereRaw("title LIKE ? ESCAPE '!'", ['%'.$keyword.'%']);
        }

        if (isset($filters['category_id'])) {
            $lists->where('category_id', (int) $filters['category_id']);
        }

        if (($filters['sort'] ?? PackingList::SORT_NEWEST) === PackingList::SORT_MOST_COPIED) {
            // D-117：ほかの利用者のうち、今あるコピーを持つ人の数。同じ人の何回ものコピーは1と数え、
            // 本人のコピーは数えない。数は保存せず、読むたびに数える（コピーの削除・退会でも食い違わない）
            $lists->orderByDesc(
                DB::table('packing_lists as copies')
                    ->selectRaw('count(distinct copies.user_id)')
                    ->whereColumn('copies.source_list_id', 'packing_lists.id')
                    ->whereColumn('copies.user_id', '<>', 'packing_lists.user_id')
            );
        }

        // D-23：更新日時は使わず、同じ作成日時ならidが大きい順（D-117の同じ数のときも同じ）。D-53：標準のmeta・linksを維持する
        $page = $lists->orderByDesc('created_at')->orderByDesc('id')
            ->paginate(20, ['*'], 'page', (int) ($filters['page'] ?? 1))
            ->appends(Arr::except($filters, 'page'));

        return PublicPackingListSummaryResource::collection($page);
    }
}
