<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_list_groups', function (Blueprint $table) {
            // D-122：グループごとのチェックの動き。normal（チェックしたら隠す）か repeat（繰り返し利用）。
            // 今あるグループは、今までの動きのまま normal にする
            $table->string('check_mode', 20)->default('normal')->after('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('packing_list_groups', function (Blueprint $table) {
            $table->dropColumn('check_mode');
        });
    }
};
