<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSavedItemRequest extends FormRequest
{
    use NormalizesListText;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * V-11：名前は V-08（持ち物名）、カテゴリーは V-05 と同じ条件。
     * 同じカテゴリーの同名と200件の上限は SavedItemService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
            'category_id' => ['bail', 'required', 'integer:strict', Rule::exists('categories', 'id')],
        ];
    }

    /**
     * V-11：持ち物名とは別の名前で案内する（lang/ja/validation.php の saved_item）。
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['name' => __('validation.saved_item.attribute')];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['name.required' => __('validation.saved_item.required')];
    }
}
