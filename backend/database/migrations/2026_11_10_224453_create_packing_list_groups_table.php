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
        Schema::create('packing_list_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('packing_list_id')->constrained()->cascadeOnDelete();
            // D-57：同じリスト内の同名は、空白除去後の完全一致でサーバーが判定する。DBの一意制約にはしない
            $table->string('name', 50);
            $table->unsignedInteger('sort_order');
            $table->timestamps();

            $table->index(['packing_list_id', 'sort_order']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packing_list_groups');
    }
};
