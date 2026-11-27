<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // D-128：本人の写真。1人1枚。ログインのたびに読む users に大きな値を入れないよう、別の表に持つ
        Schema::create('user_avatars', function (Blueprint $table) {
            // 退会・メール未認証の削除（D-09）で、写真も一緒に消える
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            // ブラウザで256px四方に作り直した JPEG（V-32、60KBまで）。BLOB の上限（64KB）に収まる
            $table->binary('image');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_avatars');
    }
};
