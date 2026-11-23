<?php

namespace App\Http\Requests;

/**
 * API-53・54 公開リスト・限定公開のリストから、選んだ持ち物を自分のリストへ取り込む（F-33、D-118）。
 * 入力の形は持ち物のコピー（API-51）と同じ（V-26）。利用者の指示で、文言は「取り込む」にそろえる。
 */
class ImportItemsRequest extends TransferItemsRequest
{
    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        $destination = __('validation.import_items.destination');

        return array_merge(parent::messages(), [
            'item_ids.required' => __('validation.import_items.empty'),
            'destination_list_id.present' => $destination,
            'destination_list_id.integer' => $destination,
            'destination_list_id.min' => $destination,
            'new_list_title.prohibited' => $destination,
        ]);
    }
}
