<?php

namespace App\Services;

use App\Models\ListReport;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;

class ListReportNotificationService
{
    public function sendPending(): int
    {
        $pending = ListReport::query()->whereNull('reviewed_at')
            ->select('packing_list_id')->selectRaw('COUNT(*) as reports_count')
            ->groupBy('packing_list_id')->orderBy('packing_list_id')->get();
        $total = (int) $pending->sum('reports_count');
        if ($total === 0) {
            return 0;
        }

        $lines = ["未確認の通報が{$total}件あります。", ''];
        foreach ($pending as $report) {
            $url = rtrim(config('app.frontend_url'), '/').'/public/lists/'.$report->packing_list_id;
            $lines[] = "{$report->reports_count}件：{$url}";
        }

        // D-47：1日分を1通にまとめる。送信しただけでは管理者の確認済みにしない
        Mail::raw(implode("\n", $lines), function (Message $message) {
            $message->to(config('mail.reports_to'))->subject('【もちこれ】未確認の通報があります');
        });

        return $total;
    }
}
