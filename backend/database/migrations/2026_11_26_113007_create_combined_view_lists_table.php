<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // D-124：まとめ表示に並べるリストと順番。持ち物などは元のリストのまま持ち、ここには写さない
        Schema::create('combined_view_lists', function (Blueprint $table) {
            $table->id();
            // まとめ表示を消すと一緒に消える。リストは残る
            $table->foreignId('combined_view_id')->constrained()->cascadeOnDelete();
            // リストを消す（所有者の退会を含む）と、まとめ表示からも外れる
            $table->foreignId('packing_list_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order');
            $table->timestamps();

            // 同じリストを同じまとめ表示に2回入れない
            $table->unique(['combined_view_id', 'packing_list_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('combined_view_lists');
    }
};
