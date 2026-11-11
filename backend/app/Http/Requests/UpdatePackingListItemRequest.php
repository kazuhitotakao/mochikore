<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePackingListItemRequest extends FormRequest
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
     * C-03：送られた項目だけを確かめて変える（sometimes）。省略した項目は変えない。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-08：null・空文字・空白だけは必須のエラー
            'name' => ['bail', 'sometimes', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
            // V-09：JSON の true/false だけ。0/1・"true"・null は変換せずに拒否する
            'is_checked' => ['bail', 'sometimes', 'required', 'boolean:strict'],
        ];
    }

    /**
     * API-11 で受け取る項目。グループの所属は API-30 だけで変える。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['name', 'is_checked'];
    }
}
