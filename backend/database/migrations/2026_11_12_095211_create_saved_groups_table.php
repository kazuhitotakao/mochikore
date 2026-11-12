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
        // D-102：よく使うグループ。グループ名だけを、本人のカテゴリー別に保存する（saved_items と同じ形）
        Schema::create('saved_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            // 標準の照合順序では「はは」と「ぱぱ」が同じ名前と判定されるので、バイナリで比較する（D-66 と同じ）
            $table->string('name', 50)->collation('utf8mb4_bin');
            $table->timestamps();

            // D-102・C-05：同じ人・同じカテゴリーの同名は1件にする。同時に保存されても重複させない
            $table->unique(['user_id', 'category_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('saved_groups');
    }
};
