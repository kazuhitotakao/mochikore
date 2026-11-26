<?php

namespace App\Http\Controllers;

use App\Http\Requests\NoBodyRequest;
use App\Http\Requests\StoreCombinedViewRequest;
use App\Http\Requests\UpdateCombinedViewRequest;
use App\Http\Resources\CombinedViewResource;
use App\Models\CombinedView;
use App\Models\User;
use App\Services\CombinedViewService;
use Closure;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * まとめ表示（F-37、API-65〜69、D-124）。本人だけが扱い、ほかの人のものは404（D-43）。
 * 共同編集の配信（NotifyListChange）は付けない。まとめ表示はほかのメンバーに知らせないため。
 */
class CombinedViewController extends Controller
{
    /**
     * API-65 本人のまとめ表示の一覧（SC-05）。1人10件までなので、ページ分割しない。
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        $views = $user->combinedViews()
            ->with(['lists' => self::accessibleLists($user)])
            // D-24 と同じく、更新が新しい順。同じ日時なら新しく作った順
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();

        return CombinedViewResource::collection($views);
    }

    /**
     * API-66 まとめ表示を作る。新しく作ったデータを返すと、Laravel が201にする。
     */
    public function store(StoreCombinedViewRequest $request, CombinedViewService $service): CombinedViewResource
    {
        $user = $request->user();
        $view = $service->create($user, $request->validated('name'), $request->validated('list_ids'));

        return new CombinedViewResource($view->load(['lists' => self::accessibleLists($user)]));
    }

    /**
     * API-67 まとめ表示1件（SC-20）。並べるリストは、今見られるものだけを選んだ順で返す。
     */
    public function show(Request $request, CombinedView $combinedView): CombinedViewResource
    {
        Gate::authorize('manage', $combinedView);

        return new CombinedViewResource($combinedView->load(['lists' => self::accessibleLists($request->user())]));
    }

    /**
     * API-68 まとめ表示の名前・並べるリストを変える（送られた項目だけ、C-03）。
     */
    public function update(UpdateCombinedViewRequest $request, CombinedView $combinedView, CombinedViewService $service): CombinedViewResource
    {
        Gate::authorize('manage', $combinedView);

        $user = $request->user();
        $view = $service->update($user, $combinedView, $request->validated());

        return new CombinedViewResource($view->load(['lists' => self::accessibleLists($user)]));
    }

    /**
     * API-69 まとめ表示を消す。並べていたリストと持ち物は消えない。
     */
    public function destroy(NoBodyRequest $request, CombinedView $combinedView): Response
    {
        Gate::authorize('manage', $combinedView);

        $combinedView->delete();

        return response()->noContent();
    }

    /**
     * D-124：見られなくなったリスト（外された・抜けた）は、外し忘れがあっても返さない（二重に守る）。
     */
    private static function accessibleLists(User $user): Closure
    {
        return fn (BelongsToMany $query) => $query->accessibleBy($user);
    }
}
