<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateEmptyGroupCheckRequest extends FormRequest
{
    use RejectsEmptyOrUndefinedFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // V-23・V-09：0/1や文字列を真偽値へ変換しない。
        return ['is_checked' => ['bail', 'required', 'boolean:strict']];
    }

    protected function editableFields(): array
    {
        return ['is_checked'];
    }
}
