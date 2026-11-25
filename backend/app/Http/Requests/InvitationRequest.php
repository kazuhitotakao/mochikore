<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * API-56 招待リンクを作る・API-62 招待リンクから参加する（F-34、D-119）。
 * 受け取るのは表示名だけ。まだ表示名がない人が送らなかったときは、Service が入力エラーにする（V-27）。
 */
class InvitationRequest extends FormRequest
{
    use ValidatesDisplayName;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return ['display_name' => $this->displayNameRules(required: false)];
    }
}
