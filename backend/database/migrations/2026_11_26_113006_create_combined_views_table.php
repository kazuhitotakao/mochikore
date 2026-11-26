<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // D-124：自分専用のまとめ表示。名前だけを持ち、並べるリストは combined_view_lists に持つ
        Schema::create('combined_views', function (Blueprint $table) {
            $table->id();
            // 退会すると、本人のまとめ表示も一緒に消える
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // 同じ名前のまとめ表示も作れる（リスト名と同じ、D-30）
            $table->string('name', 50);
            // updated_at は自分のリスト一覧（SC-05）での並び順に使う
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('combined_views');
    }
};
