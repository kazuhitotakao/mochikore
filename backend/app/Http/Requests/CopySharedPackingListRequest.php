<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-49 限定公開のリンクのリストを自分用にコピーする（D-114）。本文は受け取らない。
 */
class CopySharedPackingListRequest extends FormRequest
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
            // C-03：API-17と同じく、コピーの内容は元リストから取り、本文での上書きを受け付けない
            foreach (array_keys($this->getInputSource()->all()) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
