<?php

namespace Tests\Feature\Auth;

use App\Models\PackingList;
use App\Models\User;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();
        $this->freezeSecond();
    }

    public function test_登録すると、メール認証の案内画面を開く日本語の確認メールを送る(): void
    {
        $token = $this->postJson('/api/register', [
            'email' => 'new@example.com',
            'password' => 'password1!',
        ])->assertCreated()->json('data.token');

        $user = User::where('email', 'new@example.com')->sole();
        $mail = $this->sentMail($user);

        $this->assertSame('【もちこれ】メールアドレスの確認', $mail->subject);
        $this->assertSame('メールアドレスを確認する', $mail->actionText);

        // D-72：リンク先はNext.jsのSC-04。ログイン用のトークンはURLに入れない
        $this->assertStringStartsWith(config('app.frontend_url').'/verify-email?', $mail->actionUrl);
        parse_str((string) parse_url($mail->actionUrl, PHP_URL_QUERY), $query);
        $this->assertSame(['id', 'hash', 'expires', 'signature'], array_keys($query));
        $this->assertStringNotContainsString(explode('|', $token)[1], $mail->actionUrl);
    }

    public function test_招待リンクから登録した人には、認証のときに招待を1回だけ返して消す(): void
    {
        // D-121：メール認証の後に、共同編集への招待（SC-19）へ進める
        $token = $this->createInvite();
        $user = User::factory()->unverified()->create();
        $user->forceFill(['pending_invite_token' => $token])->save();
        $link = $this->apiPath($this->linkFor($user));

        $this->withToken($this->tokenFor($user))->getJson($link)
            ->assertOk()
            ->assertExactJson(['data' => ['invite_token' => $token]]);

        $user->refresh();
        $this->assertNotNull($user->email_verified_at);
        $this->assertNull($user->pending_invite_token);
        // もう一度開いても、招待の画面へは進めない
        $this->getJson($link)->assertOk()->assertExactJson(['data' => ['invite_token' => null]]);
        // 本人の情報には出さない
        $this->getJson('/api/me')->assertOk()->assertJsonMissingPath('data.pending_invite_token');
    }

    public function test_止められた・期限が切れた・存在しない招待は返さず、覚えていた値は消す(): void
    {
        $stopped = $this->createInvite();
        PackingList::where('invite_token', $stopped)->update(['invite_token' => null, 'invite_expires_at' => null]);
        $expired = $this->createInvite();
        PackingList::where('invite_token', $expired)->update(['invite_expires_at' => now()->subSecond()]);

        foreach ([$stopped, $expired, str_repeat('z', 32)] as $token) {
            $this->app['auth']->forgetGuards();
            $user = User::factory()->unverified()->create();
            $user->forceFill(['pending_invite_token' => $token])->save();

            $this->withToken($this->tokenFor($user))
                ->getJson($this->apiPath($this->linkFor($user)))
                ->assertOk()
                ->assertExactJson(['data' => ['invite_token' => null]]);

            $user->refresh();
            $this->assertNotNull($user->email_verified_at);
            $this->assertNull($user->pending_invite_token);
        }
    }

    public function test_リンクが無効なら、覚えていた招待は消さない(): void
    {
        $token = $this->createInvite();
        $user = User::factory()->unverified()->create();
        $user->forceFill(['pending_invite_token' => $token])->save();

        $this->withToken($this->tokenFor($user))
            ->getJson(str_replace('signature=', 'signature=x', $this->apiPath($this->linkFor($user))))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'link_invalid');

        // 確認メールを送り直して認証すれば、招待の画面へ進める
        $this->assertSame($token, $user->fresh()->pending_invite_token);
    }

    /**
     * 有効な招待リンクがあるリストを作り、その招待リンクの文字を返す。
     */
    private function createInvite(): string
    {
        $token = Str::random(PackingList::INVITE_TOKEN_LENGTH);
        // リストにはカテゴリーが要る（何度登録しても重複しない）
        $this->seed(CategorySeeder::class);
        PackingList::factory()->create()
            ->forceFill(['invite_token' => $token, 'invite_expires_at' => now()->addDays(7)])
            ->save();

        return $token;
    }

    public function test_確認メールのリンクで、本人のメール認証が完了する(): void
    {
        $user = User::factory()->unverified()->create();

        $this->withToken($this->tokenFor($user))
            ->getJson($this->apiPath($this->linkFor($user)))
            ->assertOk()
            // D-121：招待リンクから登録した人でなければ、招待は返さない
            ->assertExactJson(['data' => ['invite_token' => null]]);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_リンクとは別のホストで送っても、署名を確かめられる(): void
    {
        // Next.jsは backend:8000 などメールのリンクとは別のホストで送るので、署名にホストを含めない
        $user = User::factory()->unverified()->create();

        $this->withToken($this->tokenFor($user))
            ->getJson('http://backend.internal'.$this->apiPath($this->linkFor($user)))
            ->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_ログインしていないと401になる(): void
    {
        $user = User::factory()->unverified()->create();

        $this->getJson($this->apiPath($this->linkFor($user)))
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_署名を書き換えたリンクと期限切れのリンクは422になる(): void
    {
        $user = User::factory()->unverified()->create();
        $token = $this->tokenFor($user);
        $path = $this->apiPath($this->linkFor($user));
        $expected = ['message' => 'リンクの有効期限が切れているか、無効です。', 'code' => 'link_invalid'];

        $this->withToken($token)
            ->getJson(preg_replace('/signature=[0-9a-f]+/', 'signature='.str_repeat('0', 64), $path))
            ->assertUnprocessable()
            ->assertExactJson($expected);

        // D-19：リンクは送信から60分間だけ有効
        $this->travel(61)->minutes();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)
            ->getJson($path)
            ->assertUnprocessable()
            ->assertExactJson($expected);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_別の利用者のリンクは422になり、どちらも認証されない(): void
    {
        $me = User::factory()->unverified()->create();
        $other = User::factory()->unverified()->create();

        $this->withToken($this->tokenFor($me))
            ->getJson($this->apiPath($this->linkFor($other)))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'link_invalid');

        $this->assertNull($me->fresh()->email_verified_at);
        $this->assertNull($other->fresh()->email_verified_at);
    }

    public function test_認証済みの本人が開いても204のまま変わらない(): void
    {
        $user = User::factory()->create();
        $verifiedAt = $user->email_verified_at;

        $this->withToken($this->tokenFor($user))
            ->getJson($this->apiPath($this->linkFor($user)))
            ->assertOk()
            // D-121：招待リンクから登録した人でなければ、招待は返さない
            ->assertExactJson(['data' => ['invite_token' => null]]);

        $this->assertTrue($user->fresh()->email_verified_at->equalTo($verifiedAt));
    }

    public function test_登録直後の再送は60秒待ちになり、60秒後に送り直せる(): void
    {
        $token = $this->postJson('/api/register', [
            'email' => 'new@example.com',
            'password' => 'password1!',
        ])->json('data.token');
        $user = User::where('email', 'new@example.com')->sole();

        // API-24：登録時の送信から60秒は送らず、429と残り秒数を返す
        $response = $this->withToken($token)->postJson('/api/email/verification-notification');
        $response->assertTooManyRequests()->assertJsonPath('code', 'too_many_requests');
        $this->assertSame(60, $response->json('retry_after'));
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);

        $this->travel(60)->seconds();
        $this->withToken($token)->postJson('/api/email/verification-notification')->assertNoContent();
        Notification::assertSentToTimes($user, VerifyEmail::class, 2);

        // 送り直した時刻から、また60秒あける
        $this->withToken($token)->postJson('/api/email/verification-notification')->assertTooManyRequests();
        Notification::assertSentToTimes($user, VerifyEmail::class, 2);
    }

    public function test_認証済みなら再送せずに204を返す(): void
    {
        $user = User::factory()->create();

        $this->withToken($this->tokenFor($user))
            ->postJson('/api/email/verification-notification')
            ->assertNoContent();

        Notification::assertNothingSent();
    }

    public function test_ログインしていないと再送できない(): void
    {
        $this->postJson('/api/email/verification-notification')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }

    private function tokenFor(User $user): string
    {
        return app(AuthService::class)->issueToken($user);
    }

    /**
     * 確認メールに載るリンク（Next.jsのSC-04）を作る。
     */
    private function linkFor(User $user): string
    {
        $user->sendEmailVerificationNotification();

        return $this->sentMail($user)->actionUrl;
    }

    private function sentMail(User $user): MailMessage
    {
        $notification = Notification::sent($user, VerifyEmail::class)->last();

        return $notification->toMail($user);
    }

    /**
     * SC-04がリンクの値から組み立てるAPI-23のパス。
     */
    private function apiPath(string $link): string
    {
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);

        return "/api/email/verify/{$query['id']}/{$query['hash']}?expires={$query['expires']}&signature={$query['signature']}";
    }
}
