<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PackingListService
{
    public function updateVisibility(PackingList $list, bool $isPublic): PackingList
    {
        return DB::transaction(function () use ($list, $isPublic) {
            // D-50・51：最後の持ち物の削除と同時でも、0件のリストが公開されないよう同じ親をロックする
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            if ($isPublic) {
                if ($locked->moderated_at !== null) {
                    throw new ApiException(ApiErrorCode::ListModerated, 'このリストは運営により非公開になっています。');
                }

                if (! $locked->items()->exists()) {
                    throw new ApiException(ApiErrorCode::ListHasNoItems, '公開するには持ち物が1件以上必要です。');
                }
            }

            // D-24：公開範囲が変わったときだけ更新日時を変える。構造は変わらないのでrevisionは保つ
            $locked->is_public = $isPublic;
            $locked->save();

            return $locked;
        });
    }

    public function moderate(PackingList $list, bool $release): void
    {
        DB::transaction(function () use ($list, $release) {
            // D-48：本人の公開操作と同じロックで、運営による非公開を優先する
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();
            $locked->moderated_at = $release ? null : now();
            // 解除後の公開は本人が確認して切り替える（D-42・48）
            if (! $release) {
                $locked->is_public = false;
            }
            $locked->save();
        });
    }

    /**
     * API-06 リストの作成。D-16：最初は非公開（is_public の既定値 false）。
     *
     * @param  array{title: string, category_id: int, description?: string|null}  $attributes
     */
    public function create(User $user, array $attributes): PackingList
    {
        return DB::transaction(function () use ($user, $attributes) {
            // C-05：99件の人が同時に2件送っても101件にならないよう、本人の行をロックしてから数える
            User::whereKey($user->id)->lockForUpdate()->first();

            if ($user->packingLists()->count() >= PackingList::MAX_PER_USER) {
                throw new ApiException(ApiErrorCode::ListLimitReached, 'リストは100件までです。');
            }

            // is_public・grouping_revision などのDBの既定値を、応答にもそのまま返すため読み直す
            return $user->packingLists()->create($attributes)->refresh();
        });
    }
}
