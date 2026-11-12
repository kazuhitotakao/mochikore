<?php

namespace App\Http\Requests;

use App\Enums\ReportReason;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreListReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['reason' => ['bail', 'required', 'string', Rule::enum(ReportReason::class)]];
    }

    public function messages(): array
    {
        $reason = $this->input('reason');

        return [
            // V-22・D-104：空の配列も、未選択ではなく文字列の型違いとして案内する
            'reason.required' => $reason !== null && ! is_string($reason)
                ? __('validation.custom.reason.string')
                : __('validation.custom.reason.required'),
            'reason.string' => __('validation.custom.reason.string'),
            'reason.enum' => __('validation.custom.reason.required'),
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：通報者情報や確認日時を本文へ混ぜても保存しない
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['reason']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
