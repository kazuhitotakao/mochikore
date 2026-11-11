<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSavedItemRequest;
use App\Http\Resources\SavedItemResource;
use App\Services\SavedItemService;

class SavedItemController extends Controller
{
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
}
