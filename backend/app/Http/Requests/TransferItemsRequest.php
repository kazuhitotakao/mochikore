<?php

namespace App\Http\Requests;

use App\Models\PackingListItem;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * API-51・52 選んだ持ち物を別のリストへコピー・移動する（F-32、D-118）。
 * 移し先は、自分のリスト（destination_list_id）か、新しく作るリストの名前（new_list_title）のどちらか。
 */
class TransferItemsRequest extends FormRequest
{
    use NormalizesListText;

    private const FIELDS = ['item_ids', 'destination_list_id', 'new_list_title', 'destination_group_id'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * V-26：ここでは形だけを確かめる。元のリストの削除していない持ち物か・自分のリストか・
     * 移し先のグループかは、リストをロックした後に ItemTransferService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $newList = fn () => $this->input('destination_list_id') === null;

        return [
            'item_ids' => ['bail', 'required', 'array', 'list', 'max:'.PackingListItem::MAX_PER_LIST],
            // C-02：JSON の正の整数だけ。"1"・1.5 は変換せずに拒否する
            'item_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
            // null は「新しいリストを作る」。省略は選んでいないので拒否する
            'destination_list_id' => ['bail', 'present', 'nullable', 'integer:strict', 'min:1'],
            // V-04：新しいリストの名前は、リストの作成（API-06）と同じ条件
            'new_list_title' => [
                'bail',
                Rule::prohibitedIf(fn () => ! $newList()),
                Rule::requiredIf($newList),
                'nullable', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB,
            ],
            // 新しいリストにはグループがないので、グループは選べない
            'destination_group_id' => ['bail', Rule::prohibitedIf($newList), 'nullable', 'integer:strict', 'min:1'],
        ];
    }

    /**
     * 特定の決まりの文言を先に書く（ワイルドカードを先に書くと、選んでいないときの文まで上書きするため）。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $items = __('validation.transfer_items.items');
        $destination = __('validation.transfer_items.destination');
        $group = __('validation.transfer_items.group');

        return [
            'item_ids.required' => __('validation.transfer_items.empty'),
            'item_ids.max' => __('validation.transfer_items.max'),
            'item_ids.array' => $items,
            'item_ids.list' => $items,
            'item_ids.*.*' => $items,
            'destination_list_id.present' => $destination,
            'destination_list_id.integer' => $destination,
            'destination_list_id.min' => $destination,
            'new_list_title.prohibited' => $destination,
            'destination_group_id.*' => $group,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['new_list_title' => 'リスト名'];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：定義していない項目（is_checked・group_id など）は受け付けない
            foreach (array_diff(array_keys($this->getInputSource()->all()), self::FIELDS) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
