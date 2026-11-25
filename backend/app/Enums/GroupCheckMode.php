<?php

namespace App\Enums;

// D-122：グループごとのチェックの動き。グループに入っていない持ち物は、いつも Normal として扱う
enum GroupCheckMode: string
{
    // チェックしたら隠す（D-94）
    case Normal = 'normal';
    // 隠さず、前回チェックした日を出す。日付が変わるとチェックが外れる
    case Repeat = 'repeat';

    /**
     * 入力チェック（V-29）で受け付ける値。
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
