<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreBulkItemsRequest extends FormRequest
{
    // C-02：JSON の整数は安全整数の範囲まで
    private const MAX_SAFE_INTEGER = 9007199254740991;

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
     * ここでは形だけを確かめる。本人の候補か・revision が最新かは、
     * 親リストをロックした後に PackingListItemService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-12：1〜200個の正の整数の配列。重複はだめ。空の配列は required で「1件以上」のエラーになる
            'saved_item_ids' => ['bail', 'required', 'array', 'list', 'max:200'],
            'saved_item_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
            // V-13：0以上の JSON の整数。"1"・1.5・null は変換せずに拒否する
            'base_revision' => ['bail', 'required', 'integer:strict', 'min:0', 'max:'.self::MAX_SAFE_INTEGER],
        ];
    }
}
