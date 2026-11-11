<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * 持ち物の追加・変更・削除。D-59：持ち物の構造を変える処理（追加・削除）は、親リストの行をロックして
 * grouping_revision を増やす。チェックと名前の変更は構造を変えないので増やさない。
 */
class PackingListItemService
{
    /**
     * API-10 持ち物の追加。未分類（group_id は NULL）で全体の末尾に入れる。
     */
    public function add(PackingList $list, string $name): PackingListItem
    {
        return DB::transaction(function () use ($list, $name) {
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            // C-05：同時に追加されても200件を超えないよう、ロックした後で数える
            if ($locked->items()->count() >= PackingList::MAX_ITEMS) {
                throw new ApiException(ApiErrorCode::ItemLimitReached, '持ち物は200件までです。');
            }

            // API-10：削除していない持ち物の最大値＋1。削除済みの番号は詰めない（D-31）
            $item = $locked->items()->create([
                'name' => $name,
                'sort_order' => (int) $locked->items()->max('sort_order') + 1,
            ]);

            // increment は updated_at も新しくするので、追加したリストは一覧の上に戻る（D-24）
            $locked->increment('grouping_revision');

            // is_checked・group_id などのDBの既定値を、応答にもそのまま返すため読み直す
            return $item->refresh();
        });
    }

    /**
     * API-11 持ち物の名前・チェックの変更。
     *
     * @param  array{name?: string, is_checked?: bool}  $attributes
     */
    public function update(PackingListItem $item, array $attributes): PackingListItem
    {
        return DB::transaction(function () use ($item, $attributes) {
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
     * API-25 削除した持ち物を戻す。D-35：同じ行を戻すので、id・名前・チェック状態は削除前のまま。
     * グループが消えていれば、DB（ON DELETE SET NULL）がすでに未分類にしている。
     */
    public function restore(PackingListItem $item): PackingListItem
    {
        return DB::transaction(function () use ($item) {
            $locked = PackingList::whereKey($item->packing_list_id)->lockForUpdate()->firstOrFail();

            // ロックした後で読み直す。この間に完全に削除されていたら404
            $target = $locked->items()->withTrashed()->whereKey($item->id)->first()
                ?? throw (new ModelNotFoundException)->setModel(PackingListItem::class);

            // 応答が届かずに送り直されたときなど、すでに戻っていれば件数も revision も増やさずに成功にする
            if (! $target->trashed()) {
                return $target;
            }

            // D-34：200件あるときは戻さない。画面は復元の候補を残す
            if ($locked->items()->count() >= PackingList::MAX_ITEMS) {
                throw new ApiException(ApiErrorCode::ItemLimitReached, '持ち物は200件までです。');
            }

            // D-31：番号が残っていれば元の位置。削除後に並べ替えて番号が空になっていれば一番下
            if ($target->sort_order === null) {
                $target->sort_order = (int) $locked->items()->max('sort_order') + 1;
            }
            $target->restore();

            // 構造が変わったので revision を増やす。updated_at も新しくなり一覧の上に戻る（D-24・D-59）。
            // 公開は自動で戻さない（D-51）
            $locked->increment('grouping_revision');

            return $target;
        });
    }
}
