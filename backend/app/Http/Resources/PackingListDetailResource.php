<?php

namespace App\Http\Resources;

use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API-07 自分のリストの内容。リスト本体に grouping_revision・groups・items を加える（D-67）。
 * category・groups・items を表示順で読み込んでから使う。
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
        return [
            ...(new PackingListResource($this->resource))->toArray($request),
            'grouping_revision' => $this->grouping_revision,
            'groups' => $this->groups->map(fn (PackingListGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'sort_order' => $group->sort_order,
            ]),
            'items' => $this->items->map(fn (PackingListItem $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'group_id' => $item->group_id,
                'sort_order' => $item->sort_order,
                'is_checked' => $item->is_checked,
            ]),
        ];
    }
}
