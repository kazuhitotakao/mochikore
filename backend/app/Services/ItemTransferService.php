<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * 選んだ持ち物を、自分の別のリストへコピー・移動する（F-32）。公開リスト・限定公開のリストから自分のリストへ取り込む（F-33）。
 * 移し先では元の並び順のまま末尾に入れ、指定したグループ（なければ未分類）にまとめる。グループそのものは写さない（D-118）。
 */
class ItemTransferService
{
    private const COPY = 'copy';

    private const MOVE = 'move';

    private const IMPORT = 'import';

    public function __construct(
        private ItemAdditionLimiter $additionLimiter,
        private RepeatCheckService $repeatChecks,
    ) {}

    /**
     * API-51 コピー。元の持ち物は残し、移し先には未チェックで入れる。
     *
     * @param  list<int>  $itemIds
     * @return array{list: PackingList, count: int, is_public: bool}
     */
    public function copy(User $user, PackingList $source, array $itemIds, ?int $destinationListId, ?string $newListTitle, ?int $groupId): array
    {
        // D-97・D-118：持ち物が増えるので、まとめて追加と同じく件数で1時間の回数に数える
        return $this->additionLimiter->attempt(
            $user->id,
            count($itemIds),
            fn () => $this->transfer($user, $source, $itemIds, $destinationListId, $newListTitle, $groupId, self::COPY, $this->ensureNotModerated(...)),
        );
    }

    /**
     * API-52 移動。同じ持ち物（同じID）を移し先へ移し、チェックは保つ。全体の数は増えないので回数には数えない（D-97）。
     *
     * @param  list<int>  $itemIds
     * @return array{list: PackingList, count: int, is_public: bool}
     */
    public function move(User $user, PackingList $source, array $itemIds, ?int $destinationListId, ?string $newListTitle, ?int $groupId): array
    {
        return $this->transfer($user, $source, $itemIds, $destinationListId, $newListTitle, $groupId, self::MOVE, $this->ensureNotModerated(...));
    }

    /**
     * API-53 公開リストから取り込む。写し方はコピーと同じで、元のリストは変えない（D-118）。
     *
     * @param  list<int>  $itemIds
     * @return array{list: PackingList, count: int, is_public: bool}
     */
    public function importFromPublic(User $user, PackingList $source, array $itemIds, ?int $destinationListId, ?string $newListTitle, ?int $groupId): array
    {
        return $this->additionLimiter->attempt(
            $user->id,
            count($itemIds),
            // D-43・D-48：ロックした後も公開中で、運営が非公開にしていないリストだけ。そうでなければ存在を知らせない404
            fn () => $this->transfer($user, $source, $itemIds, $destinationListId, $newListTitle, $groupId, self::IMPORT,
                fn (PackingList $from) => abort_unless($from->is_public && $from->moderated_at === null, 404)),
        );
    }

    /**
     * API-54 限定公開のリンクのリストから取り込む（D-114・D-118）。
     *
     * @param  list<int>  $itemIds
     * @return array{list: PackingList, count: int, is_public: bool}
     */
    public function importFromShared(User $user, string $token, array $itemIds, ?int $destinationListId, ?string $newListTitle, ?int $groupId): array
    {
        // 止めたリンクで回数を数えないよう、先にリストを見つける。ロックした後にもう一度確かめる
        $source = PackingList::where('share_token', $token)->whereNull('moderated_at')->first() ?? abort(404);

        return $this->additionLimiter->attempt(
            $user->id,
            count($itemIds),
            fn () => $this->transfer($user, $source, $itemIds, $destinationListId, $newListTitle, $groupId, self::IMPORT,
                fn (PackingList $from) => abort_unless($from->share_token === $token && $from->moderated_at === null, 404)),
        );
    }

    /**
     * D-116・D-118：複製と同じく、運営が非公開にしたリストの持ち物は写させない（非公開をすり抜けないため）。
     */
    private function ensureNotModerated(PackingList $from): void
    {
        if ($from->moderated_at !== null) {
            throw new ApiException(ApiErrorCode::ListModerated, 'このリストは運営により非公開になっています。');
        }
    }

