<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
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
        $this->normalizeEmail();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * V-03：会員登録（V-01・V-02）と同じ条件。入力不正はここで422にし、
     * 認証の判定とログイン失敗回数の加算へ進めない（D-37・D-92）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['bail', 'required', 'string', 'max:255', 'email:rfc'],
            'password' => ['bail', 'required', 'string', 'regex:/\A[!-~]{8,72}\z/'],
        ];
    }
}
