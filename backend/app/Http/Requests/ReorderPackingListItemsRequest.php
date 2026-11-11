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
            // V-17・D-98：別のグループ・未分類へ動かしたときだけ、動かした持ち物と移動先を送る。
            // item_ids に含まれるか・同じリストのグループかは、ロックした後に PackingListItemService で確かめる
            'move' => ['bail', 'sometimes', 'array:item_id,group_id'],
            'move.item_id' => ['bail', 'required_with:move', 'integer:strict', 'min:1'],
            // null は未分類へ移すとき
            'move.group_id' => ['bail', 'present_with:move', 'nullable', 'integer:strict', 'min:1'],
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['item_ids', 'move'];
    }
}
