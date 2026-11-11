<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePackingListRequest extends FormRequest
{
    use NormalizesListText;

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
     * C-04：1項目1文にするため、必須→型→長さ→形式の順に最初の違反だけを返す（bail）。
     * 前後空白の削除と空文字→nullは Laravel 標準に任せる（C-01・D-92）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-04：同じ名前のリストも作れる（D-30）。文字数はコードポイントで数える
            'title' => ['bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
            // V-05・C-02：JSONの正の整数だけ。"1"・1.5・true は型変換せずに拒否する
            'category_id' => ['bail', 'required', 'integer:strict', Rule::exists('categories', 'id')],
            // V-06：省略・空欄は null（D-21）。内部の改行は残し、LFにそろえてから数える
            'description' => ['bail', 'nullable', 'string', 'max:500'],
        ];
    }
}
