<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-50 自分のリストを複製する（F-30、D-116）。受け取るのは新しいリスト名だけ。
 */
class DuplicatePackingListRequest extends FormRequest
{
    use NormalizesListText;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * C-04：1項目1文にするため、必須→型→長さ→形式の順に最初の違反だけを返す（bail）。
     * 前後空白の削除と空文字→nullは Laravel 標準に任せる（C-01・D-92）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-04：作成（API-06）と同じ条件。元と同じ名前でも複製できる（D-30）
            'title' => ['bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：名前のほかは元のリストから取り、本文での上書き（説明文・公開設定など）を受け付けない
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['title']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
