<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\EnsureEmailIsVerified;
use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * 403 email_not_verified（D-19・D-54、02_画面配置 共通8、手順書第11章 手順9）。
 * 付けるAPI（リスト関連）は第13章で作るので、ここではテストの中だけのルートで確かめる。
 */
class EnsureEmailIsVerifiedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'auth:sanctum', EnsureEmailIsVerified::class])
            ->get('/api/testing/verified-only', fn () => response()->noContent());
        // 付ける順番を間違えても、未ログインは401のままになることを確かめる
        Route::middleware(['api', EnsureEmailIsVerified::class])
            ->get('/api/testing/verified-without-auth', fn () => response()->noContent());
    }

    public function test_メール認証済みなら通す(): void
    {
        $user = User::factory()->create();

        $this->withToken($this->tokenFor($user))
            ->getJson('/api/testing/verified-only')
            ->assertNoContent();
    }

    public function test_メール未認証なら403_email_not_verifiedを返す(): void
    {
        $user = User::factory()->unverified()->create();

        $this->withToken($this->tokenFor($user))
            ->getJson('/api/testing/verified-only')
            ->assertForbidden()
            ->assertExactJson([
                'message' => 'メール認証を済ませてください。',
                'code' => 'email_not_verified',
            ]);
    }

    public function test_未ログインなら403ではなく401を返す(): void
    {
        $this->getJson('/api/testing/verified-only')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');

        $this->getJson('/api/testing/verified-without-auth')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }

    private function tokenFor(User $user): string
    {
        return app(AuthService::class)->issueToken($user);
    }
}
