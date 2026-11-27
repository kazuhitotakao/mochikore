<?php

namespace App\Http\Resources;

use App\Services\EmailChangeService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
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
            'email' => $this->email,
            'email_verified_at' => $this->email_verified_at,
            // D-119・D-127：共同編集のメンバーに見せる表示名。会員登録で必ず入れる
            'display_name' => $this->display_name,
            // D-107：確認リンクの期限（60分）を過ぎた変更先は確定できないので、確認中として返さない
            'pending_email' => $this->pending_email_requested_at
                && ! $this->pending_email_requested_at->copy()->addMinutes(EmailChangeService::LINK_LIFETIME_MINUTES)->isPast()
                    ? $this->pending_email
                    : null,
        ];
    }
}
