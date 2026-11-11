<?php

namespace App\Http\Requests;

use Illuminate\Validation\Validator;

/**
 * C-03・C-04：PATCH で、変更する項目がない送信（errors._form）と、
 * APIで定義していない項目（is_public・group_id・user_id など）を拒否する。
 * 使う側で editableFields() に、そのAPIで受け取る項目を返す。
 */
trait RejectsEmptyOrUndefinedFields
{
    /**
     * @return list<string>
     */
    abstract protected function editableFields(): array;

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $fields = $this->editableFields();
                $sent = array_keys($this->getInputSource()->all());

                if (array_intersect($sent, $fields) === []) {
                    $validator->errors()->add('_form', __('validation.no_changes'));
                }

                foreach (array_diff($sent, $fields) as $key) {
                    $validator->errors()->add((string) $key, __('validation.undefined_field'));
                }
            },
        ];
    }
}
