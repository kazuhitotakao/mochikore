<?php

namespace App\Console\Commands;

use App\Services\UserTokenRevocationService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('users:revoke-tokens {user : ログイン情報をすべて無効にする利用者ID}')]
#[Description('指定した利用者の全端末のログイン情報を無効にする（D-78）')]
class RevokeUserTokens extends Command
{
    public function handle(UserTokenRevocationService $service): int
    {
        $id = $this->argument('user');
        // C-02：IDを曖昧に数値へ変換せず、ほかのID入力と同じ安全な整数範囲で受け取る。
        $userId = preg_match('/^[1-9][0-9]*$/D', $id)
            ? filter_var($id, FILTER_VALIDATE_INT, ['options' => ['max_range' => 9007199254740991]])
            : false;

        if ($userId === false) {
            $this->error('有効な利用者IDを指定してください。');

            return self::FAILURE;
        }

        try {
            $count = $service->revoke($userId);
        } catch (Throwable) {
            // 例外のSQLには認証情報が含まれ得るため、詳細を標準出力へ出さない。
            $this->error('ログイン情報の無効化に失敗しました。データベースの接続と実行環境を確認してください。');

            return self::FAILURE;
        }

        if ($count === null) {
            $this->error('利用者が見つかりません。');

            return self::FAILURE;
        }

        $this->info("利用者ID {$userId} のログイン情報を{$count}件無効にしました。");

        return self::SUCCESS;
    }
}
