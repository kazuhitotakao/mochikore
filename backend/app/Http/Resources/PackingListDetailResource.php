<?php

namespace App\Http\Resources;

use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API-07 自分のリストの内容。リスト本体に grouping_revision・groups・items を加える（D-67）。
 * category・groups・items を表示順で、members_count も読み込んでから使う。
 * メンバーがいるときは user と members.user も読み込む（D-130）。
 */
class PackingListDetailResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $isOwner = $this->user_id === $request->user()->id;
        $hasInvite = $isOwner && $this->hasValidInvite();
        // D-130：メンバーがいる共同編集のリストで、今の所有者・メンバーがチェックした持ち物だけ表示名を返す。
        // 個人用のリスト・抜けた人・外された人のチェックには返さない。利用者のIDは返さない（D-119）
        $checkers = $this->members_count > 0
            ? collect([$this->user])->merge($this->members->pluck('user'))->pluck('display_name', 'id')
            : collect();
        $userId = $request->user()->id;

        return [
            ...(new PackingListResource($this->resource))->toArray($request),
            'grouping_revision' => $this->grouping_revision,
            // D-114：所有者の画面だけで、作った限定公開のリンクを表示する（なければ null）
            'share_token' => $isOwner ? $this->share_token : null,
            // D-119：所有者かと、共同編集のメンバーの数（所有者を除く）。招待リンクは所有者にだけ、期限内のものを返す
            'is_owner' => $isOwner,
            'member_count' => $this->members_count,
            'invite_token' => $hasInvite ? $this->invite_token : null,
            'invite_expires_at' => $hasInvite ? $this->invite_expires_at : null,
            'groups' => $this->groups->map(fn (PackingListGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'sort_order' => $group->sort_order,
                'is_checked' => $group->is_checked,
                // D-122：チェックの動き（normal・repeat）
                'check_mode' => $group->check_mode,
            ]),
            'items' => $this->items->map(fn (PackingListItem $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'group_id' => $item->group_id,
                'sort_order' => $item->sort_order,
                'is_checked' => $item->is_checked,
                'last_checked_at' => $item->last_checked_at,
                // D-130：チェックした人。自分かどうか（is_me）で、画面は自分の分を出さない
                'checked_by' => $item->is_checked && $item->checked_by !== null && $checkers->has($item->checked_by)
                    ? ['display_name' => $checkers->get($item->checked_by), 'is_me' => $item->checked_by === $userId]
                    : null,
            ]),
        ];
    }
}
