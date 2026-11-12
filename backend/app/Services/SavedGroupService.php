<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\SavedGroup;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class SavedGroupService
{
    /**
     * API-40 よく使うグループの保存（F-28）。同じカテゴリーに同じ名前があれば、増やさずにそれを返す（V-21）。
     * 新しく作ったものは wasRecentlyCreated が true になり、応答は201、既存なら200になる。
     */
    public function save(User $user, string $name, int $categoryId): SavedGroup
    {
        return DB::transaction(function () use ($user, $name, $categoryId) {
            // C-05：99件の人が同時に2件送っても101件にならないよう、本人の行をロックしてから数える
            User::whereKey($user->id)->lockForUpdate()->first();

            // name は utf8mb4_bin なので、「はは」と「ぱぱ」、大文字と小文字は別の名前になる（D-102）
            $existing = $user->savedGroups()->where('category_id', $categoryId)->where('name', $name)->first();
            if ($existing) {
                return $existing;
            }

            // D-102：上限で断るのは新しい候補だけ。同名の既存候補は100件でも返す
            if ($user->savedGroups()->count() >= SavedGroup::MAX_PER_USER) {
                throw new ApiException(ApiErrorCode::SavedGroupLimitReached, '保存できるのは100件までです。');
            }

            try {
                return $user->savedGroups()->create(['name' => $name, 'category_id' => $categoryId]);
            } catch (UniqueConstraintViolationException) {
                // C-05：ロックしていても一意制約に当たったときは、500にせず既存の候補を返す
                return $user->savedGroups()->where('category_id', $categoryId)->where('name', $name)->firstOrFail();
            }
        });
    }
}
