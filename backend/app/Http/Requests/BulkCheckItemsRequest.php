<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkCheckItemsRequest extends FormRequest
{
    use RejectsEmptyOrUndefinedFields;

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
     * V-19：ここでは形だけを確かめる。同じリストの削除していない持ち物かは、PackingListItemService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'item_ids' => ['bail', 'required', 'array', 'list'],
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'item_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
            // V-09：JSON の true / false だけ。0/1・文字列・null は拒否する
            'is_checked' => ['bail', 'required', 'boolean:strict'],
        ];
    }

    /**
     * V-19：並べ替え（V-10）と同じ item_ids でも、違う文言にする。画面では見出しのチェックを押すだけなので、
     * どの違反でも読み直しを案内する。is_checked は lang の V-09 の文言を使う。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $message = __('validation.bulk_check.items');

        return [
            'item_ids.*' => $message,
            'item_ids.*.*' => $message,
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['item_ids', 'is_checked'];
    }
}
