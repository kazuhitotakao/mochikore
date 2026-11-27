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
        Schema::table('packing_list_items', function (Blueprint $table) {
            // D-130：チェックを付けた人。外したら null。退会したら null にし、持ち物とチェックは残す
            $table->foreignId('checked_by')->nullable()->after('is_checked')->constrained('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('packing_list_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('checked_by');
        });
    }
};
