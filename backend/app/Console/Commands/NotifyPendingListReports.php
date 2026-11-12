<?php

namespace App\Console\Commands;

use App\Services\ListReportNotificationService;
use Illuminate\Console\Command;
use Throwable;

class NotifyPendingListReports extends Command
{
    protected $signature = 'reports:notify';

    protected $description = '未確認の通報の件数とリストURLを管理者へまとめて通知する（D-47）';

    public function handle(ListReportNotificationService $service): int
    {
        try {
            $count = $service->sendPending();
        } catch (Throwable) {
            $this->error('通報の通知に失敗しました。メールの設定と接続を確認してください。');

            return self::FAILURE;
        }

        $this->info($count === 0 ? '未確認の通報はありません。' : "未確認の通報{$count}件を通知しました。");

        return self::SUCCESS;
    }
}
