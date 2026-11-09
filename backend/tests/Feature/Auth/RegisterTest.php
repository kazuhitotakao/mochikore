<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    public function test_メールアドレスとパスワードだけで登録でき、トークンと本人情報が返る(): void
    {
        $this->freezeTime();

        $response = $this->postJson('/api/register', [
            'email' => 'new@example.com',
            'password' => 'password1!',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email', 'email_verified_at', 'pending_email']]])
            ->assertJsonMissingPath('data.user.name')
            ->assertJsonPath('data.user.email', 'new@example.com')
            ->assertJsonPath('data.user.email_verified_at', null)
            ->assertJsonPath('data.user.pending_email', null);

        $user = User::where('email', 'new@example.com')->firstOrFail();

        // D-78：登録でもトークンを発行し、期限判定用の2つの日時を同時に記録する
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

    public function test_登録済みのアドレスでは登録せず、決めた文言で案内する(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/register', [
            'email' => 'taken@example.com',
            'password' => 'password1!',
        ])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'このメールアドレスはすでに登録されています。ログインするか、パスワードを再設定してください。',
                'code' => 'email_already_registered',
            ]);

        $this->assertDatabaseCount('users', 1);
    }

    #[DataProvider('invalidPasswords')]
    public function test_条件に合わないパスワードは入力エラーになる(string $password, string $message): void
    {
        $this->postJson('/api/register', [
            'email' => 'new@example.com',
            'password' => $password,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.password.0', $message);

        $this->assertDatabaseCount('users', 0);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function invalidPasswords(): array
    {
        return [
            '7文字' => ['pass12!', 'パスワードは8文字以上で入力してください。'],
            '73文字' => [str_repeat('a', 73), 'パスワードは72文字以内で入力してください。'],
            '全角文字' => ['ぱすわーど12345', 'パスワードは半角の英字・数字・記号で入力してください。'],
            '空白' => ['pass word1', 'パスワードは半角の英字・数字・記号で入力してください。'],
        ];
    }

    public function test_パスワードは8文字と72文字ちょうどなら登録できる(): void
    {
        $this->postJson('/api/register', ['email' => 'a@example.com', 'password' => 'Abc123!?'])
            ->assertCreated();

        $this->postJson('/api/register', ['email' => 'b@example.com', 'password' => str_repeat('a', 72)])
            ->assertCreated();
    }

    public function test_同じ接続元から1時間に11回目の登録は429になる(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $this->postJson('/api/register', [
                'email' => "user{$i}@example.com",
                'password' => 'password1!',
            ])->assertCreated();
        }

        $response = $this->postJson('/api/register', [
            'email' => 'user11@example.com',
            'password' => 'password1!',
        ]);

        $response->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests')
            ->assertJsonPath('message', 'しばらくしてから再度お試しください。');
        $this->assertGreaterThan(0, $response->json('retry_after'));
        $this->assertDatabaseMissing('users', ['email' => 'user11@example.com']);
    }
}
