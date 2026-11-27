<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-56・57・59・60・62 招待リンクを作る・止める・メンバーを外す・自分で抜ける・参加する（F-34、D-119）。
 * 本文は受け取らない（表示名は会員登録で入れてある、D-127）。
 */
class NoBodyRequest extends FormRequest
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
            // C-03：対象はURLで決まるので、本文での指定（ほかの人のIDなど）を受け付けない
            foreach (array_keys($this->getInputSource()->all()) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
