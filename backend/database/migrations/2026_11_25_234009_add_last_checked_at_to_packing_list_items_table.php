<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_list_items', function (Blueprint $table) {
            // D-122：最後にチェックを付けた日時。繰り返し利用のグループで「前回」として出す。
            // 日時は Laravel の now() で入れる。チェックしたことがなければ NULL
            $table->timestamp('last_checked_at')->nullable()->after('is_checked');
            // 付けたその日のうちに外したとき、付ける前の日時へ戻すために1つ前を覚える
            $table->timestamp('previous_checked_at')->nullable()->after('last_checked_at');
        });
    }

    public function down(): void
    {
        Schema::table('packing_list_items', function (Blueprint $table) {
            $table->dropColumn(['last_checked_at', 'previous_checked_at']);
        });
    }
};
