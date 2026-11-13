<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SendEmailChangeRequest extends FormRequest
{
    use NormalizesEmail;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeEmail('pending_email');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-16・V-01：登録済みかはここで判定せず、同じ受付応答を保つ
            'pending_email' => ['bail', 'required', 'string', 'max:255', 'email:rfc'],
            'password' => ['bail', 'required', 'string', 'regex:/\A[!-~]{8,72}\z/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：本人や変更確定の情報を本文に混ぜて保存させない
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['pending_email', 'password']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }

            if (! $validator->errors()->has('pending_email')
                && $this->input('pending_email') === $this->user()?->email) {
                $validator->errors()->add('pending_email', __('validation.email_change.same'));
            }
        }];
    }
}
