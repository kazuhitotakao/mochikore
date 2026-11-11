<?php

namespace App\Http\Controllers;

use App\Http\Requests\IndexSavedItemsRequest;
use App\Http\Requests\StoreSavedItemRequest;
use App\Http\Resources\SavedItemResource;
use App\Models\SavedItem;
use App\Services\SavedItemService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class SavedItemController extends Controller
{
    /**
     * API-31 本人のよく使う項目の一覧（F-22）。最大200件なのでページ分割しない。
     */
    public function index(IndexSavedItemsRequest $request): AnonymousResourceCollection
    {
        $categoryId = $request->categoryId();

        $savedItems = $request->user()->savedItems()
            ->with('category')
            ->when($categoryId !== null, fn ($query) => $query->where('category_id', $categoryId))
            // D-72：新しく保存した順。同じ日時なら新しく作った順
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return SavedItemResource::collection($savedItems);
    }

    /**
     * API-32 よく使う項目の保存（F-21）。新しく作ったら201、同じカテゴリーの同名があれば200で既存を返す。
     */
    public function store(StoreSavedItemRequest $request, SavedItemService $service): SavedItemResource
    {
        $savedItem = $service->save(
            $request->user(),
            $request->validated('name'),
            $request->validated('category_id'),
        );

        return new SavedItemResource($savedItem->load('category'));
    }

    /**
     * API-33 よく使う項目の削除。完全に削除し、追加済みの持ち物は残す（D-66・D-72）。
     */
    public function destroy(SavedItem $savedItem): Response
    {
        Gate::authorize('delete', $savedItem);

        $savedItem->delete();

        return response()->noContent();
    }
}
