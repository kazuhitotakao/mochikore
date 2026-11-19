<?php

namespace App\Http\Controllers;

use App\Http\Requests\ShareLinkRequest;
use App\Models\PackingList;
use App\Services\PackingListService;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * 限定公開のリンクを作る・止める（F-29、D-114）。リンクを扱えるのはリストの本人だけ。
 */
class ShareLinkController extends Controller
{
    /**
     * API-46 リンクを作る。すでにあれば同じリンクを返す。
     */
    public function store(ShareLinkRequest $request, PackingList $list, PackingListService $service): JsonResource
    {
        Gate::authorize('update', $list);

        return new JsonResource(['share_token' => $service->createShareLink($list)]);
    }

    /**
     * API-47 リンクを止める。止めたリンクは「ページが見つかりません」になる。
     */
    public function destroy(ShareLinkRequest $request, PackingList $list, PackingListService $service): Response
    {
        Gate::authorize('update', $list);
        $service->stopShareLink($list);

        return response()->noContent();
    }
}
