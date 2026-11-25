<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * API-55 表示名を変える（F-34、SC-12、D-119）。一度入れた表示名は、空にはできない。
 */
class UpdateProfileRequest extends FormRequest
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
        return ['display_name' => $this->displayNameRules(required: true)];
    }
}
