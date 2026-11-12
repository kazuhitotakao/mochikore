<?php

namespace App\Services;

use App\Models\ListReport;
use App\Models\PackingList;
use Illuminate\Support\Facades\DB;

class ListReportService
{
    public function create(PackingList $list, string $reason): ListReport
    {
        return DB::transaction(function () use ($list, $reason) {
            // D-46・48：受付中に非公開・削除になったリストへ保存しないよう、親の変更と直列にする
            $current = PackingList::query()->lockForUpdate()->findOrFail($list->id);
            abort_unless($current->is_public && $current->moderated_at === null, 404);

            return ListReport::create(['packing_list_id' => $current->id, 'reason' => $reason]);
        });
    }
}
