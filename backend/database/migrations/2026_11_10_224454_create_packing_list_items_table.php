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
        Schema::create('packing_list_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('packing_list_id')->constrained()->cascadeOnDelete();
            // D-56：NULLは未分類。グループを消しても持ち物は残し、削除済みの持ち物も含めて未分類にする
            $table->foreignId('group_id')->nullable()->constrained('packing_list_groups')->nullOnDelete();
            $table->string('name', 50);
            $table->boolean('is_checked')->default(false);
            // D-31：削除後に並べ替えたら、削除済みの持ち物の番号を空にして、復元時は末尾へ戻す
            $table->integer('sort_order')->nullable()->default(0);
            // D-35：同じ内容画面の間は同じidのまま戻せるよう、一時削除にする
            $table->softDeletes();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packing_list_items');
    }
};
