<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class DeleteAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // V-16・V-02：現在のパスワードも、登録と同じ条件で無変換のまま確かめる
            'password' => ['bail', 'required', 'string', 'regex:/\A[!-~]{8,72}\z/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            // API-22・C-03：削除対象はログイン本人だけ。本文で他人のIDなどを指定させない
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['password']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
