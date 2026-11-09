<?php

// D-81：入力エラーの文言は日本語で返す。ここにない規則は lang/en（Laravel標準）の文言になるので、
// 新しい規則を使うときに追加する
return [

    'email' => ':attributeの形式が正しくありません。',
    'max' => [
        'string' => ':attributeは:max文字以内で入力してください。',
    ],
    'min' => [
        'string' => ':attributeは:min文字以上で入力してください。',
    ],
    'regex' => ':attributeの形式が正しくありません。',
    'required' => ':attributeを入力してください。',
    'string' => ':attributeは文字列で入力してください。',

    'custom' => [
        'password' => [
            // D-39：使える文字を画面の案内と同じ言葉で伝える
            'regex' => 'パスワードは半角の英字・数字・記号で入力してください。',
        ],
    ],

    'attributes' => [
        'email' => 'メールアドレス',
        'password' => 'パスワード',
    ],

];
