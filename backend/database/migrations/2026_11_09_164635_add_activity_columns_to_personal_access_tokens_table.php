<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            // D-36・D-74：last_used_at は自動通信でも更新されるので、期限の判定には使わない。
            // 最長1年は発行時の日時、180日は利用者の操作の日時で判定する
            $table->timestamp('first_login_at')->after('last_used_at');
            $table->timestamp('last_activity_at')->after('first_login_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn(['first_login_at', 'last_activity_at']);
        });
    }
};
