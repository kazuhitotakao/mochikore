<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-66 まとめ表示を作る（F-37、D-124、V-31）。名前と、並べるリスト（2〜5件、選んだ順）は両方必須。
 */
class StoreCombinedViewRequest extends FormRequest
{
    use ValidatesCombinedView;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->combinedViewRules(['required']);
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：定義していない項目（user_id など）は受け付けない
            foreach (array_diff(array_keys($this->getInputSource()->all()), self::FIELDS) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
