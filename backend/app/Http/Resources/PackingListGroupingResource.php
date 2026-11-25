<?php

namespace App\Http\Resources;

use App\Models\PackingListGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API-29 グループ整理用の最新状態（06_API一覧「グループ整理のAPI仕様」）。
 * category・groups・items（groups・items は表示順）と members_count を読み込んでから使う。削除済みの持ち物は含まない。
 */
class PackingListGroupingResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'grouping_revision' => $this->grouping_revision,
            // F-35・D-119：共同編集のリストか（所有者でない・メンバーがいる）を、グループ整理（SC-09）が見分けるのに使う。
            // 共同編集では、ほかのメンバーの変更を下書きへ取り込む
            'is_owner' => $this->user_id === $request->user()->id,
            'member_count' => $this->members_count,
            // D-102：SC-09 がこのリストのカテゴリーのよく使うグループ（API-39）を読むときに使う
            'category' => [
                'id' => $this->category->id,
                'name' => $this->category->name,
            ],
            'groups' => $this->groups->map(fn (PackingListGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'sort_order' => $group->sort_order,
                // D-122：チェックの動き（normal・repeat）。SC-09 のダイアログで選び、API-30 で保存する
                'check_mode' => $group->check_mode,
            ]),
            'items' => PackingListItemResource::collection($this->items)->resolve($request),
        ];
    }
}
