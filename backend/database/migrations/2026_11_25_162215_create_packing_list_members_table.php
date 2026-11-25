<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // D-119：共同編集のメンバー（編集者）。所有者は packing_lists.user_id で持ち、この表には入れない
        Schema::create('packing_list_members', function (Blueprint $table) {
            $table->id();
            // リストを消す（所有者の退会を含む）と、メンバーも一緒に消える
            $table->foreignId('packing_list_id')->constrained()->cascadeOnDelete();
            // メンバーが退会すると、メンバーから外れる。足した持ち物はリストに残る
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // created_at が参加した日時
            $table->timestamps();

            // 同じ人が同じリストに2回参加しない
            $table->unique(['packing_list_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packing_list_members');
    }
};
