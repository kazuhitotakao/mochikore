<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * D-127：表示名は会員登録で必ず入れるので、空のままの人をなくす。
     * それまでに登録した表示名のない人には仮の名前を入れる（アカウント設定でいつでも変えられる）。
     */
    public function up(): void
    {
        DB::table('users')->whereNull('display_name')->update(['display_name' => 'ユーザー']);

        Schema::table('users', function (Blueprint $table) {
            $table->string('display_name', 20)->nullable(false)->change();
        });
    }

    /**
     * 列だけを空にできる形へ戻す。仮の名前は、本人が入れた名前と見分けられないので戻さない。
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('display_name', 20)->nullable()->change();
        });
    }
};
