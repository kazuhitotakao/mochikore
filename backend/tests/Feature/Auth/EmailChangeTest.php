<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use App\Services\EmailChangeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

class EmailChangeTest extends TestCase
{
    use RefreshDatabase;

    private array $messages = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        Mail::shouldReceive('raw')->andReturnUsing(function (string $body, callable $callback): void {
            $message = new Message(new Email);
            $callback($message);
            $this->messages[] = ['body' => $body, 'to' => array_map(fn ($address) => $address->getAddress(), $message->getTo()), 'subject' => $message->getSubject()];
        })->byDefault();
    }

    public function test_現在のアドレスを保って変更を受け付け、新旧それぞれへ案内する(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, "\u{200B}NEXT@EXAMPLE.COM\u{3000}")->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame($user->email, $fresh->email);
        $this->assertSame('next@example.com', $fresh->pending_email);
        $this->assertTrue($fresh->pending_email_requested_at->equalTo(now()));
        $this->assertSame(['next@example.com'], $this->messages[0]['to']);
        $this->assertSame([$user->email], $this->messages[1]['to']);
        $link = $this->link($fresh);
        $this->assertTrue(str_starts_with($link, config('app.frontend_url').'/account/email?'));
        $this->assertFalse(str_contains($link, explode('|', $token)[1]));
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $this->assertSame(['id', 'hash', 'expires', 'signature'], array_keys($query));
        $this->assertSame(now()->addHour()->getTimestamp(), (int) $query['expires']);
    }

    public function test_登録済みの変更先も204で受け付け、確認メールを送らず旧アドレスへ受付を通知する(): void
    {
        $user = $this->user();
        $other = User::factory()->create();
        $this->send($this->token($user), $other->email)->assertNoContent();

        $this->assertSame($other->email, $user->fresh()->pending_email);
        $this->assertCount(1, $this->messages);
        $this->assertSame([$user->email], $this->messages[0]['to']);
        $this->assertSame('【もちこれ】メールアドレス変更の受付', $this->messages[0]['subject']);
    }

    public function test_未ログインは401、メール未認証は403になる(): void
    {
        $this->postJson('/api/me/email-change', ['pending_email' => 'next@example.com', 'password' => 'Password1!'])
            ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        $this->postJson('/api/me/email-change/confirm')->assertUnauthorized();

        $user = User::factory()->unverified()->create(['password' => 'Password1!']);
        $token = $this->token($user);
        $this->send($token, 'next@example.com')->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->asToken($token)->postJson('/api/me/email-change/confirm')
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertNull($user->fresh()->pending_email);
        $this->assertSame([], $this->messages);
    }

    #[DataProvider('invalidInputs')]
    public function test_入力条件と文言を守り、不正な入力を保存しない(mixed $email, mixed $password, string $field, string $message): void
    {
        $user = $this->user();
        $this->send($this->token($user), $email, $password)->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')->assertJsonPath('errors.'.$field.'.0', $message);
        $this->assertNull($user->fresh()->pending_email);
        $this->assertSame([], $this->messages);
    }

    public static function invalidInputs(): array
    {
        return [
            'empty email' => ['', 'Password1!', 'pending_email', 'メールアドレスを入力してください。'],
            'null email' => [null, 'Password1!', 'pending_email', 'メールアドレスを入力してください。'],
            'numeric email' => [123, 'Password1!', 'pending_email', 'メールアドレスを文字で入力してください。'],
            'empty array email' => [[], 'Password1!', 'pending_email', 'メールアドレスを入力してください。'],
            'array email' => [[1], 'Password1!', 'pending_email', 'メールアドレスを文字で入力してください。'],
            'bad email' => ['abc', 'Password1!', 'pending_email', '正しいメールアドレスを入力してください。'],
            '256 email' => [str_repeat('a', 245).'@example.co', 'Password1!', 'pending_email', 'メールアドレスは255文字以内で入力してください。'],
            'empty password' => ['next@example.com', '', 'password', 'パスワードを入力してください。'],
            'null password' => ['next@example.com', null, 'password', 'パスワードを入力してください。'],
            'numeric password' => ['next@example.com', 12345678, 'password', 'パスワードを文字で入力してください。'],
            'empty array password' => ['next@example.com', [], 'password', 'パスワードを入力してください。'],
            'array password' => ['next@example.com', [1], 'password', 'パスワードを文字で入力してください。'],
            '7 password' => ['next@example.com', '1234567', 'password', 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。'],
            '73 password' => ['next@example.com', str_repeat('a', 73), 'password', 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。'],
            'password with spaces' => ['next@example.com', ' Password1! ', 'password', 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。'],
            'full width password' => ['next@example.com', 'Ｐassword1!', 'password', 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。'],
        ];
    }

    public function test_現在と同じアドレス、間違ったパスワード、未定義キーを拒否する(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, ' '.strtoupper($user->email).' ')->assertUnprocessable()
            ->assertJsonPath('errors.pending_email.0', '現在とは別のメールアドレスを入力してください。');
        $this->send($token, 'next@example.com', 'wrong-password')->assertUnprocessable()
            ->assertExactJson(['message' => 'パスワードが正しくありません。', 'code' => 'invalid_password']);
        $this->asToken($token)->postJson('/api/me/email-change', [
            'pending_email' => 'next@example.com', 'password' => 'Password1!', 'user_id' => 999,
        ])->assertUnprocessable()->assertJsonPath('errors.user_id.0', 'この項目は送信できません。');
        $this->assertNull($user->fresh()->pending_email);
    }

    public function test_255文字のアドレスと8文字または72文字のパスワードを受け付ける(): void
    {
        $email = str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 60).'.com';
        $this->assertSame(255, strlen($email));
        foreach ([8, 72] as $length) {
            $password = str_repeat('a', $length);
            $user = User::factory()->create(['password' => $password]);
            $this->send($this->token($user), $email, $password)->assertNoContent();
            $this->assertSame($email, $user->fresh()->pending_email);
        }
    }

    public function test_再送は本人ごとに60秒待ち、変更先や端末を変えても回避できない(): void
    {
        $user = $this->user();
        $first = $this->token($user);
        $second = $this->token($user);
        $this->send($first, 'next@example.com')->assertNoContent();
        $this->send($second, 'different@example.com')->assertTooManyRequests()->assertJsonPath('retry_after', 60);
        $this->travel(59)->seconds();
        $this->send($first, 'next@example.com')->assertTooManyRequests()->assertJsonPath('retry_after', 1);
        $this->travel(1)->seconds();
        $this->send($second, 'next@example.com')->assertNoContent();
    }

    public function test_同じ本人からの依頼は1時間10回までで、待機秒数を返す(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        for ($i = 0; $i < 10; $i++) {
            $this->send($token, 'next@example.com')->assertNoContent();
            $this->travel(60)->seconds();
        }
        $response = $this->send($this->token($user), 'next@example.com')->assertTooManyRequests()->assertJsonPath('code', 'too_many_requests');
        $this->assertGreaterThan(60, $response->json('retry_after'));
    }

    public function test_確定した端末だけを残し、旧メールの再設定情報を消して変更完了を通知する(): void
    {
        $user = $this->user();
        $oldEmail = $user->email;
        $token = $this->token($user);
        $otherDevice = $this->token($user);
        $other = $this->user();
        $otherToken = $this->token($other);
        DB::table('password_reset_tokens')->insert([
            ['email' => $oldEmail, 'token' => 'fixture', 'created_at' => now()],
            ['email' => $other->email, 'token' => 'other-fixture', 'created_at' => now()],
        ]);
        $this->send($token, 'next@example.com')->assertNoContent();
        $link = $this->link($user->fresh());
        // D-72：メールとは別ホストへのPOSTでも、相対署名を確かめる
        $this->asToken($token)->postJson('http://backend.internal'.$this->path($link))->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('next@example.com', $fresh->email);
        $this->assertNotNull($fresh->email_verified_at);
        $this->assertNull($fresh->pending_email);
        $this->assertTrue($fresh->pending_email_requested_at->equalTo(now()));
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $oldEmail]);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $other->email]);
        $this->asToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('data.email', 'next@example.com');
        $this->asToken($otherDevice)->getJson('/api/me')->assertUnauthorized();
        $this->asToken($otherToken)->getJson('/api/me')->assertOk();
        $this->assertSame([$oldEmail], $this->messages[2]['to']);
        $this->assertSame('【もちこれ】メールアドレス変更の完了', $this->messages[2]['subject']);
        $this->asToken($token)->postJson($this->path($link))->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->assertCount(3, $this->messages);
    }

    public function test_署名不正、期限切れ、別人のリンクでは確定しない(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, 'next@example.com')->assertNoContent();
        $path = $this->path($this->link($user->fresh()));
        $bad = preg_replace('/signature=[0-9a-f]+/', 'signature='.str_repeat('0', 64), $path);
        $this->asToken($token)->postJson($bad)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->asToken($this->token($this->user()))->postJson($path)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->travel(61)->minutes();
        $this->asToken($token)->postJson($path)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->assertSame($user->email, $user->fresh()->email);
        $this->assertSame('next@example.com', $user->fresh()->pending_email);
        $this->assertCount(2, $this->messages);
    }

    public function test_再送と変更先の変更で、それより前のリンクを無効にする(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, 'first@example.com')->assertNoContent();
        $first = $this->path($this->link($user->fresh()));
        $this->travel(60)->seconds();
        $this->send($token, 'second@example.com')->assertNoContent();
        $second = $this->path($this->link($user->fresh()));
        $this->asToken($token)->postJson($first)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->travel(60)->seconds();
        $this->send($token, 'second@example.com')->assertNoContent();
        $this->asToken($token)->postJson($second)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->asToken($token)->postJson($this->path($this->link($user->fresh())))->assertNoContent();
    }

    public function test_確定後も直近の依頼から60秒あけ、過去と同じ変更先へのリンクを再利用させない(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, 'next@example.com')->assertNoContent();
        $oldLink = $this->path($this->link($user->fresh()));
        $this->asToken($token)->postJson($oldLink)->assertNoContent();
        $this->send($token, $user->email)->assertTooManyRequests()->assertJsonPath('retry_after', 60);
        $this->travel(60)->seconds();
        $this->send($token, $user->email)->assertNoContent();
        $this->asToken($token)->postJson($this->path($this->link($user->fresh())))->assertNoContent();
        $this->send($token, 'next@example.com')->assertTooManyRequests()->assertJsonPath('retry_after', 60);
        $this->travel(60)->seconds();
        $this->send($token, 'next@example.com')->assertNoContent();
        $this->asToken($token)->postJson($oldLink)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->asToken($token)->postJson($this->path($this->link($user->fresh())))->assertNoContent();
    }

    public function test_依頼後に変更先が登録された場合はリンク不正として全体を保持する(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $otherToken = $this->token($user);
        $this->send($token, 'next@example.com')->assertNoContent();
        $path = $this->path($this->link($user->fresh()));
        User::factory()->create(['email' => 'next@example.com']);
        $this->asToken($token)->postJson($path)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->assertSame($user->email, $user->fresh()->email);
        $this->assertSame('next@example.com', $user->fresh()->pending_email);
        $this->asToken($otherToken)->getJson('/api/me')->assertOk();
        $this->assertCount(2, $this->messages);
    }

    public function test_リンク値の本文への混入は保存せず、リンク値の欠落は不正リンクとして扱う(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, 'next@example.com')->assertNoContent();
        $path = $this->path($this->link($user->fresh()));
        $this->asToken($token)->postJson($path, ['email' => 'injected@example.com'])
            ->assertUnprocessable()->assertJsonPath('code', 'validation_error')->assertJsonPath('errors.email.0', 'この項目は送信できません。');
        $missing = URL::temporarySignedRoute('email-change.confirm', now()->addHour(), ['hash' => 'missing-id'], absolute: false);
        $this->asToken($token)->postJson($missing)->assertUnprocessable()->assertJsonPath('code', 'link_invalid');
        $this->assertSame($user->email, $user->fresh()->email);
    }

    public function test_メール送信が失敗しても受付済みの依頼を204で返し、旧メールへの通知も試みる(): void
    {
        Mail::shouldReceive('raw')->twice()->andThrow(new \RuntimeException('mail unavailable'));
        $user = $this->user();
        $this->send($this->token($user), 'next@example.com')->assertNoContent();
        $this->assertSame('next@example.com', $user->fresh()->pending_email);
        $this->assertSame($user->email, $user->fresh()->email);
    }

    public function test_完了通知が失敗しても確定済みの変更を204で返す(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->send($token, 'next@example.com')->assertNoContent();
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('mail unavailable'));
        $this->asToken($token)->postJson($this->path($this->link($user->fresh())))->assertNoContent();
        $this->assertSame('next@example.com', $user->fresh()->email);
        $this->assertNull($user->fresh()->pending_email);
    }

    private function user(): User
    {
        return User::factory()->create(['password' => 'Password1!']);
    }

    private function token(User $user): string
    {
        return app(AuthService::class)->issueToken($user);
    }

    private function asToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function send(string $token, mixed $pendingEmail, mixed $password = 'Password1!'): TestResponse
    {
        return $this->asToken($token)->postJson('/api/me/email-change', ['pending_email' => $pendingEmail, 'password' => $password]);
    }

    private function link(User $user): string
    {
        return app(EmailChangeService::class)->confirmationUrl($user);
    }

    private function path(string $link): string
    {
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);

        return '/api/me/email-change/confirm?'.http_build_query([
            'expires' => $query['expires'], 'hash' => $query['hash'], 'id' => $query['id'], 'signature' => $query['signature'],
        ]);
    }
}
