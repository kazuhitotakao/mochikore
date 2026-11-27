<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-55 表示名を変える（F-34、SC-12、D-119）。表示名は空にはできない。
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
        return ['display_name' => $this->displayNameRules()];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：表示名のほかは受け取らない（メールアドレス・ほかの人のIDなどの混入を断る）
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['display_name']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
