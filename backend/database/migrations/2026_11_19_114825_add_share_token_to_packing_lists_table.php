<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_lists', function (Blueprint $table) {
            // D-114：限定公開のリンクに使う、推測できない32文字の英数字。リンクがないときは NULL
            $table->string('share_token', 32)->nullable()->unique()->after('moderated_at');
        });
    }

    public function down(): void
    {
        Schema::table('packing_lists', function (Blueprint $table) {
            $table->dropUnique(['share_token']);
            $table->dropColumn('share_token');
        });
    }
};
