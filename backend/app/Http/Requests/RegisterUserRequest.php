<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RegisterUserRequest extends FormRequest
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
     * C-04：1項目1文にするため、必須→型→長さ→形式の順に最初の違反だけを返す（bail）。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-01：DNS確認は条件にしない。登録済みかは AuthService で確かめる
            'email' => ['bail', 'required', 'string', 'max:255', 'email:rfc'],
            // V-02：空白を含めず、ASCIIの0x21〜0x7Eで8〜72文字。入力は変換しない。72はbcryptが扱える上限
            'password' => ['bail', 'required', 'string', 'regex:/\A[!-~]{8,72}\z/'],
        ];
    }
}
