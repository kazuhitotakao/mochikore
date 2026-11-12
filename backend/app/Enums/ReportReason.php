<?php

namespace App\Enums;

// D-72・API-26：自由記入を受け付けず、決定済みの4つのコードだけを保存する
enum ReportReason: string
{
    case Harassment = 'harassment';
    case PersonalInfo = 'personal_info';
    case Spam = 'spam';
    case Other = 'other';
}
