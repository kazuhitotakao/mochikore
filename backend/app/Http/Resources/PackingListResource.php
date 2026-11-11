<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * リスト本体（D-67）。API-06・08 の応答と、API-07 の土台。category を読み込んでから使う。
 */
class PackingListResource extends JsonResource
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
            'is_public' => $this->is_public,
            'moderated_at' => $this->moderated_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
