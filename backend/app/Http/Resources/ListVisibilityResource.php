<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ListVisibilityResource extends JsonResource
{
    /**
     * @return array{is_public: bool}
     */
    public function toArray(Request $request): array
    {
        return ['is_public' => $this->is_public];
    }
}
