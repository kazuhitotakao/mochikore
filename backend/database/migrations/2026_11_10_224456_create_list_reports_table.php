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
        Schema::create('list_reports', function (Blueprint $table) {
            $table->id();
            // 通報者の情報は保存しないので、通報されたリストだけを持つ
            $table->foreignId('packing_list_id')->constrained()->cascadeOnDelete();
            $table->string('reason', 30);
            // D-47：未確認（NULL）の通報があるときだけ、1日1回通知する
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('list_reports');
    }
};
