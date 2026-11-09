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
        Schema::table('users', function (Blueprint $table) {
            // D-32：名前は保存せず、users.id で利用者を管理する
            $table->dropColumn('name');

            // D-49：変更を確定するまで、新しいアドレスはログインに使わない
            $table->string('pending_email')->nullable()->after('email_verified_at');
            // D-49：60分の有効期限と再送1分の判定に使う
            $table->timestamp('pending_email_requested_at')->nullable()->after('pending_email');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pending_email', 'pending_email_requested_at']);
            $table->string('name')->after('id');
        });
    }
};
