<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * 持ち物の追加・変更・削除・復元・並べ替え・一括追加。D-59：持ち物の構造を変える処理（追加・削除・復元・並べ替え・一括追加）は、親リストの行をロックして
 * grouping_revision を増やす。チェックと名前の変更は構造を変えないので増やさない。
 */
class PackingListItemService
{
    public function __construct(private ItemAdditionLimiter $additionLimiter) {}

    /**
     * API-10 持ち物の追加。未分類（group_id は NULL）で全体の末尾に入れる。
     */
    public function add(User $user, PackingList $list, string $name): PackingListItem
    {
        // D-97・D-119：持ち物を増やすので、足した本人（所有者か共同編集のメンバー）の1時間の件数に数える
        return $this->additionLimiter->attempt($user->id, 1, fn () => DB::transaction(function () use ($list, $name) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();
            $this->ensureRoom($locked, 1);

            // API-10：削除していない持ち物の最大値＋1。削除済みの番号は詰めない（D-31）
            $item = $locked->items()->create([
                'name' => $name,
                'sort_order' => (int) $locked->items()->max('sort_order') + 1,
            ]);

            // increment は updated_at も新しくするので、追加したリストは一覧の上に戻る（D-24）
            $locked->increment('grouping_revision');

            // is_checked・group_id などのDBの既定値を、応答にもそのまま返すため読み直す
            return $item->refresh();
        }));
    }

    /**
     * API-11 持ち物の名前・チェックの変更。
     *
     * @param  array{name?: string, is_checked?: bool}  $attributes
     */
    public function update(User $user, PackingListItem $item, array $attributes): PackingListItem
    {
        return DB::transaction(function () use ($user, $item, $attributes) {
            if (array_key_exists('is_checked', $attributes)) {
                $this->recordCheck($user, $item, $attributes['is_checked']);
            }
            $item->fill($attributes);
            $renamed = $item->isDirty('name');
            $item->save();

            // D-24・D-25：名前を変えたリストは一覧の上に戻す。チェックだけでは親の日時を変えない
            if ($renamed) {
                $item->packingList->touch();
            }

            return $item;
        });
    }

    /**
     * D-122：チェックを付けた日時を覚える（繰り返し利用のグループで「前回」として出す）。
     * 外しても日時は残す（チェックはこれからの予定、日時は過去の記録として分けて持つ）。
     * ただし付けてから1分以内に外したら、押し間違いとして付ける前の日時へ戻す。
     * 経過はサーバーの時刻で数え、共同編集でほかのメンバーが外したときも同じにする。
     * D-130：付けた人も覚え、外したら消す（チェック中だけ、共同編集のメンバーに表示名を出す）。
     */
    private function recordCheck(User $user, PackingListItem $item, bool $checked): void
    {
        // 同じ状態の送り直しでは、日時を進めない
        if ($checked === $item->is_checked) {
            return;
        }

        $item->checked_by = $checked ? $user->id : null;

        if ($checked) {
            $item->previous_checked_at = $item->last_checked_at;
            $item->last_checked_at = now();
        } elseif ($item->last_checked_at?->gte(now()->subSeconds(PackingListItem::CHECK_CORRECTION_SECONDS))) {
            $item->last_checked_at = $item->previous_checked_at;
            $item->previous_checked_at = null;
        }
    }

    /**
     * API-12 持ち物の削除。D-35：同じ内容画面の間は同じidのまま戻せるよう一時削除にする。
     * ほかの持ち物の番号は詰めない（D-31）。
     *
     * @return bool 削除した後の親リストの is_public
     */
    public function delete(PackingListItem $item): bool
    {
        return DB::transaction(function () use ($item) {
            $locked = PackingList::whereKey($item->packing_list_id)->lockForUpdate()->firstOrFail();

            // 同じ持ち物の削除が同時に届いても、2回目は削除済みとして404にし、revision を二重に増やさない
            $target = $locked->items()->whereKey($item->id)->first()
                ?? throw (new ModelNotFoundException)->setModel(PackingListItem::class);
            $target->delete();

            // D-51：公開中のリストで最後の持ち物を削除したら、自動で非公開にする
            $changes = ['grouping_revision' => $locked->grouping_revision + 1];
            if ($locked->is_public && ! $locked->items()->exists()) {
                $changes['is_public'] = false;
            }
            // updated_at も新しくなり、削除したリストは一覧の上に戻る（D-24）
            $locked->forceFill($changes)->save();

            return $locked->is_public;
        });
    }

    /**
     * API-38 選んだ持ち物とグループをまとめて削除する（F-26、D-100）。確認してから消すので、画面は戻す候補にしない。
     * 持ち物は1件ずつの削除と同じく一時削除（deleted_at）にし、定期処理で完全に消す（D-35）。
     * 選んだグループに画面で見えていなかった持ち物（別の端末で足したもの）は消さず、DB の SET NULL で未分類へ移る。
     *
     * @param  list<int>  $itemIds
     * @param  list<int>  $groupIds
     * @return bool 削除した後の親リストの is_public
     */
    public function bulkDelete(PackingList $list, array $itemIds, array $groupIds): bool
    {
        return DB::transaction(function () use ($list, $itemIds, $groupIds) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // V-20：ロックした後で、同じリストの削除していない持ち物と、同じリストのグループか確かめる。
            // 1件でも違えば、何も消さずに全体を拒否する
            $validItems = $locked->items()->whereKey($itemIds)->count() === count($itemIds);
            $validGroups = $locked->groups()->whereKey($groupIds)->count() === count($groupIds);
            if (! $validItems || ! $validGroups) {
                throw ValidationException::withMessages([
                    'item_ids' => [__('validation.bulk_delete.items')],
                ]);
            }

            if ($itemIds !== []) {
                // SoftDeletes の範囲で delete すると、deleted_at を入れる一時削除になる
                $locked->items()->whereKey($itemIds)->delete();
            }
            if ($groupIds !== []) {
                $locked->groups()->whereKey($groupIds)->delete();
            }

            // D-51：公開中のリストで持ち物が0件になったら、自動で非公開にする
            $changes = ['grouping_revision' => $locked->grouping_revision + 1];
            if ($locked->is_public && ! $locked->items()->exists()) {
                $changes['is_public'] = false;
            }
            // updated_at も新しくなり、削除したリストは一覧の上に戻る（D-24・D-59）
            $locked->forceFill($changes)->save();

            return $locked->is_public;
        });
    }

    /**
     * API-25 削除した持ち物を戻す。D-35：同じ行を戻すので、id・名前・チェック状態は削除前のまま。
     * グループが消えていれば、DB（ON DELETE SET NULL）がすでに未分類にしている。
     */
    public function restore(User $user, PackingListItem $item): PackingListItem
    {
        $restore = fn () => DB::transaction(function () use ($item) {
            $locked = PackingList::whereKey($item->packing_list_id)->lockForUpdate()->firstOrFail();

            // ロックした後で読み直す。この間に完全に削除されていたら404
            $target = $locked->items()->withTrashed()->whereKey($item->id)->first()
                ?? throw (new ModelNotFoundException)->setModel(PackingListItem::class);

            // 応答が届かずに送り直されたときなど、すでに戻っていれば件数も revision も増やさずに成功にする
            if (! $target->trashed()) {
                return $target;
            }
            $this->ensureRoom($locked, 1);

            // D-31：番号が残っていれば元の位置。削除後に並べ替えて番号が空になっていれば一番下
            if ($target->sort_order === null) {
                $target->sort_order = (int) $locked->items()->max('sort_order') + 1;
            }
            $target->restore();
            if ($target->group_id !== null) {
                // D-106：持ち物が戻った後に、空だったときのチェックを復活させない。
                $locked->groups()->whereKey($target->group_id)->update(['is_checked' => false]);
            }

            // 構造が変わったので revision を増やす。updated_at も新しくなり一覧の上に戻る（D-24・D-59）。
            // 公開は自動で戻さない（D-51）
            $locked->increment('grouping_revision');

            return $target;
        });

        // D-97・D-119：戻すと持ち物が1件増えるので、戻した本人の件数に数える。すでに戻っている（送り直し）ときは増えないので数えない
        return $item->trashed()
            ? $this->additionLimiter->attempt($user->id, 1, $restore)
            : $restore();
    }

    /**
     * API-19 並べ替えた順番を保存する。全体の sort_order を配列の順に振り直す。
     * チェックは変えない。所属は、別のグループ・未分類へ動かした1件（move）だけ変える（D-98）。
     *
     * @param  list<int>  $itemIds  同じリストの削除していない持ち物すべてのID（新しい順）
     * @param  array{item_id: int, group_id: int|null}|null  $move
     */
    public function reorder(PackingList $list, array $itemIds, ?array $move = null): void
    {
        DB::transaction(function () use ($list, $itemIds, $move) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // V-10：ロックした後で、削除していない持ち物すべてを1回ずつ含むか確かめる。
            // 不足・他リスト・存在しない・削除済みのIDがあれば、何も変えずに全体を拒否する
            $activeIds = $locked->items()->pluck('id')->sort()->values()->all();
            $sentIds = collect($itemIds)->sort()->values()->all();
            if ($sentIds !== $activeIds) {
                throw ValidationException::withMessages([
                    'item_ids' => [__('validation.custom.item_ids.list')],
                ]);
            }

            // V-17：動かした持ち物は並べ替える持ち物の中にあり、移動先は同じリストのグループ（または未分類）だけ
            if ($move !== null) {
                $validTarget = $move['group_id'] === null
                    || $locked->groups()->whereKey($move['group_id'])->exists();
                if (! in_array($move['item_id'], $itemIds, true) || ! $validTarget) {
                    throw ValidationException::withMessages([
                        'move' => [__('validation.custom.move.list')],
                    ]);
                }
                // group_id は Fillable に入れていないので、クエリで直接変える
                $locked->items()->whereKey($move['item_id'])->update(['group_id' => $move['group_id']]);
                if ($move['group_id'] !== null) {
                    // D-106：グループに入ったら、中の持ち物からチェックを決める。
                    $locked->groups()->whereKey($move['group_id'])->update(['is_checked' => false]);
                }
            }

            if ($itemIds !== []) {
                // 1件ずつ更新せず、1回でまとめて更新する。IDは検証済みの整数なので、そのまま式に入れる
                $cases = collect($itemIds)
                    ->map(fn (int $id, int $index) => 'WHEN '.$id.' THEN '.($index + 1))
                    ->implode(' ');
                $locked->items()->whereKey($itemIds)->update([
                    'sort_order' => DB::raw("CASE id {$cases} END"),
                ]);
            }

            // D-31：削除した後に並べ替えたら、削除済みの番号を空にして、戻すときは一番下に入れる
            $locked->items()->onlyTrashed()->update(['sort_order' => null]);

            // D-24・D-59：並べ替えたリストは一覧の上に戻り、revision も増える
            $locked->increment('grouping_revision');
        });
    }

    /**
     * API-37 選んだ持ち物をまとめてチェック・解除する（F-25、D-99）。SC-07 はグループの見出しのチェックで、
     * そのグループの全有効持ち物を送る。チェックだけなので構造は変えず、revision も親リストの更新日時も変えない（D-25）。
     * 画面が前回の日付を出せるよう、変えた後の持ち物を返す（D-122）。
     *
     * @param  list<int>  $itemIds
     * @return Collection<int, PackingListItem>
     */
    public function setChecks(User $user, PackingList $list, array $itemIds, bool $checked): Collection
    {
        return DB::transaction(function () use ($user, $list, $itemIds, $checked) {
            // V-19：同じリストの削除していない持ち物だけ。1件でも違えば、何も変えずに全体を拒否する
            if ($list->items()->whereKey($itemIds)->count() !== count($itemIds)) {
                throw ValidationException::withMessages([
                    'item_ids' => [__('validation.bulk_check.items')],
                ]);
            }

            if ($checked) {
                // D-122：日時を進めるのは、状態が変わる持ち物だけ（1件ずつのチェック recordCheck と同じ決まり）。
                // MySQL は左から順に代入するので、今の日時を1つ前へ写してから、新しい日時を入れる
                $list->items()->whereKey($itemIds)->where('is_checked', false)->update([
                    'previous_checked_at' => DB::raw('last_checked_at'),
                    'last_checked_at' => now(),
                    'is_checked' => true,
                    // D-130：今回付けた持ち物だけ、付けた人にする（付いていた持ち物は前の人のまま）
                    'checked_by' => $user->id,
                ]);
            } else {
                // D-122：グループ単位でまとめて外すときは、付けてからの時間に関係なく日時を残す
                // （1分以内の押し間違いとして戻すのは、1件ずつ外したときだけ）
                $list->items()->whereKey($itemIds)->update(['is_checked' => false, 'checked_by' => null]);
            }

            return $list->items()->whereKey($itemIds)->orderBy('sort_order')->orderBy('id')->get();
        });
    }

    /**
     * API-34 よく使う項目から一括追加（F-22、D-68）。選んだ順に、新しい持ち物として未チェック・未分類で末尾へ入れる。
     * 保存元の候補は変えない（名前を複製する、D-66）。全件を確かめてから入れ、途中だけ追加しない。
     *
     * @param  list<int>  $savedItemIds
     * @return array{grouping_revision: int, items: Collection<int, PackingListItem>}
     */
    public function addFromSavedItems(PackingList $list, User $user, array $savedItemIds, int $baseRevision): array
    {
        // D-97：選んだ件数を、本人の1時間の件数に数える。超えるときは1件も追加しない
        return $this->additionLimiter->attempt($user->id, count($savedItemIds), fn () => DB::transaction(function () use ($list, $user, $savedItemIds, $baseRevision) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // V-13：パネルを開いた後にリストが変わっていたら上書きしない。応答が届かずに同じ値で送り直されたときも、
            // 前回の追加で revision が増えているので、ここで止まって二重に追加しない
            if ($locked->grouping_revision !== $baseRevision) {
                throw new ApiException(ApiErrorCode::GroupingConflict, 'リストが変更されています。読み直してください。');
            }

            // V-12：本人の、今ある候補だけ。他人の候補・削除済み・存在しない候補が1つでもあれば全体を拒否する
            $savedItems = $user->savedItems()->whereKey($savedItemIds)->get()->keyBy('id');
            if ($savedItems->count() !== count($savedItemIds)) {
                throw ValidationException::withMessages([
                    'saved_item_ids' => [__('validation.custom.saved_item_ids.list')],
                ]);
            }
            $this->ensureRoom($locked, count($savedItemIds));

            $nextSortOrder = (int) $locked->items()->max('sort_order') + 1;
            $createdIds = [];
            foreach ($savedItemIds as $index => $savedItemId) {
                $createdIds[] = $locked->items()->create([
                    'name' => $savedItems[$savedItemId]->name,
                    'sort_order' => $nextSortOrder + $index,
                ])->id;
            }

            // increment は updated_at も新しくするので、追加したリストは一覧の上に戻る（D-24）
            $locked->increment('grouping_revision');

            return [
                'grouping_revision' => $locked->grouping_revision,
                // is_checked・group_id などのDBの既定値も返すため、選んだ順（sort_order）でまとめて読み直す
                'items' => PackingListItem::whereKey($createdIds)->orderBy('sort_order')->get(),
            ];
        }));
    }

    /**
     * D-97：追加した後の削除していない持ち物が安全上限を超えるなら、何も保存せずに断る。
     * 親リストをロックした後で数えるので、同時に送られても上限を超えない（C-05）。
     */
    private function ensureRoom(PackingList $locked, int $adding): void
    {
        if ($locked->items()->count() + $adding > PackingListItem::MAX_PER_LIST) {
            throw new ApiException(ApiErrorCode::ItemLimitReached, '1つのリストに入れられる持ち物は2,000件までです。');
        }
    }
}
