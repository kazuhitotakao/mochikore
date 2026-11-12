<?php

namespace App\Http\Controllers;

use App\Http\Requests\IndexPublicListsRequest;
use App\Http\Resources\PublicPackingListSummaryResource;
use App\Models\PackingList;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;

class PublicPackingListController extends Controller
{
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

        // D-23：更新日時は使わず、同じ作成日時ならidが大きい順。D-53：標準のmeta・linksを維持する
        $page = $lists->orderByDesc('created_at')->orderByDesc('id')
            ->paginate(20, ['*'], 'page', (int) ($filters['page'] ?? 1))
            ->appends(Arr::except($filters, 'page'));

        return PublicPackingListSummaryResource::collection($page);
    }
}
