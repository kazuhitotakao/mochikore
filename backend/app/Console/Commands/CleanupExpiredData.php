<?php

namespace App\Console\Commands;

use App\Services\DailyCleanupService;
use Illuminate\Console\Command;
use Throwable;

class CleanupExpiredData extends Command
{
    protected $signature = 'maintenance:cleanup';

    protected $description = '未認証アカウント・削除済みの持ち物・期限切れのログイン情報を削除する（D-35・44・78）';

    public function handle(DailyCleanupService $service): int
    {
        try {
            $counts = $service->run();
        } catch (Throwable) {
            // SQLの例外にはメールアドレスなどが含まれ得るため、詳細を標準出力へ出さない。
            $this->error('定期削除に失敗しました。データベースの接続と実行環境を確認してください。');

            return self::FAILURE;
        }

        $this->info("未認証アカウント{$counts['users']}件、削除済みの持ち物{$counts['items']}件、期限切れのログイン情報{$counts['tokens']}件を削除しました。");

        return self::SUCCESS;
    }
}
