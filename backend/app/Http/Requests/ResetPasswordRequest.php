<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
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
     * token の期限・使用済みは入力エラーではなく、PasswordResetService で422 link_invalid にする。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-16：空でない文字列。前後の空白も削らずにそのまま照合する（bootstrap/app.php の trimStrings）
            'token' => ['bail', 'required', 'string'],
            'email' => ['bail', 'required', 'string', 'max:255', 'email:rfc'],
            // V-02：会員登録と同じ条件。入力は変換しない
            'password' => ['bail', 'required', 'string', 'regex:/\A[!-~]{8,72}\z/'],
        ];
    }
}
