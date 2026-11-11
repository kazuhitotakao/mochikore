<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkDeleteItemsRequest extends FormRequest
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
     * V-20：ここでは形だけを確かめる。同じリストの削除していない持ち物・同じリストのグループかは、
     * 親リストをロックした後に PackingListItemService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // どちらかだけ選ぶこともあるので、required ではなく present にし、両方空だけを拒否する
            'item_ids' => [
                'bail', 'present', 'array', 'list',
                function (string $attribute, mixed $value, Closure $fail) {
                    if ($value === [] && $this->input('group_ids') === []) {
                        $fail(__('validation.bulk_delete.empty'));
                    }
                },
            ],
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'item_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
            'group_ids' => ['bail', 'present', 'array', 'list'],
            'group_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
        ];
    }

    /**
     * V-20：並べ替え（V-10・V-18）と同じ項目名でも、違う文言にする。画面では選んで押すだけなので、
     * 何も選んでいないとき以外の違反は読み直しを案内する。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $message = __('validation.bulk_delete.items');

        // item_ids.* の形で指定すると、何も選んでいないとき（上の確認）の文言まで上書きするので、決まりごとに書く
        return [
            'item_ids.present' => $message,
            'item_ids.array' => $message,
            'item_ids.list' => $message,
            'item_ids.*.*' => $message,
            'group_ids.present' => $message,
            'group_ids.array' => $message,
            'group_ids.list' => $message,
            'group_ids.*.*' => $message,
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['item_ids', 'group_ids'];
    }
}
