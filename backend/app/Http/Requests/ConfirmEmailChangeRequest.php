<?php

namespace App\Http\Requests;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ConfirmEmailChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        // D-72：署名したクエリだけを確かめ、本文で値を上書きさせない
        return $this->query->all();
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'string'],
            'hash' => ['required', 'string'],
            'expires' => ['required', 'string'],
            'signature' => ['required', 'string'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            foreach (array_keys($this->getInputSource()->all()) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }

    protected function failedValidation(ValidatorContract $validator): void
    {
        // API-28：リンクの値の欠落・型違いは、期限切れ・署名不正と同じ応答にする
        if (array_intersect(array_keys($validator->failed()), ['id', 'hash', 'expires', 'signature'])) {
            throw new ApiException(ApiErrorCode::LinkInvalid, 'リンクの有効期限が切れているか、無効です。');
        }

        parent::failedValidation($validator);
    }
}
