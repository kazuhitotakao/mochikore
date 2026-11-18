<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use Illuminate\Database\Eloquent\ModelNotFoundException;
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

            // 28-05：何も変わっていない保存では、revision も更新日時も変えない
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
                if ($target !== 0) {
                    // D-106：空グループに持ち物が入ったら、保存していた印を外す。
                    $locked->groups()->whereKey($target)->update(['is_checked' => false]);
                }
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

    /**
     * API-36 グループの順番を保存する（F-24、D-98）。SC-07 で見出しを動かしたとき、
     * 送られた順に sort_order を0から振り直す。持ち物の所属・順番・チェックは変えない。
     *
     * @param  list<int>  $groupIds  同じリストの全グループのID（新しい順）
     */
    public function reorderGroups(PackingList $list, array $groupIds): void
    {
        DB::transaction(function () use ($list, $groupIds) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // V-18：ロックした後で、同じリストの全グループを1回ずつ含むか確かめる。違えば何も変えない
            $currentIds = $locked->groups()->pluck('id')->sort()->values()->all();
            $sentIds = collect($groupIds)->sort()->values()->all();
            if ($sentIds !== $currentIds) {
                throw ValidationException::withMessages([
                    'group_ids' => [__('validation.custom.group_ids.list')],
                ]);
            }

            // グループは1リスト20件までなので、1件ずつ更新する
            foreach ($groupIds as $index => $groupId) {
                $locked->groups()->whereKey($groupId)->update(['sort_order' => $index]);
            }

            // D-24・D-59：構造が変わったので revision を増やし、更新日時も新しくする
            $locked->increment('grouping_revision');
        });
    }

    /**
     * API-44 グループ名だけを変える（D-109）。持ち物・順番・チェックは変えない。
     */
    public function rename(PackingListGroup $group, string $name): PackingListGroup
    {
        return DB::transaction(function () use ($group, $name) {
            // 整理（API-30）・並べ替えと同じ親リストをロックし、その後で同名を確かめる
            $locked = PackingList::whereKey($group->packing_list_id)->lockForUpdate()->firstOrFail();
            $target = $locked->groups()->whereKey($group->id)->firstOrFail();

            // 同じ名前のままなら、revision も更新日時も変えない（28-05 の変化なしの保存と同じ）
            if ($target->name === $name) {
                return $target;
            }

            // D-57：同じリストのほかのグループと同名は不可。照合順序に頼らず、PHP で完全一致を比べる
            $taken = $locked->groups()->whereKeyNot($target->id)->pluck('name')
                ->contains(fn (string $other) => $other === $name);
            if ($taken) {
                throw ValidationException::withMessages([
                    'name' => [__('validation.group_name.duplicate')],
                ]);
            }

            $target->update(['name' => $name]);
            // D-59・D-109：グループの変更なので revision を増やし、開いたままの SC-09 が古い名前で上書きしないようにする。
            // D-24：一覧の上に戻す（increment は updated_at も更新する）
            $locked->increment('grouping_revision');

            return $target;
        });
    }

    /**
     * API-45 持ち物を重ねてグループにする（D-111）。重ねられた未分類の持ち物の名前でグループを作って名前付きグループの最後に置き、
     * 重ねた持ち物をその中へ移す。重ねられた持ち物は見出しに変わるので一時削除し（D-35）、戻す候補にはしない。
     *
     * @return array{group: PackingListGroup, item: PackingListItem}
     */
    public function createFromItem(PackingListItem $base, int $itemId): array
    {
        return DB::transaction(function () use ($base, $itemId) {
            $locked = PackingList::whereKey($base->packing_list_id)->lockForUpdate()->firstOrFail();

            // 同時に削除・グループにされていたら存在しない持ち物と同じ404にし、グループを二重に作らない
            $target = $locked->items()->whereKey($base->id)->first()
                ?? throw (new ModelNotFoundException)->setModel(PackingListItem::class);

            // V-24：重ねた持ち物は、同じリストの削除していない別の持ち物だけ
            $moved = $itemId === $target->id ? null : $locked->items()->whereKey($itemId)->first();
            if ($moved === null) {
                throw ValidationException::withMessages([
                    'item_id' => [__('validation.group_from_item.item')],
                ]);
            }

            // D-111：グループの中にグループは作れないので、重ねられるのは未分類の持ち物だけ。
            // 画面は未分類の持ち物にだけ重ねさせるので、ここに来るのは別の端末で移した後。読み直しを案内する
            if ($target->group_id !== null) {
                throw ValidationException::withMessages([
                    '_form' => [__('validation.grouping.reload')],
                ]);
            }

            // D-57：持ち物名とグループ名は同じ1〜50文字・改行なしなので、予約名・同名・件数だけを確かめる。
            // 同名は照合順序に頼らず、PHP で完全一致を比べる（API-44 と同じ）
            $names = $locked->groups()->pluck('name');
            if ($target->name === PackingListGroup::RESERVED_NAME) {
                throw ValidationException::withMessages([
                    'name' => [__('validation.group_name.not_in')],
                ]);
            }
            if ($names->contains(fn (string $name) => $name === $target->name)) {
                throw ValidationException::withMessages([
                    'name' => [__('validation.group_name.duplicate')],
                ]);
            }
            if ($names->count() >= PackingListGroup::MAX_PER_LIST) {
                throw ValidationException::withMessages([
                    '_form' => [__('validation.group_from_item.limit')],
                ]);
            }

            // 未分類のすぐ上（名前付きグループの最後）に置く。sort_order は0から（API-30・36 と同じ）
            $group = $locked->groups()->create([
                'name' => $target->name,
                'sort_order' => (int) ($locked->groups()->max('sort_order') ?? -1) + 1,
            ]);

            // group_id は Fillable に入れていないので、クエリで直接変える。全体の順番とチェックは変えない（D-60）
            $locked->items()->whereKey($moved->id)->update(['group_id' => $group->id]);
            $target->delete();

            // D-24・D-59：構造の変更なので revision を増やし、一覧の上に戻す（increment は updated_at も更新する）
            $locked->increment('grouping_revision');

            return ['group' => $group->refresh(), 'item' => $moved->refresh()];
        });
    }
}
