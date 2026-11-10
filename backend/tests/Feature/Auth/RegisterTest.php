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

    public function test_メールアドレスは標準の変換で前後の空白を除き、英字を小文字にして保存する(): void
    {
        // C-01：導入版の標準（TrimStrings）は、NBSP・ゼロ幅スペース・全角スペースなども前後から削る
        $this->postJson('/api/register', [
            'email' => "\u{200B}\u{00A0}\u{3000} User@Example.COM\t\r\n\u{FEFF}",
            'password' => 'password1!',
        ])
            ->assertCreated()
            ->assertJsonPath('data.user.email', 'user@example.com');

        $this->assertDatabaseHas('users', ['email' => 'user@example.com']);
    }

    public function test_大文字と小文字だけが違うアドレスは登録済みとして扱う(): void
    {
        User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/register', [
            'email' => 'USER@example.com',
            'password' => 'password1!',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'email_already_registered');

        $this->assertDatabaseCount('users', 1);
    }

    #[DataProvider('invalidEmails')]
    public function test_条件に合わないメールアドレスは1項目1文の入力エラーになる(mixed $email, string $message): void
    {
        $this->postJson('/api/register', [
            'email' => $email,
            'password' => 'password1!',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.email', [$message]);

        $this->assertDatabaseCount('users', 0);
    }

    /**
     * V-01・C-04の確認例
     *
     * @return array<string, array{mixed, string}>
     */
    public static function invalidEmails(): array
    {
        return [
            '空欄' => ['', 'メールアドレスを入力してください。'],
            // 標準で空文字になり、さらにnullになるので必須のエラーにする
            '空白だけ' => [" \u{3000}\t\u{00A0}\u{200B}", 'メールアドレスを入力してください。'],
            'null' => [null, 'メールアドレスを入力してください。'],
            '文字列でない' => [12345, 'メールアドレスを文字で入力してください。'],
            '形式違い' => ['abc', '正しいメールアドレスを入力してください。'],
            '256文字' => [str_repeat('a', 244).'@example.com', 'メールアドレスは255文字以内で入力してください。'],
        ];
    }

    #[DataProvider('invalidPasswords')]
    public function test_条件に合わないパスワードは1項目1文の入力エラーになる(mixed $password, string $message): void
    {
        $this->postJson('/api/register', [
            'email' => 'new@example.com',
            'password' => $password,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.password', [$message]);

        $this->assertDatabaseCount('users', 0);
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
            // パスワードは削らないが、Laravel標準のrequiredは半角スペース・タブ・改行だけの文字列を未入力とみなす
            '半角スペースだけ' => ['   ', 'パスワードを入力してください。'],
            '全角スペースだけ' => ["\u{3000}", $rule],
            '文字列でない' => [12345678, 'パスワードを文字で入力してください。'],
            '7文字' => ['pass12!', $rule],
            '73文字' => [str_repeat('a', 73), $rule],
            '全角文字' => ['ぱすわーど12345', $rule],
            '途中の空白' => ['pass word1', $rule],
            // パスワードは標準の空白削除の対象外なので、前後の空白も削らずに入力エラーにする
            '前後の空白' => [' password1 ', $rule],
            '前後のNBSP' => ["\u{00A0}password1\u{00A0}", $rule],
            '前後のゼロ幅スペース' => ["\u{200B}password1", $rule],
            '改行' => ["password1\n", $rule],
            'タブ' => ["\tpassword1", $rule],
        ];
    }

    public function test_パスワードは8文字と72文字ちょうど・英字だけ・数字だけ・記号だけでも登録できる(): void
    {
        // V-02：文字種の組み合わせは求めない
        $passwords = ['Abc123!?', str_repeat('a', 72), 'abcdefgh', '12345678', '!@#$%^&*'];

        foreach ($passwords as $i => $password) {
            $this->postJson('/api/register', ['email' => "user{$i}@example.com", 'password' => $password])
                ->assertCreated();
        }
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
