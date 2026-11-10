<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
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

    #[DataProvider('invalidInputs')]
    public function test_入力不正は認証せず、失敗回数にも数えない(array $input, string $field, string $message): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        // V-03：5回を超えて送っても、入力不正は失敗回数に数えない
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/login', $input)
                ->assertUnprocessable()
                ->assertJsonPath('code', 'validation_error')
                ->assertJsonPath("errors.{$field}", [$message]);
        }

        $this->assertSame(0, RateLimiter::attempts('user@example.com|127.0.0.1'));

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertOk();
    }

    /**
     * V-03（V-01・V-02と同じ条件）の確認例
     *
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidInputs(): array
    {
        $rule = 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。';

        return [
            'パスワードが半角スペースだけ' => [['email' => 'user@example.com', 'password' => '   '], 'password', 'パスワードを入力してください。'],
            'パスワード7文字' => [['email' => 'user@example.com', 'password' => 'pass12!'], 'password', $rule],
            'パスワード73文字' => [['email' => 'user@example.com', 'password' => str_repeat('a', 73)], 'password', $rule],
            // パスワードは空白を削らないので、前後に空白があれば条件違反になる
            'パスワードの前後の空白' => [['email' => 'user@example.com', 'password' => ' password1! '], 'password', $rule],
            'パスワードが文字列でない' => [['email' => 'user@example.com', 'password' => 12345678], 'password', 'パスワードを文字で入力してください。'],
            'メール形式違い' => [['email' => 'abc', 'password' => 'password1!'], 'email', '正しいメールアドレスを入力してください。'],
            'メール256文字' => [['email' => str_repeat('a', 244).'@example.com', 'password' => 'password1!'], 'email', 'メールアドレスは255文字以内で入力してください。'],
            'メールが文字列でない' => [['email' => 12345, 'password' => 'password1!'], 'email', 'メールアドレスを文字で入力してください。'],
        ];
    }

    public function test_形式が正しい認証不一致だけを数え、未登録のアドレスも数える(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        // 4回の認証不一致のあとに入力不正をはさんでも、回数は増えない
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password'])
                ->assertJsonPath('code', 'invalid_credentials');
        }
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'short'])
            ->assertJsonPath('code', 'validation_error');
        $this->assertSame(4, RateLimiter::attempts('user@example.com|127.0.0.1'));

        // 5回目の認証不一致で待機になる
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'wrong-password'])
            ->assertJsonPath('code', 'invalid_credentials');
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertTooManyRequests();

        // 形式が正しい未登録のアドレスも、同じ認証失敗として数える
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'password1!'])
                ->assertJsonPath('code', 'invalid_credentials');
        }
        $this->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'password1!'])
            ->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests');
    }

    public function test_登録と同じ前処理のメールで認証し、失敗回数も同じキーで数える(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password1!',
        ]);

        // 前後の空白（NBSP・ゼロ幅スペースを含む）や大小文字を変えても、制限を回避できない
        $variants = [
            'USER@example.com',
            ' user@example.com',
            "User@Example.Com\u{00A0}",
            "user@example.com\u{200B}",
            "\tuser@EXAMPLE.com\r\n",
        ];
        foreach ($variants as $email) {
            $this->postJson('/api/login', ['email' => $email, 'password' => 'wrong-password'])
                ->assertJsonPath('code', 'invalid_credentials');
        }

        $this->assertSame(5, RateLimiter::attempts('user@example.com|127.0.0.1'));
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertTooManyRequests();

        // 待機が終われば、前処理で同じ値になるアドレスでログインでき、回数も消える
        $this->travel(61)->seconds();
        $this->postJson('/api/login', ['email' => "\u{200B}\u{00A0} USER@Example.com\t", 'password' => 'password1!'])
            ->assertOk()
            ->assertJsonPath('data.user.email', 'user@example.com');
        $this->assertSame(0, RateLimiter::attempts('user@example.com|127.0.0.1'));
    }

    public function test_パスワードは大文字小文字を変換せずに照合する(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'Password1!',
        ]);

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password1!'])
            ->assertJsonPath('code', 'invalid_credentials');

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'Password1!'])
            ->assertOk();
    }
}
