<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * API-21・SC-15・テスト15・17（09_バリデーション V-16・V-01・V-02・C-04）
 */
class ResetPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const LINK_INVALID = [
        'message' => 'リンクの有効期限が切れているか、すでに使われています。',
        'code' => 'link_invalid',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
    }

    public function test_リンクの値で新しいパスワードに変わり、古いパスワードと全端末のログイン情報が使えなくなる(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => 'old-password1']);
        // テスト17-02：変更前から2端末でログインしている
        $tokens = [$this->tokenFor($user), $this->tokenFor($user)];
        $resetToken = Password::createToken($user);

        $this->postJson('/api/reset-password', [
            'token' => $resetToken,
            'email' => 'user@example.com',
            'password' => 'new-password1',
        ])->assertNoContent();

        $this->assertTrue(Hash::check('new-password1', $user->fresh()->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
        // 1回限り：使ったリンクの情報は残さない
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'user@example.com']);

        foreach ($tokens as $token) {
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        }

        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'old-password1'])
            ->assertJsonPath('code', 'invalid_credentials');
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'new-password1'])
            ->assertOk();
    }

    public function test_メール未認証のまま再設定しても、認証済みにはならない(): void
    {
        // テスト17-03
        $user = User::factory()->unverified()->create();

        $this->postJson('/api/reset-password', [
            'token' => Password::createToken($user),
            'email' => $user->email,
            'password' => 'new-password1',
        ])->assertNoContent();

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_使用済みのリンクでは再設定できない(): void
    {
        // テスト15-03
        $user = User::factory()->create();
        $resetToken = Password::createToken($user);

        $this->postJson('/api/reset-password', [
            'token' => $resetToken,
            'email' => $user->email,
            'password' => 'new-password1',
        ])->assertNoContent();

        $this->postJson('/api/reset-password', [
            'token' => $resetToken,
            'email' => $user->email,
            'password' => 'other-password1',
        ])
            ->assertUnprocessable()
            ->assertExactJson(self::LINK_INVALID);

        $this->assertTrue(Hash::check('new-password1', $user->fresh()->password));
    }

    public function test_送信から60分を過ぎたリンクでは再設定できない(): void
    {
        // テスト15-04
        $user = User::factory()->create(['password' => 'old-password1']);
        $resetToken = Password::createToken($user);

        $this->travel(61)->minutes();

        $this->postJson('/api/reset-password', [
            'token' => $resetToken,
            'email' => $user->email,
            'password' => 'new-password1',
        ])
            ->assertUnprocessable()
            ->assertExactJson(self::LINK_INVALID);

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
    }

    public function test_違うtoken・別の利用者のtoken・未登録のメールは、同じ422になる(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => 'old-password1']);
        $other = User::factory()->create(['email' => 'other@example.com']);
        $resetToken = Password::createToken($user);
        $otherToken = Password::createToken($other);

        $cases = [
            '違うtoken' => [$resetToken.'x', 'user@example.com'],
            '別の利用者のtoken' => [$otherToken, 'user@example.com'],
            // 登録の有無が分からないよう、未登録のメールも同じ応答にする
            '未登録のメール' => [$resetToken, 'nobody@example.com'],
        ];

        foreach ($cases as $case => [$token, $email]) {
            $this->postJson('/api/reset-password', [
                'token' => $token,
                'email' => $email,
                'password' => 'new-password1',
            ])
                ->assertUnprocessable()
                ->assertExactJson(self::LINK_INVALID);
        }

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
    }

    public function test_tokenは前後の空白を削らずに照合する(): void
    {
        // V-16：tokenは標準の空白削除の対象外。削ると、違う値でも通ってしまう
        $user = User::factory()->create();
        $resetToken = Password::createToken($user);

        $this->postJson('/api/reset-password', [
            'token' => " {$resetToken}\n",
            'email' => $user->email,
            'password' => 'new-password1',
        ])
            ->assertUnprocessable()
            ->assertExactJson(self::LINK_INVALID);
    }

    public function test_メールアドレスは会員登録と同じ前処理をしてから照合する(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/reset-password', [
            'token' => Password::createToken($user),
            'email' => "\u{3000}USER@Example.COM ",
            'password' => 'new-password1',
        ])->assertNoContent();

        $this->assertTrue(Hash::check('new-password1', $user->fresh()->password));
    }

    #[DataProvider('invalidTokens')]
    public function test_tokenがない・空・文字列でないときは、リンクを開き直す入力エラーになる(array $input): void
    {
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => 'old-password1']);
        Password::createToken($user);

        $this->postJson('/api/reset-password', $input + [
            'email' => 'user@example.com',
            'password' => 'new-password1',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.token', ['再設定用のリンクを開き直してください。']);

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
    }

    /**
     * C-04：tokenの省略・空文字・型違い
     *
     * @return array<string, array{array<string, mixed>}>
     */
    public static function invalidTokens(): array
    {
        return [
            '省略' => [[]],
            '空欄' => [['token' => '']],
            'null' => [['token' => null]],
            '数値' => [['token' => 12345]],
            '配列' => [['token' => ['abc']]],
        ];
    }

    #[DataProvider('invalidPasswords')]
    public function test_条件に合わない新しいパスワードは入力エラーになり、リンクは使えるまま残る(mixed $password, string $message): void
    {
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => 'old-password1']);
        $resetToken = Password::createToken($user);

        $this->postJson('/api/reset-password', [
            'token' => $resetToken,
            'email' => 'user@example.com',
            'password' => $password,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.password', [$message]);

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
        $this->assertTrue(Password::tokenExists($user, $resetToken));
    }

    /**
     * V-02・C-04の確認例
     *
     * @return array<string, array{mixed, string}>
     */
    public static function invalidPasswords(): array
    {
        $rule = 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。';

        return [
            '空欄' => ['', 'パスワードを入力してください。'],
            '文字列でない' => [12345678, 'パスワードを文字で入力してください。'],
            '7文字' => ['pass12!', $rule],
            '73文字' => [str_repeat('a', 73), $rule],
            '全角文字' => ['ぱすわーど12345', $rule],
            '途中の空白' => ['pass word1', $rule],
            '前後の空白' => [' password1 ', $rule],
            '改行' => ["password1\n", $rule],
        ];
    }

    public function test_新しいパスワードは8文字と72文字ちょうどでも設定できる(): void
    {
        foreach (['Abc123!?', str_repeat('a', 72)] as $password) {
            $user = User::factory()->create();

            $this->postJson('/api/reset-password', [
                'token' => Password::createToken($user),
                'email' => $user->email,
                'password' => $password,
            ])->assertNoContent();

            $this->assertTrue(Hash::check($password, $user->fresh()->password));
        }
    }

    public function test_条件に合わないメールアドレスは入力エラーになる(): void
    {
        $this->postJson('/api/reset-password', [
            'token' => 'abc',
            'email' => 'abc',
            'password' => 'new-password1',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.email', ['正しいメールアドレスを入力してください。']);
    }

    private function tokenFor(User $user): string
    {
        return app(AuthService::class)->issueToken($user);
    }
}
