<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexPublicListsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        // V-15・C-02：クエリだけで使う十進整数。空文字・先頭の0・符号・安全整数の範囲外は拒否する
        $integer = ['bail', 'sometimes', 'required', 'string', 'regex:/\A[1-9][0-9]*\z/', 'integer', 'max:9007199254740991'];

        return [
            'keyword' => ['bail', 'sometimes', 'nullable', 'string', 'max:50'],
            'category_id' => [...$integer, Rule::exists('categories', 'id')],
            'page' => $integer,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'category_id.*' => __('validation.custom.category_id.exists'),
            'page.*' => __('validation.public_search.page'),
        ];
    }
}
