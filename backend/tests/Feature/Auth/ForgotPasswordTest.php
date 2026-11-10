<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * API-20・SC-14・テスト16（D-40・D-41・D-93、09_バリデーション V-16・V-01・C-07）
 */
class ForgotPasswordTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();
        $this->freezeSecond();
    }

    public function test_登録済みのアドレスへ、新しいパスワードの設定画面を開く日本語の再設定メールを送る(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])
            ->assertNoContent();

        $mail = $this->sentMail($user);
        $this->assertSame('【もちこれ】パスワードの再設定', $mail->subject);
        $this->assertSame('パスワードを再設定する', $mail->actionText);

        // リンク先はNext.jsのSC-15。tokenとメールアドレスを渡す
        $this->assertStringStartsWith(config('app.frontend_url').'/reset-password?', $mail->actionUrl);
        parse_str((string) parse_url($mail->actionUrl, PHP_URL_QUERY), $query);
        $this->assertSame(['token', 'email'], array_keys($query));
        $this->assertSame('user@example.com', $query['email']);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'user@example.com']);
    }

    public function test_登録の有無と60秒の再送待ちで、応答を変えない(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        $registered = $this->postJson('/api/forgot-password', ['email' => 'user@example.com']);
        $waiting = $this->postJson('/api/forgot-password', ['email' => 'user@example.com']);
        $unregistered = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com']);

        // D-93：正しい入力の受付は、どれも本文なしの204
        foreach ([$registered, $waiting, $unregistered] as $response) {
            $response->assertNoContent();
            $this->assertSame('', $response->getContent());
        }

        // 実際に送るのは、登録済みで再送待ちでない1回だけ
        Notification::assertSentToTimes($user, ResetPassword::class, 1);
        Notification::assertCount(1);
    }

    public function test_60秒たてば、同じアドレスへ送り直せる(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertNoContent();

        $this->travel(59)->seconds();
        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertNoContent();
        Notification::assertSentToTimes($user, ResetPassword::class, 1);

        $this->travel(2)->seconds();
        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertNoContent();
        Notification::assertSentToTimes($user, ResetPassword::class, 2);
    }

    public function test_メールアドレスは会員登録と同じ前処理をしてから探す(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/forgot-password', ['email' => "\u{3000} USER@Example.COM\t"])
            ->assertNoContent();

        Notification::assertSentToTimes($user, ResetPassword::class, 1);
    }

    #[DataProvider('invalidEmails')]
    public function test_条件に合わないメールアドレスは1項目1文の入力エラーになり、送らない(mixed $email, string $message): void
    {
        User::factory()->create(['email' => 'user@example.com']);

        $this->postJson('/api/forgot-password', ['email' => $email])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.email', [$message]);

        Notification::assertNothingSent();
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
            'null' => [null, 'メールアドレスを入力してください。'],
            '文字列でない' => [12345, 'メールアドレスを文字で入力してください。'],
            '配列' => [['user@example.com'], 'メールアドレスを文字で入力してください。'],
            '形式違い' => ['abc', '正しいメールアドレスを入力してください。'],
            '256文字' => [str_repeat('a', 244).'@example.com', 'メールアドレスは255文字以内で入力してください。'],
        ];
    }

    public function test_同じ接続元から1時間に11回目は429になり、入力不正も回数に含める(): void
    {
        // D-41：登録の有無が分からないよう、正しい入力も入力不正も同じように数える
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/forgot-password', ['email' => 'abc'])->assertUnprocessable();
            $this->postJson('/api/forgot-password', ['email' => "user{$i}@example.com"])->assertNoContent();
        }

        $response = $this->postJson('/api/forgot-password', ['email' => 'user11@example.com']);

        $response->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests')
            ->assertJsonPath('message', 'しばらくしてから再度お試しください。');
        $this->assertGreaterThan(0, $response->json('retry_after'));

        $this->travel(1)->hours();
        $this->postJson('/api/forgot-password', ['email' => 'user11@example.com'])->assertNoContent();
    }

    public function test_再設定メールの回数は、会員登録の回数と別に数える(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $this->postJson('/api/forgot-password', ['email' => "user{$i}@example.com"])->assertNoContent();
        }

        $this->postJson('/api/register', ['email' => 'new@example.com', 'password' => 'password1!'])
            ->assertCreated();
    }

    private function sentMail(User $user): MailMessage
    {
        $notification = Notification::sent($user, ResetPassword::class)->last();

        return $notification->toMail($user);
    }
}
