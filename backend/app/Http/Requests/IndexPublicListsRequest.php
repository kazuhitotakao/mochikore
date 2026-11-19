<?php

namespace App\Http\Requests;

use App\Models\PackingList;
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
            // V-25・D-117：並び順。省略は新しい順（D-23）。空文字・配列・定義外の値は拒否する
            'sort' => ['bail', 'sometimes', 'required', 'string', Rule::in(PackingList::PUBLIC_SORTS)],
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
            'sort.*' => __('validation.public_search.sort'),
        ];
    }
}
