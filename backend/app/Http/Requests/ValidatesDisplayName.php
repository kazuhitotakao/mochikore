<?php

namespace App\Http\Requests;

use App\Models\User;

/**
 * V-27：共同編集のメンバーに見せる表示名（D-119）。
 * 会員登録（API-01）とアカウント設定（API-55）で、同じ条件の必須項目として受け取る（D-127）。
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
    protected function displayNameRules(): array
    {
        return [
            'bail',
            'required',
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
}
