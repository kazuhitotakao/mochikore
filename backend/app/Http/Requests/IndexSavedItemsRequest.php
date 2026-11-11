<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexSavedItemsRequest extends FormRequest
{
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
     * V-15・C-02：クエリの category_id は任意。省略は全件。
     * 指定したら、標準の空白削除の後に十進数字だけの文字列で、有効なカテゴリーのIDであること。
     * 空にして送ると標準で null になるが、有効な整数ではないので拒否する。配列・小数・負数も拒否する。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'category_id' => ['bail', 'sometimes', 'required', 'string', 'regex:/\A[1-9][0-9]*\z/', Rule::exists('categories', 'id')],
        ];
    }

    /**
     * V-15：どの違反でも、カテゴリーの選び直しを案内する。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $message = __('validation.custom.category_id.exists');

        return [
            'category_id.required' => $message,
            'category_id.string' => $message,
            'category_id.regex' => $message,
            'category_id.exists' => $message,
        ];
    }

    /**
     * 指定されたカテゴリーのID。省略なら null（全件）。
     */
    public function categoryId(): ?int
    {
        $categoryId = $this->validated('category_id');

        return $categoryId === null ? null : (int) $categoryId;
    }
}
