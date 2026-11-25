<?php

namespace App\Http\Controllers;

use App\Models\PackingList;
use App\Services\GroupCheckService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class ResetChecksController extends Controller
{
    /**
     * API-13 そのリストのチェックを全部外す（F-07、D-17）。持ち物は残す。
     */
    public function __invoke(PackingList $list, GroupCheckService $service): Response
    {
        Gate::authorize('editContents', $list);

        // 削除済みの持ち物は対象にせず、チェックを保つ（SoftDeletes の範囲外）。
        // D-25：チェックだけでは親リストの更新日時を変えず、構造も変えないので revision も増やさない
        $service->resetChecks($list);

        return response()->noContent();
    }
}
