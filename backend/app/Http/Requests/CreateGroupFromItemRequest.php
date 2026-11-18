<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class CreateGroupFromItemRequest extends FormRequest
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
     * V-24・D-111：ここでは形だけを確かめる。同じリストの削除していない別の持ち物かは、
     * 親リストをロックした後に GroupingService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'item_id' => ['bail', 'required', 'integer:strict', 'min:1'],
        ];
    }

    /**
     * 画面では重ねて離すだけなので、どの違反も読み直しを案内する（V-24）。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $message = __('validation.group_from_item.item');

        return [
            'item_id.required' => $message,
            'item_id.integer' => $message,
            'item_id.min' => $message,
        ];
    }

    /**
     * API-45 で受け取る項目。名前・順番・チェックはこのAPIでは受け取らない。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['item_id'];
    }
}
