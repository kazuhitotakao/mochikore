<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingListItem;
use Closure;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * D-97：持ち物を増やす操作（追加・まとめて追加・戻す）を、利用者ごとに1時間の件数で数える。
 * 削除した持ち物は7日残るので、1リストの安全上限だけでは「追加→削除」のくり返しを止められないため。
 * 公開リストのコピーは数えない（リスト100件と安全上限で止める）。
 */
class ItemAdditionLimiter
{
    private const DECAY_SECONDS = 3600;

    /**
     * 先に件数を数えてから処理し、何も保存しなかったときは数えた分を戻す。
     * 先に数えるのは、同時に送られても合わせて上限を超えないようにするため。
     *
     * @template TResult
     *
     * @param  Closure(): TResult  $callback
     * @return TResult
     */
    public function attempt(int $userId, int $count, Closure $callback): mixed
    {
        $key = 'item-additions:'.$userId;

        if (RateLimiter::increment($key, self::DECAY_SECONDS, $count) > PackingListItem::MAX_ADDED_PER_HOUR) {
            RateLimiter::decrement($key, self::DECAY_SECONDS, $count);

            // まとめて追加は途中まで追加せず、全体を断る。画面は retry_after で「あと○分」を出す
            throw new ApiException(
                ApiErrorCode::TooManyRequests,
                '短い時間に追加できる数を超えました。しばらくしてから再度お試しください。',
                max(1, RateLimiter::availableIn($key)),
            );
        }

        try {
            return $callback();
        } catch (Throwable $e) {
            // 入力エラー・競合・安全上限などで保存しなかった分は、回数に数えない
            RateLimiter::decrement($key, self::DECAY_SECONDS, $count);

            throw $e;
        }
    }
}
