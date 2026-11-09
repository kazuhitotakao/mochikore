<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RegisterUserRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            // D-39：半角の英字・数字・記号（空白を除くASCII）で8〜72文字。72はbcryptが扱える上限
            'password' => ['required', 'string', 'min:8', 'max:72', 'regex:/\A[!-~]+\z/'],
        ];
    }
}
