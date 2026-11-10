<?php

namespace Tests\Feature\Auth;

use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TokenLifetimeTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        // DBの日時は秒までなので、秒の頭で時間を止めて比べられるようにする
        $this->freezeSecond();
        $this->token = app(AuthService::class)->issueToken(User::factory()->create());
    }

    public function test_最後の操作から180日たつと再ログインになる(): void
    {
        $this->travel(180)->days();
        $this->travel(-1)->seconds();
        $this->me()->assertOk();

        $this->travel(1)->seconds();
        $this->me()
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }

    public function test_利用者の操作の印がある通信だけ、180日の期限が延びる(): void
    {
        // 印のない通信（先読み・自動の通信）では延びない
        $this->travel(100)->days();
        $this->me()->assertOk();
        $this->assertTrue($this->storedToken()->last_activity_at->equalTo(now()->subDays(100)));

        // 印のある通信（画面を開く・操作する）で、最後の操作日時が今に進む
        $this->me(userActivity: true)->assertOk();
        $this->assertTrue($this->storedToken()->last_activity_at->equalTo(now()));

        // 最初のログインからは200日だが、最後の操作からは100日なので使える
        $this->travel(100)->days();
        $this->me()->assertOk();
    }

    public function test_操作を続けても、最初のログインから365日で再ログインになる(): void
    {
        $firstLoginAt = $this->storedToken()->first_login_at->copy();

        foreach ([100, 100, 100, 64] as $days) {
            $this->travel($days)->days();
            $this->me(userActivity: true)->assertOk();
        }

        // D-74：トークンは更新しないので、最初のログイン日時は変わらない
        $this->assertTrue($this->storedToken()->first_login_at->equalTo($firstLoginAt));

        // 最後の操作から1日しかたっていなくても、最初のログインから365日で使えなくなる
        $this->travel(1)->days();
        $this->me(userActivity: true)->assertUnauthorized();
    }

    public function test_期限切れのトークンは、印を付けて送っても延長されない(): void
    {
        $this->travel(181)->days();

        $this->me(userActivity: true)->assertUnauthorized();
        $this->assertTrue($this->storedToken()->last_activity_at->equalTo(now()->subDays(181)));
    }

    public function test_last_used_atが新しくても、最後の操作日時で判定する(): void
    {
        // D-36：Sanctum標準の last_used_at は、自動の通信でも更新されるので判定に使わない
        $this->travel(181)->days();
        $this->storedToken()->forceFill(['last_used_at' => now()])->save();

        $this->me()->assertUnauthorized();
    }

    private function me(bool $userActivity = false): TestResponse
    {
        // テストでは認証済みの利用者が使い回されるので、通信ごとにトークンを確かめ直す
        $this->app['auth']->forgetGuards();

        return $this->withToken($this->token)
            ->withHeaders($userActivity ? ['X-User-Activity' => '1'] : [])
            ->getJson('/api/me');
    }

    private function storedToken(): PersonalAccessToken
    {
        return PersonalAccessToken::query()->sole();
    }
}
