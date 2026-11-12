<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class CopyPublicPackingListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            // API-17・C-03：コピーの内容は元リストから取り、本文での上書きを受け付けない
            foreach (array_keys($this->getInputSource()->all()) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
