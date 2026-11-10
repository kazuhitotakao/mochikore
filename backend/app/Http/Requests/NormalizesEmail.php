<?php

namespace App\Http\Requests;

/**
 * V-01・C-01：会員登録・ログイン・再設定・メール変更で、メールアドレスに同じ前処理をする（D-92）。
 */
trait NormalizesEmail
{
    /**
     * 前後空白の削除と空文字→nullは標準のTrimStrings・ConvertEmptyStringsToNullに任せ、
     * その後の値が文字列のときだけ半角英字を小文字にそろえる。
     * 数値・配列・nullは変換せず、そのまま型や必須のエラーにする。
     */
    protected function normalizeEmail(string $key = 'email'): void
    {
        $value = $this->input($key);
        if (! is_string($value)) {
            return;
        }

        // strtolower() は半角英字だけを小文字にする（PHP 8.2以降はロケールに左右されない）
        $this->merge([$key => strtolower($value)]);
    }
}
