<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_lists', function (Blueprint $table) {
            // D-119：共同編集の招待リンクに使う、推測できない32文字の英数字。リンクがないときは NULL。
            // 見せるだけの限定公開のリンク（share_token、D-114）とは別に持つ
            $table->string('invite_token', 32)->nullable()->unique()->after('share_token');
            // 作ってから7日で切れる。期限は Laravel の now() で入れる
            $table->timestamp('invite_expires_at')->nullable()->after('invite_token');
        });
    }

    public function down(): void
    {
        Schema::table('packing_lists', function (Blueprint $table) {
            $table->dropUnique(['invite_token']);
            $table->dropColumn(['invite_token', 'invite_expires_at']);
        });
    }
};
