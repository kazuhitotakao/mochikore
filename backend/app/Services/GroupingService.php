<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * API-30 グループ整理の保存（F-19、D-56〜D-61、06_API一覧「グループ整理のAPI仕様」）。
 * グループの作成・名前・順番・削除と、持ち物の所属（group_id）だけを1回で置き換える。
 * 持ち物の名前・全体の sort_order・チェック・削除日時は書き換えない（D-60）。
 */
class GroupingService
{
    /**
     * @param  list<array{key: string, id: int|null, name: string}>  $groups  配列の順が見出しの順
     * @param  list<array{item_id: int, group_key: string|null}>  $assignments
     * @return array<string, int> groups の key と、保存後のグループIDの対応（group_key_map）
     */
    public function save(PackingList $list, int $baseRevision, array $groups, array $assignments): array
    {
        return DB::transaction(function () use ($list, $baseRevision, $groups, $assignments) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // D-59：整理画面を開いた後にリストが変わっていたら上書きしない。応答が届かずに同じ下書きを
            // 送り直したときも、前回の保存で revision が増えているのでここで止まり、グループを重複して作らない
            if ($locked->grouping_revision !== $baseRevision) {
                throw new ApiException(ApiErrorCode::GroupingConflict, 'リストが変更されています。読み直してください。');
            }

            $currentGroups = $locked->groups()->orderBy('sort_order')->orderBy('id')->get();
            $currentItems = $locked->items()->pluck('group_id', 'id');
            $this->ensureComplete($groups, $assignments, $currentGroups->pluck('id')->all(), $currentItems->keys()->all());

            $keyToId = [];
            foreach ($groups as $group) {
                $keyToId[$group['key']] = $group['id'];
            }

            // 28-05：何も変わっていない OK では、revision も更新日時も変えない
            if ($this->isUnchanged($groups, $assignments, $currentGroups, $currentItems->all(), $keyToId)) {
                return $keyToId;
            }

            // D-61：送られなかった既存グループは削除する。中の持ち物は、削除済みも含めて
            // DB（ON DELETE SET NULL）が未分類にする
            $keptIds = array_values(array_filter(array_column($groups, 'id')));
            $locked->groups()->whereNotIn('id', $keptIds)->delete();

            $byId = $currentGroups->keyBy('id');
            foreach ($groups as $index => $group) {
                $attributes = ['name' => $group['name'], 'sort_order' => $index];
                if ($group['id'] === null) {
                    $keyToId[$group['key']] = $locked->groups()->create($attributes)->id;
                } else {
                    $byId[$group['id']]->fill($attributes)->save();
                }
            }

            // 所属が変わる持ち物だけを、移る先ごとにまとめて更新する（group_id だけを変える）
            $moves = [];
            foreach ($assignments as $assignment) {
                $target = $assignment['group_key'] === null ? null : $keyToId[$assignment['group_key']];
                if ($currentItems[$assignment['item_id']] !== $target) {
                    $moves[$target ?? 0][] = $assignment['item_id'];
                }
            }
            foreach ($moves as $target => $itemIds) {
                $locked->items()->whereKey($itemIds)->update(['group_id' => $target === 0 ? null : $target]);
            }

            // D-24・D-59：実際に変わったときだけ revision を1増やし、一覧の上に戻す（increment は updated_at も更新する）
            $locked->increment('grouping_revision');

            return $keyToId;
        });
    }

    /**
     * 06_API一覧「キーと削除の意味」「所属の完全性」：グループIDはこのリストのものだけ。
     * 所属は、このリストの削除していない持ち物すべてを1件ずつ含むこと。違えば全体を拒否する。
     *
     * @param  list<array{key: string, id: int|null, name: string}>  $groups
     * @param  list<array{item_id: int, group_key: string|null}>  $assignments
     * @param  list<int>  $currentGroupIds
     * @param  list<int>  $activeItemIds
     */
    private function ensureComplete(array $groups, array $assignments, array $currentGroupIds, array $activeItemIds): void
    {
        $errors = [];
        foreach ($groups as $index => $group) {
            if ($group['id'] !== null && ! in_array($group['id'], $currentGroupIds, true)) {
                $errors["groups.{$index}.id"] = [__('validation.grouping.reload')];
            }
        }

        $sentItemIds = array_column($assignments, 'item_id');
        sort($sentItemIds);
        sort($activeItemIds);
        if ($sentItemIds !== $activeItemIds) {
            $errors['assignments'] = [__('validation.grouping.reload')];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * @param  list<array{key: string, id: int|null, name: string}>  $groups
     * @param  list<array{item_id: int, group_key: string|null}>  $assignments
     * @param  Collection<int, PackingListGroup>  $currentGroups  表示順
     * @param  array<int, int|null>  $currentItems  持ち物ID → 今の group_id
     * @param  array<string, int|null>  $keyToId
     */
    private function isUnchanged(array $groups, array $assignments, $currentGroups, array $currentItems, array $keyToId): bool
    {
        if (count($groups) !== $currentGroups->count()) {
            return false;
        }

        foreach ($groups as $index => $group) {
            $current = $currentGroups[$index];
            if ($group['id'] !== $current->id || $group['name'] !== $current->name || $current->sort_order !== $index) {
                return false;
            }
        }

        foreach ($assignments as $assignment) {
            $target = $assignment['group_key'] === null ? null : $keyToId[$assignment['group_key']];
            if ($currentItems[$assignment['item_id']] !== $target) {
                return false;
            }
        }

        return true;
    }
}
