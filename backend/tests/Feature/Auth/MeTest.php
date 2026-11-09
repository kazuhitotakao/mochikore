<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeTest extends TestCase
{
    use RefreshDatabase;

    public function test_本人の情報だけを返す(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'user@example.com']);
        $token = app(AuthService::class)->issueToken($user);

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'id' => $user->id,
                    'email' => 'user@example.com',
                    'email_verified_at' => null,
                    'pending_email' => null,
                ],
            ]);
    }

    public function test_トークンがないか不正なときは401になる(): void
    {
        $expected = ['message' => 'ログインしてください。', 'code' => 'unauthenticated'];

        $this->getJson('/api/me')
            ->assertUnauthorized()
            ->assertExactJson($expected);

        $this->withToken('1|invalid-token')
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertExactJson($expected);
    }

    public function test_jsonを求めない通信でも、リダイレクトせず401を返す(): void
    {
        // Laravelにログイン画面はないので、標準のリダイレクト先（login）を探して500にならないこと
        $this->get('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
