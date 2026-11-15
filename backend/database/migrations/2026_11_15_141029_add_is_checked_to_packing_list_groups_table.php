<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_list_groups', function (Blueprint $table) {
            // D-106：持ち物がない間だけ使うチェックを保存する。
            $table->boolean('is_checked')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('packing_list_groups', function (Blueprint $table) {
            $table->dropColumn('is_checked');
        });
    }
};
