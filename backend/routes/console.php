<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// D-35・D-44・D-78：保管期限を過ぎたデータを1日1回整理する。
Schedule::command('maintenance:cleanup')->daily()->withoutOverlapping();

// D-47：未確認があるときだけ通知する。前回の処理が残っている間は重ねて起動しない
Schedule::command('reports:notify')->daily()->withoutOverlapping();
