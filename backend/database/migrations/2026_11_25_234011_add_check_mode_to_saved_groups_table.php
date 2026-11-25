<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saved_groups', function (Blueprint $table) {
            // D-122：よく使うグループは、チェックの動き（normal・repeat）も覚える。今ある候補は normal
            $table->string('check_mode', 20)->default('normal')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('saved_groups', function (Blueprint $table) {
            $table->dropColumn('check_mode');
        });
    }
};
