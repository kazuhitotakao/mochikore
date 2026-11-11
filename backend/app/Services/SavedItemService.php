<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\SavedItem;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class SavedItemService
{
    /**
     * API-32 よく使う項目の保存。同じカテゴリーに同じ名前があれば、増やさずにそれを返す（V-11）。
     * 新しく作ったものは wasRecentlyCreated が true になり、応答は201、既存なら200になる。
     */
    public function save(User $user, string $name, int $categoryId): SavedItem
    {
        return DB::transaction(function () use ($user, $name, $categoryId) {
            // C-05：199件の人が同時に2件送っても201件にならないよう、本人の行をロックしてから数える
            User::whereKey($user->id)->lockForUpdate()->first();

            // name は utf8mb4_bin なので、「はは」と「ぱぱ」、大文字と小文字は別の名前になる（D-66）
            $existing = $user->savedItems()->where('category_id', $categoryId)->where('name', $name)->first();
            if ($existing) {
                return $existing;
            }

            // D-72：上限で断るのは新しい候補だけ。同名の既存候補は200件でも返す
            if ($user->savedItems()->count() >= SavedItem::MAX_PER_USER) {
                throw new ApiException(ApiErrorCode::SavedItemLimitReached, '保存できるのは200件までです。');
            }

            try {
                return $user->savedItems()->create(['name' => $name, 'category_id' => $categoryId]);
            } catch (UniqueConstraintViolationException) {
                // C-05：ロックしていても一意制約に当たったときは、500にせず既存の候補を返す
                return $user->savedItems()->where('category_id', $categoryId)->where('name', $name)->firstOrFail();
            }
        });
    }
}
