<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API-05 自分のリスト一覧の1行（D-63）。category と items_count を読み込んでから使う。
 */
class PackingListSummaryResource extends JsonResource
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
            'title' => $this->title,
            'description' => $this->description,
            'category' => [
                'id' => $this->category->id,
                'name' => $this->category->name,
            ],
            // 削除済み（SoftDeletes）の持ち物は数えない
            'items_count' => $this->items_count,
            'is_public' => $this->is_public,
            'updated_at' => $this->updated_at,
        ];
    }
}
