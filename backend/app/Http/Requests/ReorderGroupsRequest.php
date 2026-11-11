<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ReorderGroupsRequest extends FormRequest
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
     * V-18：ここでは形だけを確かめる。同じリストの全グループを1回ずつ含むか（不足・他リスト）は、
     * 親リストをロックした後に GroupingService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // グループがないリストだけ [] を受け付けるので、required ではなく present にする
            'group_ids' => ['bail', 'present', 'array', 'list'],
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'group_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['group_ids'];
    }
}
