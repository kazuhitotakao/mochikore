<?php

namespace App\Http\Resources;

use App\Models\PackingList;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * まとめ表示1件（API-65〜68、D-124）。lists は、本人が今見られるリストだけを選んだ順で読み込んでから使う
 * （CombinedViewController::loadAccessibleLists）。リストの中身は API-07 で読む。
 */
class CombinedViewResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'lists' => $this->lists->map(fn (PackingList $list) => [
                'id' => $list->id,
                'title' => $list->title,
            ])->values(),
            'updated_at' => $this->updated_at,
        ];
    }
}
