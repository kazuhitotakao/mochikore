<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdatePackingListRequest extends FormRequest
{
    use NormalizesListText;

    // API-08 で受け取る項目。公開設定は API-14 で変える（D-67）
    private const FIELDS = ['title', 'category_id', 'description'];

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
     * C-03・C-04：変更する項目がない送信と、定義していない項目（is_public・user_id など）を拒否する。
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $sent = array_keys($this->getInputSource()->all());

                if (array_intersect($sent, self::FIELDS) === []) {
                    $validator->errors()->add('_form', __('validation.no_changes'));
                }

                foreach (array_diff($sent, self::FIELDS) as $key) {
                    $validator->errors()->add((string) $key, __('validation.undefined_field'));
                }
            },
        ];
    }
}
