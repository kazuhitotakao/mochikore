<?php

namespace App\Services;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\PersonalAccessToken;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DailyCleanupService
{
    /**
     * @return array{users: int, items: int, tokens: int}
     */
    public function run(): array
    {
        // D-44：未認証の利用者と削除済みの持ち物を、同じ日次処理で整理する。
        $now = now()->startOfSecond();

        return [
            'users' => $this->deleteUnverifiedUsers($now->copy()->subDays(User::UNVERIFIED_LIFETIME_DAYS)),
            'items' => $this->deleteTrashedItems($now->copy()->subDays(PackingListItem::TRASH_RETENTION_DAYS)),
            'tokens' => $this->deleteExpiredTokens($now),
        ];
    }

    private function deleteUnverifiedUsers(Carbon $cutoff): int
    {
        $deleted = 0;
        User::whereNull('email_verified_at')->where('created_at', '<=', $cutoff)
            ->select('id')->chunkById(100, function ($users) use ($cutoff, &$deleted) {
                foreach ($users as $user) {
                    $deleted += DB::transaction(function () use ($user, $cutoff) {
                        // D-19・D-44：先にメール認証が完了した利用者は、候補に入っていても消さない。
                        $account = User::whereKey($user->id)->lockForUpdate()->first();
                        if (! $account || $account->hasVerifiedEmail() || $account->created_at->gt($cutoff)) {
                            return 0;
                        }

                        // D-52：この2種類には外部キーがないので、本人と同じトランザクションで明示的に消す。
                        $account->tokens()->delete();
                        DB::table('password_reset_tokens')->where('email', $account->email)->delete();
                        $account->delete();

                        return 1;
                    }, 3);
                }
            });

        return $deleted;
    }

    private function deleteTrashedItems(Carbon $cutoff): int
    {
        $deleted = 0;
        PackingList::whereHas('items', fn ($items) => $items->onlyTrashed()->where('deleted_at', '<=', $cutoff))
            ->select('id')->chunkById(100, function ($lists) use ($cutoff, &$deleted) {
                foreach ($lists as $list) {
                    $deleted += DB::transaction(function () use ($list, $cutoff) {
                        // D-35・D-59：復元と同じ親ロックを取り、復元が先に終わった持ち物を消さない。
                        $locked = PackingList::whereKey($list->id)->lockForUpdate()->first();
                        if (! $locked) {
                            return 0;
                        }

                        // 画面からの削除時に構造は更新済み。保管データの掃除では親の日時・revisionを変えない。
                        return $locked->items()->onlyTrashed()->where('deleted_at', '<=', $cutoff)->forceDelete();
                    }, 3);
                }
            });

        return $deleted;
    }

    private function deleteExpiredTokens(Carbon $now): int
    {
        // D-36・D-78：削除するSQLにも期限条件を残し、直前の利用者操作で延長された情報を守る。
        // last_used_at・expires_atは使わず、初回ログイン日時は更新しない。
        return PersonalAccessToken::where('first_login_at', '<=', $now->copy()->subDays(PersonalAccessToken::MAX_LIFETIME_DAYS))
            ->orWhere('last_activity_at', '<=', $now->copy()->subDays(PersonalAccessToken::IDLE_LIFETIME_DAYS))
            ->delete();
    }
}
