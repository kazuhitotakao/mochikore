<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePackingListRequest extends FormRequest
{
    use NormalizesListText, RejectsEmptyOrUndefinedFields;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeLineBreaks('description');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * C-03：送られた項目だけを確かめて変える（sometimes）。省略した項目は変えない。
     * 送られた null・空文字は省略と区別し、消せるのは説明文だけにする。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-04：null・空文字・空白だけは、作成と同じ必須のエラー
            'title' => ['bail', 'sometimes', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
            // V-05：編集で未選択にはできない
            'category_id' => ['bail', 'sometimes', 'required', 'integer:strict', Rule::exists('categories', 'id')],
            // V-06：送られた空文字・空白だけ・null は説明文を消す
            'description' => ['bail', 'sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    /**
     * API-08 で受け取る項目。公開設定は API-14 で変える（D-67）。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['title', 'category_id', 'description'];
    }
}
