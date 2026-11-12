<?php

namespace App\Http\Resources;

use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use Illuminate\Http\Request;

class PublicPackingListDetailResource extends PublicPackingListSummaryResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...parent::toArray($request),
            'groups' => $this->groups->map(fn (PackingListGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'sort_order' => $group->sort_order,
            ]),
            // D-95：作成者がチェック済みを隠していても全有効項目を返し、チェック状態は返さない
            'items' => $this->items->map(fn (PackingListItem $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'group_id' => $item->group_id,
                'sort_order' => $item->sort_order,
            ]),
        ];
    }
}
