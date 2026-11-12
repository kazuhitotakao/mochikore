<?php

namespace App\Http\Middleware;

use App\Models\PackingList;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePackingListIsPublic
{
    public function handle(Request $request, Closure $next): Response
    {
        $list = $request->route('list');
        // D-43・48：入力の検証より先に404にし、非公開リストの存在を応答から知らせない
        abort_unless($list instanceof PackingList && $list->is_public && $list->moderated_at === null, 404);

        return $next($request);
    }
}
