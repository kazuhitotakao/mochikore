<?php

namespace App\Http\Requests;

use App\Enums\GroupCheckMode;
use App\Models\PackingListGroup;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGroupRequest extends FormRequest
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
     * V-29・D-122：check_mode は normal・repeat だけ。小文字化などの変換はしない（C-02）。
     * どちらも送られたときだけ変える（C-03）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'bail', 'sometimes', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB,
                Rule::notIn([PackingListGroup::RESERVED_NAME]),
            ],
            'check_mode' => ['bail', 'sometimes', 'required', 'string', Rule::in(GroupCheckMode::values())],
        ];
    }

    /**
     * 名前は API-30 の groups.*.name と同じ文にする（V-14）。チェックの動きは、どの違反でも同じ文にする（V-29）。
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
            'check_mode.required' => __('validation.check_mode'),
            'check_mode.string' => __('validation.check_mode'),
            'check_mode.in' => __('validation.check_mode'),
        ];
    }

    /**
     * API-44 で受け取る項目。順番・チェック・所属はこのAPIでは変えない。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['name', 'check_mode'];
    }
}
