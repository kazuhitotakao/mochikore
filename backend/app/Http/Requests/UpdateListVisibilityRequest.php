<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateListVisibilityRequest extends FormRequest
{
    use RejectsEmptyOrUndefinedFields;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            // V-07：型を先に確かめ、公開条件は Service で判定する
            'is_public' => ['bail', 'required', 'boolean:strict'],
        ];
    }

    /**
     * @return list<string>
     */
    protected function editableFields(): array
    {
        return ['is_public'];
    }
}
