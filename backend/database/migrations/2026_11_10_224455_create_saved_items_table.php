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
        Schema::create('saved_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            // D-66：標準の照合順序では「はは」と「ぱぱ」が同じ名前と判定されるので、バイナリで比較する
            $table->string('name', 50)->collation('utf8mb4_bin');
            $table->timestamps();

            // D-66・C-05：同じ人・同じカテゴリーの同名は1件にする。同時に保存されても重複させない
            $table->unique(['user_id', 'category_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('saved_items');
    }
};
