<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 会員登録（API-01）とログイン（API-02）の応答。AuthService の戻り値 {user, token} を受け取る。
 */
class AuthTokenResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            // D-72：tokenはNext.jsのサーバーだけが受け取り、ブラウザへは渡さない
            'token' => $this->resource['token'],
            'user' => new UserResource($this->resource['user']),
        ];
    }
}
