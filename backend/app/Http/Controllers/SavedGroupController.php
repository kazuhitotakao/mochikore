<?php

namespace App\Http\Controllers;

use App\Http\Requests\IndexSavedGroupsRequest;
use App\Http\Requests\StoreSavedGroupRequest;
use App\Http\Resources\SavedGroupResource;
use App\Models\SavedGroup;
use App\Services\SavedGroupService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class SavedGroupController extends Controller
{
    /**
     * API-39 本人のよく使うグループの一覧（F-28）。最大100件なのでページ分割しない。
     */
    public function index(IndexSavedGroupsRequest $request): AnonymousResourceCollection
    {
        $categoryId = $request->categoryId();

        $savedGroups = $request->user()->savedGroups()
            ->with('category')
            ->when($categoryId !== null, fn ($query) => $query->where('category_id', $categoryId))
            // D-102：新しく保存した順。同じ日時なら新しく作った順
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return SavedGroupResource::collection($savedGroups);
    }

    /**
     * API-40 よく使うグループの保存（F-28）。新しく作ったら201、同じカテゴリーの同名があれば200で既存を返す。
     */
    public function store(StoreSavedGroupRequest $request, SavedGroupService $service): SavedGroupResource
    {
        $savedGroup = $service->save(
            $request->user(),
            $request->validated('name'),
            $request->validated('category_id'),
        );

        return new SavedGroupResource($savedGroup->load('category'));
    }

    /**
     * API-41 よく使うグループの削除。完全に削除し、追加済みのグループは残す（D-102）。
     */
    public function destroy(SavedGroup $savedGroup): Response
    {
        Gate::authorize('delete', $savedGroup);

        $savedGroup->delete();

        return response()->noContent();
    }
}
