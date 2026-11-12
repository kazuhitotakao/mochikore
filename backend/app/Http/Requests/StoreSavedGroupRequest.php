<?php

namespace App\Http\Requests;

use App\Models\PackingListGroup;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSavedGroupRequest extends FormRequest
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
     * V-21：名前は V-14（グループ名）、カテゴリーは V-05 と同じ条件。予約名「未分類」は使えない。
     * 同じカテゴリーの同名と100件の上限は SavedGroupService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB,
                Rule::notIn([PackingListGroup::RESERVED_NAME]),
            ],
            'category_id' => ['bail', 'required', 'integer:strict', Rule::exists('categories', 'id')],
        ];
    }

    /**
     * V-21：グループ名として案内する（lang/ja/validation.php の saved_group）。
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['name' => __('validation.saved_group.attribute')];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => __('validation.saved_group.required'),
            'name.not_in' => __('validation.saved_group.reserved'),
        ];
    }
}
