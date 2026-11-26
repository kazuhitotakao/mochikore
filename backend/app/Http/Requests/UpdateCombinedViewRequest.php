<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * API-68 まとめ表示を変える（F-37、D-124、V-31）。送られた項目だけを変える（C-03）。
 * list_ids を送ったときは、並べるリストと順番をまとめて置き換える（追加・解除・並べ替えを1回で）。
 */
class UpdateCombinedViewRequest extends FormRequest
{
    use RejectsEmptyOrUndefinedFields, ValidatesCombinedView;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * C-03：省略した項目は変えない。送られた null・空文字は省略と区別し、必須のエラーにする。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->combinedViewRules(['sometimes', 'required']);
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return self::FIELDS;
    }
}
