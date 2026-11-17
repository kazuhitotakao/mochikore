<?php

namespace App\Http\Requests;

use App\Models\PackingListGroup;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGroupNameRequest extends FormRequest
{
    use NormalizesListText, RejectsEmptyOrUndefinedFields;

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
     * V-14・D-57：前後の空白は標準の TrimStrings が削り、残りで1〜50文字。予約名「未分類」は使えない。
     * 同じリストのほかのグループとの同名は、親リストをロックしてから GroupingService で確かめる。
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
        ];
    }

    /**
     * API-30 の groups.*.name と同じ文にする（V-14）。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => __('validation.group_name.required'),
            'name.string' => __('validation.group_name.string'),
            'name.max' => __('validation.group_name.max'),
            'name.not_regex' => __('validation.group_name.not_regex'),
            'name.not_in' => __('validation.group_name.not_in'),
        ];
    }

    /**
     * API-44 で受け取る項目。順番・チェック・所属はこのAPIでは変えない。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['name'];
    }
}
