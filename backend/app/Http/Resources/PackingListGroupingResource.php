<?php

namespace App\Http\Resources;

use App\Models\PackingListGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API-29 グループ整理用の最新状態（06_API一覧「グループ整理のAPI仕様」）。
 * groups・items を表示順で読み込んでから使う。削除済みの持ち物は含まない。
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
            'groups' => $this->groups->map(fn (PackingListGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'sort_order' => $group->sort_order,
            ]),
            'items' => PackingListItemResource::collection($this->items)->resolve($request),
        ];
    }
}
