<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // D-119：共同編集のメンバーに見せる名前（20文字まで）。入れるまでは NULL。
            // 公開リストには出さない（D-32）ので、Laravel 標準の name とは別の列にする
            $table->string('display_name', 20)->nullable()->after('pending_email_requested_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('display_name');
        });
    }
};
