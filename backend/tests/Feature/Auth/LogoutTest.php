<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_ログアウトすると現在のトークンだけが使えなくなる(): void
    {
        $user = User::factory()->create();
        $auth = app(AuthService::class);
        $current = $auth->issueToken($user);
        $otherDevice = $auth->issueToken($user);

        $this->withToken($current)
            ->postJson('/api/logout')
            ->assertNoContent();

        // テスト内では認証済みの利用者が使い回されるので、次の通信の前に忘れさせる
        $this->app['auth']->forgetGuards();

        $this->withToken($current)
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');

        $this->app['auth']->forgetGuards();

        $this->withToken($otherDevice)
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_未ログインでは401になる(): void
    {
        $this->postJson('/api/logout')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
