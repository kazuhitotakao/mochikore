<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PackingListService
{
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
