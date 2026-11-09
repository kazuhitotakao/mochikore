<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_正しい情報でログインでき、トークンと本人情報が返る(): void
    {
        $this->freezeTime();
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.email', 'user@example.com')
            ->assertJsonMissingPath('data.user.name');

        // D-55：日時はUTC（末尾Z）で返す
        $this->assertStringEndsWith('Z', $response->json('data.user.email_verified_at'));

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'first_login_at' => now()->toDateTimeString(),
            'last_activity_at' => now()->toDateTimeString(),
        ]);

        $this->withToken($response->json('data.token'))
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    public function test_メール未認証でもログインでき、未認証であることが分かる(): void
    {
        User::factory()->unverified()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        // SC-02：画面は email_verified_at が空ならSC-04へ案内する
        $this->postJson('/api/login', [
            'email' => 'user@example.com',
            'password' => 'password1!',
        ])
            ->assertOk()
            ->assertJsonPath('data.user.email_verified_at', null);
    }

    public function test_パスワード違いと未登録のアドレスは同じ応答になる(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        $expected = [
            'message' => 'メールアドレスまたはパスワードが正しくありません。',
            'code' => 'invalid_credentials',
        ];

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertExactJson($expected);

        $this->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertExactJson($expected);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_同じメールアドレスと接続元で5回失敗すると、正しい情報でも429と残り秒数を返す(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password'])
                ->assertJsonPath('code', 'invalid_credentials');
        }

        $response = $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!']);

        $response->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests');
        $this->assertGreaterThan(0, $response->json('retry_after'));
        $this->assertLessThanOrEqual(60, $response->json('retry_after'));

        // D-37：1分たてば、もう一度ログインできる
        $this->travel(61)->seconds();

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertOk();
    }

    public function test_ログインに成功すると失敗回数が消える(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password']);
        }

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertOk();

        // 失敗回数が残っていれば、ここで5回目となり次が429になる
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password'])
                ->assertJsonPath('code', 'invalid_credentials');
        }

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertOk();
    }

    public function test_入力がないときは入力エラーになる(): void
    {
        $this->postJson('/api/login', [])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.email.0', 'メールアドレスを入力してください。')
            ->assertJsonPath('errors.password.0', 'パスワードを入力してください。');
    }
}
