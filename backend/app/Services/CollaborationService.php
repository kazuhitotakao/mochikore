<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\PackingList;
use App\Models\PackingListMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * 共同編集の招待リンクとメンバー（F-34、D-119）。
 * 招待・参加は、本人 → リストの順にロックし、人数の上限と公開との両立しない条件を同時の操作でも守る。
 */
class CollaborationService
{
    public function __construct(private CombinedViewService $combinedViews) {}

    /**
     * API-56 招待リンクを作る。有効なリンクがあれば同じものを返し、期限も延ばさない。
     * 止めた後・期限切れの後は、別のリンクを新しく作る。
     */
    public function createInviteLink(User $owner, PackingList $list, ?string $displayName): PackingList
    {
        return DB::transaction(function () use ($owner, $list, $displayName) {
            $account = User::whereKey($owner->id)->lockForUpdate()->firstOrFail();
            $locked = PackingList::whereKey($list->id)->lockForUpdate()->firstOrFail();

            if ($locked->moderated_at !== null) {
                throw new ApiException(ApiErrorCode::ListModerated, 'このリストは運営により非公開になっています。');
            }
            // D-119：共同編集は非公開のリストだけ。公開・リンクで共有と同時に使わせない
            if ($locked->is_public || $locked->share_token !== null) {
                throw new ApiException(ApiErrorCode::ListNotPrivate, '公開中・リンクで共有中のリストは、共同編集にできません。');
            }
            $this->saveDisplayName($account, $displayName);

            if (! $locked->hasValidInvite()) {
                $locked->invite_token = Str::random(PackingList::INVITE_TOKEN_LENGTH);
                $locked->invite_expires_at = now()->addDays(PackingList::INVITE_LIFETIME_DAYS);
                // 招待はリストの内容ではないので、自分のリスト一覧の順番（updated_at、D-24）を変えない
                $locked->timestamps = false;
                $locked->save();
            }

            return $locked;
        });
    }

    /**
     * API-57 招待リンクを止める。リンクがなくても成功にする。参加済みのメンバーは残る。
     */
    public function stopInviteLink(PackingList $list): void
    {
        $list->invite_token = null;
        $list->invite_expires_at = null;
        // 作るときと同じく、自分のリスト一覧の順番を変えない
        $list->timestamps = false;
        $list->save();
    }

    /**
     * API-61 招待リンクのリストを探す。止めた・期限切れ・形の違うリンクは null（画面は404）。
     */
    public function findByInvite(string $token): ?PackingList
    {
        $list = PackingList::where('invite_token', $token)->first();

        return $list?->hasValidInvite() ? $list : null;
    }

    /**
     * API-62 招待リンクから参加する。所有者・参加済みの人は、何も変えずに成功にする（送り直しても同じ）。
     */
    public function join(User $user, string $token, ?string $displayName): PackingList
    {
        return DB::transaction(function () use ($user, $token, $displayName) {
            $account = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            // 止める操作・ほかの人の参加と同時でも、止めたリンクでの参加や10人を超える参加をさせない
            $list = PackingList::where('invite_token', $token)->lockForUpdate()->first();
            if ($list === null || ! $list->hasValidInvite()) {
                abort(404);
            }

            if ($list->isAccessibleBy($account)) {
                return $list;
            }
            $this->saveDisplayName($account, $displayName);

            // 所有者を入れて10人まで。メンバーの表には所有者がいないので1を足して数える
            if ($list->members()->count() + 1 >= PackingList::MAX_PEOPLE) {
                throw new ApiException(ApiErrorCode::MemberLimitReached, 'このリストのメンバーは10人までです。');
            }
            if ($account->memberships()->count() >= User::MAX_JOINED_LISTS) {
                throw new ApiException(ApiErrorCode::JoinedListLimitReached, '参加できるリストは100件までです。');
            }

            $list->members()->create(['user_id' => $account->id]);

            return $list;
        });
    }

    /**
     * API-59 所有者がメンバーを外す・API-60 メンバーが自分で抜ける。
     * 足した持ち物は残り、リストの更新日時も変えない。
     * D-124：見られなくなったリストを、その人のまとめ表示からも同じトランザクションで外す。
     */
    public function remove(PackingListMember $member): void
    {
        DB::transaction(function () use ($member) {
            $member->delete();
            $this->combinedViews->forgetList($member->user_id, $member->packing_list_id);
        });
    }

    /**
     * V-27：表示名は、初めて招待する・参加するときに入れる。送られたら保存し、
     * まだなくて送られていないときは入力エラーにする。
     */
    private function saveDisplayName(User $account, ?string $displayName): void
    {
        if ($displayName === null) {
            if ($account->display_name === null) {
                throw ValidationException::withMessages([
                    'display_name' => [__('validation.display_name.required')],
                ]);
            }

            return;
        }

        $account->display_name = $displayName;
        $account->save();
    }
}
