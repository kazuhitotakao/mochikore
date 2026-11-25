<?php

namespace App\Services;

use App\Enums\GroupCheckMode;
use App\Models\PackingList;
use App\Models\PackingListItem;
use Illuminate\Support\Facades\DB;

/**
 * D-122：繰り返し利用のグループのチェックを、日付が変わったら（日本時間の0時）外す。
 * 定期処理は使わず、リストを読むときと、持ち物の所属・グループの設定を変える前に、その場で外す。
 * 前回の日付（last_checked_at）は残す。チェックだけなので、親リストの更新日時・grouping_revision は変えない（D-25）。
 */
class RepeatCheckService
{
    /**
     * リストを読むとき（API-07・29・30の応答）。groups と items を読み込んだリストを渡す。
     * 今日より前に付けたチェックがあるときだけ保存し、返す値もそろえる。
     */
    public function expireLoaded(PackingList $list): void
    {
        $repeatGroupIds = $list->groups
            ->filter(fn ($group) => $group->check_mode === GroupCheckMode::Repeat)
            ->modelKeys();
        if ($repeatGroupIds === []) {
            return;
        }

        $today = today();
        $expired = $list->items->filter(fn (PackingListItem $item) => $item->is_checked
            && in_array($item->group_id, $repeatGroupIds, true)
            && ($item->last_checked_at === null || $item->last_checked_at->lt($today)));
        if ($expired->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($list) {
            // 所属の変更と同じ親リストをロックしてから、条件を確かめ直して外す
            $this->expire(PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail());
        });

        foreach ($expired as $item) {
            $item->is_checked = false;
            $item->syncOriginalAttribute('is_checked');
        }
    }

    /**
     * 持ち物の所属・グループの設定を変える前。親リストをロックしたトランザクションの中で呼ぶ。
     * 期限の切れたチェックを、通常のグループやほかのリストへ持ち出さないようにする。
     * 削除した持ち物も外す（グループが消えた後に戻したとき、古いチェックを持ち出さない）。
     */
    public function expire(PackingList $locked): void
    {
        $locked->items()->withTrashed()
            ->whereIn('group_id', $locked->groups()->where('check_mode', GroupCheckMode::Repeat)->select('id'))
            ->where('is_checked', true)
            ->where(fn ($query) => $query->whereNull('last_checked_at')->orWhere('last_checked_at', '<', today()))
            ->update(['is_checked' => false]);
    }
}
