<?php

namespace App\Services;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GroupCheckService
{
    public function setCheck(PackingListGroup $group, bool $checked): void
    {
        DB::transaction(function () use ($group, $checked) {
            // D-106：所属変更・復元と同じ親をロックし、0件かを確かめ直す。
            $list = PackingList::whereKey($group->packing_list_id)->lockForUpdate()->firstOrFail();
            $target = $list->groups()->whereKey($group->id)->firstOrFail();
            if ($list->items()->where('group_id', $target->id)->exists()) {
                throw ValidationException::withMessages([
                    'is_checked' => [__('validation.empty_group.has_items')],
                ]);
            }

            // D-25：チェックだけでは親の日時・revisionを変えない。
            $target->update(['is_checked' => $checked]);
        });
    }

    public function resetChecks(PackingList $list): void
    {
        DB::transaction(function () use ($list) {
            // D-106：持ち物と空グループを別々のタイミングで解除しない。
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();
            $locked->items()->where('is_checked', true)->update(['is_checked' => false]);
            $locked->groups()->where('is_checked', true)->update(['is_checked' => false]);
        });
    }
}