    /**
     * @param  list<int>  $itemIds
     * @param  Closure(PackingList): void  $ensureSource  ロックした元のリストを、操作ごとの条件で確かめる
     * @return array{list: PackingList, count: int, is_public: bool}
     */
    private function transfer(User $user, PackingList $source, array $itemIds, ?int $destinationListId, ?string $newListTitle, ?int $groupId, string $mode, Closure $ensureSource): array
    {
        return DB::transaction(function () use ($user, $source, $itemIds, $destinationListId, $newListTitle, $groupId, $mode, $ensureSource) {
            if ($destinationListId === null) {
                // C-05・D-50：新しいリストを作るので、作成・複製と同じく本人を先にロックして100件に収める
                User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            }
            // 2つのリストはIDの順にロックし、逆向きのコピー・移動が同時に来ても互いに待ち続けないようにする
            $locked = PackingList::whereKey(array_filter([$source->id, $destinationListId]))
                ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $from = $locked->get($source->id) ?? abort(404);
            $ensureSource($from);
            if ($mode === self::MOVE) {
                // D-122：移動はチェックを保つので、繰り返し利用のグループの期限の切れたチェックを先に外す
                $this->repeatChecks->expire($from);
            }

            $to = null;
            if ($destinationListId !== null) {
                $to = $locked->get($destinationListId);
                // V-26・D-119：移し先は、元とは別の、自分が所有するか共同編集のメンバーであるリストだけ。
                // 他人のリストかどうかは知らせない
                if ($to === null || ! $to->isAccessibleBy($user) || $to->id === $from->id) {
                    $key = $mode === self::IMPORT ? 'validation.import_items.destination' : 'validation.transfer_items.destination';
                    throw ValidationException::withMessages(['destination_list_id' => [__($key)]]);
                }
            }

            // V-26：ロックした後で、元のリストの削除していない持ち物か確かめる。1件でも違えば全体を拒否する
            $items = $from->items()->whereKey($itemIds)->orderBy('sort_order')->orderBy('id')->get();
            if ($items->count() !== count($itemIds)) {
                throw ValidationException::withMessages([
                    'item_ids' => [__('validation.transfer_items.items')],
                ]);
            }
            if ($to !== null && $groupId !== null && ! $to->groups()->whereKey($groupId)->exists()) {
                throw ValidationException::withMessages([
                    'destination_group_id' => [__('validation.transfer_items.group')],
                ]);
            }

            if ($to === null) {
                if ($user->packingLists()->count() >= PackingList::MAX_PER_USER) {
                    throw new ApiException(ApiErrorCode::ListLimitReached, 'リストは100件までです。');
                }
                // D-118：カテゴリーは元のリストと同じ。非公開で作る（D-16）。後から SC-06 で変えられる。
                // 取り込みでもコピー元（source_list_id）は記録せず、よくコピーされている順（D-117）に数えない
                $to = $user->packingLists()->create([
                    'title' => $newListTitle,
                    'category_id' => $from->category_id,
                ]);
            }

            // D-97：移し先も安全上限を超えないようにする
            if ($to->items()->count() + $items->count() > PackingListItem::MAX_PER_LIST) {
                throw new ApiException(ApiErrorCode::ItemLimitReached, '1つのリストに入れられる持ち物は2,000件までです。');
            }

            // 元の並び順のまま、移し先の末尾（削除していない持ち物の最大値＋1から）に入れる
            $next = (int) $to->items()->max('sort_order') + 1;
            if ($mode === self::MOVE) {
                // 同じ行の所属を変える。IDは検証済みの整数なので、そのまま式に入れる
                $cases = $items->values()
                    ->map(fn (PackingListItem $item, int $index) => 'WHEN '.$item->id.' THEN '.($next + $index))
                    ->implode(' ');
                PackingListItem::whereKey($items->modelKeys())->update([
                    'packing_list_id' => $to->id,
                    'group_id' => $groupId,
                    'sort_order' => DB::raw("CASE id {$cases} END"),
                ]);
            } else {
                // コピー・取り込みは新しい持ち物として、未チェックで入れる（元のチェックは写さない）
                $now = now();
                PackingListItem::insert($items->values()->map(fn (PackingListItem $item, int $index) => [
                    'packing_list_id' => $to->id,
                    'group_id' => $groupId,
                    'name' => $item->name,
                    'sort_order' => $next + $index,
                    'is_checked' => false,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            }

            if ($groupId !== null) {
                // D-106：空だったグループに持ち物が入ったら、空のときのチェックの記録を外す
                $to->groups()->whereKey($groupId)->update(['is_checked' => false]);
            }
            // D-24・D-59：持ち物が増えたので revision を増やし、一覧の上に戻す（increment は updated_at も変える）
            $to->increment('grouping_revision');

            if ($mode === self::MOVE) {
                // D-51：公開中のリストから全部移して0件になったら、自動で非公開にする
                $changes = ['grouping_revision' => $from->grouping_revision + 1];
                if ($from->is_public && ! $from->items()->exists()) {
                    $changes['is_public'] = false;
                }
                $from->forceFill($changes)->save();
            }

            return ['list' => $to, 'count' => $items->count(), 'is_public' => $from->is_public];
        });
    }
}
