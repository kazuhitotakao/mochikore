<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // D-121：共同編集の招待リンクから会員登録した人の、招待リンクの文字（32文字の英数字）。
            // メール認証が済んだときに招待の画面へ進めるために覚え、認証が済んだら消す。ふだんは NULL
            $table->string('pending_invite_token', 32)->nullable()->after('display_name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pending_invite_token');
        });
    }
};
