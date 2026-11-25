<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Validation\Validator;

/**
 * V-27：共同編集のメンバーに見せる表示名（D-119）。
 * アカウント設定（API-55）では必須、招待リンクを作る・参加する（API-56・62）では任意で受け取る。
 */
trait ValidatesDisplayName
{
    use NormalizesListText;

    /**
     * C-04：1項目1文にするため、必須→型→長さ→形式の順に最初の違反だけを返す（bail）。
     * 前後空白の削除と空文字→nullは Laravel 標準に任せる（C-01・D-92）。
     *
     * @return list<string>
     */
    protected function displayNameRules(bool $required): array
    {
        return [
            'bail',
            // 任意のときも、空欄（標準で null になる）は「入れていない」と同じに扱う
            $required ? 'required' : 'nullable',
            'string',
            'max:'.User::DISPLAY_NAME_MAX_LENGTH,
            'not_regex:'.self::LINE_BREAK_OR_TAB,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'display_name.required' => __('validation.display_name.required'),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['display_name' => __('validation.display_name.attribute')];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：表示名のほかは受け取らない（メールアドレス・ほかの人のIDなどの混入を断る）
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['display_name']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
