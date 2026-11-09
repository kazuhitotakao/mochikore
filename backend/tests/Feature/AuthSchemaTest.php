<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuthSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_usersは名前を持たず、メール変更用の項目を持つ(): void
    {
        // D-32：名前は保存しない。トークン認証なのでセッション用の remember_token も使わない
        $this->assertFalse(Schema::hasColumn('users', 'name'));
        $this->assertFalse(Schema::hasColumn('users', 'remember_token'));

        $this->assertTrue(Schema::hasColumns('users', [
            'email',
            'password',
            'email_verified_at',
            'pending_email',
            'pending_email_requested_at',
        ]));
    }

    public function test_トークンは期限判定用の日時を持つ(): void
    {
        // D-36・D-74：last_used_at ではなく、この2項目で180日・1年を判定する
        $this->assertTrue(Schema::hasColumns('personal_access_tokens', [
            'first_login_at',
            'last_activity_at',
        ]));
    }
}
