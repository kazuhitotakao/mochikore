<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StorePackingListItemRequest extends FormRequest
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
     * C-04：必須→型→長さ→形式の順に最初の違反だけを返す（bail）。
     * group_id は受け取らず、未分類で追加する（API-10）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-08：同じ名前も別の持ち物として追加する（D-29）
            'name' => ['bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
        ];
    }
}
