<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ReorderPackingListItemsRequest extends FormRequest
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
     * V-10：ここでは形だけを確かめる。同じリストの削除していない持ち物すべてか（不足・他リスト・削除済み）は、
     * 親リストをロックした後に PackingListItemService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // 持ち物が0件のリストだけ [] を受け付けるので、required ではなく present にする
            'item_ids' => ['bail', 'present', 'array', 'list'],
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'item_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['item_ids'];
    }
}
