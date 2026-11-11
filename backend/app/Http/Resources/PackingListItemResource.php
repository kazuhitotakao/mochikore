<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 持ち物1件。API-10・11・25 の応答で、画面はこの値で表示を更新する（D-71）。
 */
class PackingListItemResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'group_id' => $this->group_id,
            'sort_order' => $this->sort_order,
            'is_checked' => $this->is_checked,
        ];
    }
}
