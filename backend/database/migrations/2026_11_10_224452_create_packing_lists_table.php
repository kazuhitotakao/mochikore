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
        Schema::create('packing_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // D-52：使用中のカテゴリーは削除できないようにする
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->string('title', 50);
            $table->text('description')->nullable();
            $table->boolean('is_public')->default(false);
            // D-22：元のリストを消してもコピー先は残し、元のIDだけ空にする
            $table->foreignId('source_list_id')->nullable()->constrained('packing_lists')->nullOnDelete();
            $table->timestamp('moderated_at')->nullable();
            // D-54・D-59：分類の保存と一括追加の競合を見つけるため、グループ画面を作る前から持たせる
            $table->unsignedBigInteger('grouping_revision')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packing_lists');
    }
};
