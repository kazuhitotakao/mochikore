<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UndoGroupFromItemRequest extends FormRequest
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
     * V-30・D-123：ここでは形だけを確かめる。重ねた直後のままか（グループ・重ねた持ち物・元のグループ）は、
     * 親リストをロックした後に GroupingService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'group_id' => ['bail', 'required', 'integer:strict', 'min:1'],
            'item_id' => ['bail', 'required', 'integer:strict', 'min:1'],
            // 重ねた持ち物の元の所属。グループの外にあったときは null（キーは必ず送る）
            'previous_group_id' => ['bail', 'present', 'nullable', 'integer:strict', 'min:1'],
        ];
    }

    /**
     * 画面では「元に戻す」を押すだけなので、どの違反も読み直しを案内する（V-30）。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $message = __('validation.group_from_item.undo');

        return [
            'group_id.required' => $message,
            'group_id.integer' => $message,
            'group_id.min' => $message,
            'item_id.required' => $message,
            'item_id.integer' => $message,
            'item_id.min' => $message,
            'previous_group_id.present' => $message,
            'previous_group_id.integer' => $message,
            'previous_group_id.min' => $message,
        ];
    }

    /**
     * API-64 で受け取る項目。
     *
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['group_id', 'item_id', 'previous_group_id'];
    }
}
