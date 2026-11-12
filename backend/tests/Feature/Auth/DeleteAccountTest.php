<?php

namespace Tests\Feature\Auth;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\ListReport;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\SavedGroup;
use App\Models\SavedItem;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Cache\RateLimiter as CacheRateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * F-14・SC-12・API-22、V-02・16（6・31行Jメモ）、C-01〜08（38〜45行Jメモ）。
 * D-09・22・39・52・61・62・72・92・102。手動テスト18-01〜04・39-04〜05。
 */
class DeleteAccountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CategorySeeder::class);
    }

    private function authenticate(User $user): string
    {
        $this->app['auth']->forgetGuards();
        $token = app(AuthService::class)->issueToken($user);
        $this->withToken($token);

        return $token;
    }

    public function test_本人の全データと認証情報を削除し他人のコピーと保存候補を残す(): void
    {
        $other = User::factory()->create();
        $user = User::factory()->create(['password' => 'Password1!', 'pending_email' => $other->email]);
        $list = PackingList::factory()->for($user)->create(['is_public' => true]);
        $group = PackingListGroup::factory()->for($list)->create();
        $item = PackingListItem::factory()->for($list)->create(['group_id' => $group->id, 'is_checked' => true]);
        $deletedItem = PackingListItem::factory()->for($list)->create(['deleted_at' => now()]);
        $report = ListReport::create(['packing_list_id' => $list->id, 'reason' => 'other']);
        $original = PackingList::factory()->for($other)->create(['is_public' => true]);
        $ownCopy = PackingList::factory()->for($user)->create(['source_list_id' => $original->id]);
        $otherCopy = PackingList::factory()->for($other)->create(['source_list_id' => $list->id]);
        $copyGroup = PackingListGroup::factory()->for($otherCopy)->create();
        $copyItem = PackingListItem::factory()->for($otherCopy)->create(['group_id' => $copyGroup->id, 'is_checked' => true]);
        $savedItem = SavedItem::factory()->for($user)->create();
        $savedGroup = SavedGroup::factory()->for($user)->create();
        $otherItem = SavedItem::factory()->for($other)->create();
        $otherGroup = SavedGroup::factory()->for($other)->create();
        foreach ([$user, $other] as $account) {
            DB::table('password_reset_tokens')->insert(['email' => $account->email, 'token' => 'test-reset', 'created_at' => now()]);
        }
        $otherToken = app(AuthService::class)->issueToken($other);
        $secondToken = app(AuthService::class)->issueToken($user);
        $currentToken = $this->authenticate($user);

        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent()->assertContent('');

        foreach ([$user, $list, $group, $item, $deletedItem, $report, $ownCopy, $savedItem, $savedGroup] as $model) {
            $this->assertDatabaseMissing($model->getTable(), ['id' => $model->id]);
        }
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id, 'tokenable_type' => User::class]);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $other->email]);
        foreach ([$other, $original, $otherCopy, $copyGroup, $copyItem, $otherItem, $otherGroup] as $model) {
            $this->assertModelExists($model);
        }
        $this->assertNull($otherCopy->fresh()->source_list_id);
        $this->assertSame($copyGroup->id, $copyItem->fresh()->group_id);
        $this->assertTrue($copyItem->fresh()->is_checked);
        $this->assertDatabaseCount('categories', 10);
        foreach ([$currentToken, $secondToken] as $token) {
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        }
        $this->app['auth']->forgetGuards();
        $this->withToken($otherToken)->getJson('/api/me')->assertOk();
    }

    public function test_メール未認証でも本人は退会できる(): void
    {
        $user = User::factory()->unverified()->create(['password' => 'Password1!']);
        $this->authenticate($user);
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
        $this->assertModelMissing($user);
    }

    public function test_未ログインは入力検証より先に401(): void
    {
        $this->deleteJson('/api/me', [])->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }

    public function test_パスワード違いでは何も削除せず大文字小文字も変換しない(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $this->authenticate($user);
        $this->deleteJson('/api/me', ['password' => 'password1!'])->assertUnprocessable()
            ->assertExactJson(['message' => 'パスワードが正しくありません。', 'code' => 'invalid_password']);
        $this->assertModelExists($user);
        $this->assertSame(1, $user->tokens()->count());
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
    }

    public function test_端末と_i_pを変えても5回失敗で1分待ち本人ごとに判定する(): void
    {
        $this->freezeTime();
        $user = User::factory()->create(['password' => 'Password1!']);
        for ($i = 0; $i < 5; $i++) {
            $this->authenticate($user);
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.($i + 1)])
                ->deleteJson('/api/me', ['password' => 'wrong-password'])->assertJsonPath('code', 'invalid_password');
        }
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests')->assertJsonPath('retry_after', 60)->assertHeader('Retry-After', '60');
        $this->assertModelExists($user);
        $other = User::factory()->create(['password' => 'Password1!']);
        $this->authenticate($other);
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
        $this->travel(61)->seconds();
        $this->authenticate($user);
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
    }

    #[DataProvider('invalidPasswords')]
    public function test_入力不正は削除せず項目ごとの日本語エラーを返す(array $body, string $message): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $this->authenticate($user);
        $this->deleteJson('/api/me', $body)->assertUnprocessable()->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.password', [$message]);
        $this->assertModelExists($user);
    }

    public static function invalidPasswords(): array
    {
        $required = 'パスワードを入力してください。';
        $format = 'パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。';
        $string = 'パスワードを文字で入力してください。';

        return [
            '省略' => [[], $required], 'null' => [['password' => null], $required],
            '空文字' => [['password' => ''], $required], '空白だけ' => [['password' => " \t\n"], $required],
            '数値' => [['password' => 12345678], $string], '真偽値' => [['password' => true], $string],
            '配列' => [['password' => ['password1!']], $string],
            '7文字' => [['password' => '1234567'], $format], '73文字' => [['password' => str_repeat('a', 73)], $format],
            '前後空白' => [['password' => ' Password1! '], $format],
            '全角' => [['password' => 'Ｐassword1!'], $format],
            '改行' => [['password' => "Password1!\n"], $format],
            'ゼロ幅空白' => [['password' => "Password1!\u{200B}"], $format],
        ];
    }

    #[DataProvider('validPasswords')]
    public function test_登録と同じ境界値と文字種で照合できる(string $password): void
    {
        $user = User::factory()->create(['password' => $password]);
        $this->authenticate($user);
        $this->deleteJson('/api/me', ['password' => $password])->assertNoContent();
    }

    public static function validPasswords(): array
    {
        return [['12345678'], [str_repeat('a', 72)], ['!!!!!!!!']];
    }

    public function test_入力不正は失敗回数に数えず未定義キーも拒否する(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $other = User::factory()->create();
        $this->authenticate($user);
        for ($i = 0; $i < 6; $i++) {
            $this->deleteJson('/api/me', ['password' => 'short'])->assertJsonPath('code', 'validation_error');
        }
        $this->deleteJson('/api/me', ['password' => 'Password1!', 'user_id' => $other->id])->assertUnprocessable()
            ->assertJsonPath('errors.user_id', ['この項目は送信できません。']);
        $this->assertModelExists($user);
        $this->assertModelExists($other);
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
        $this->assertModelExists($other);
    }

    public function test_削除中の失敗はトークンと再設定情報も含めて全体を戻す(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $list = PackingList::factory()->for($user)->create();
        DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => 'test-reset', 'created_at' => now()]);
        $this->authenticate($user);
        Event::listen('eloquent.deleting: '.User::class, fn () => throw new \RuntimeException('test deletion failure'));
        try {
            $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertServerError()->assertJsonPath('code', 'server_error');
        } finally {
            Event::forget('eloquent.deleting: '.User::class);
        }
        $this->assertModelExists($user);
        $this->assertModelExists($list);
        $this->assertSame(1, $user->tokens()->count());
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_データベースキャッシュでも失敗回数をロールバックしない(): void
    {
        RateLimiter::swap(new CacheRateLimiter(Cache::store('database')));
        $user = User::factory()->create(['password' => 'Password1!']);
        $this->authenticate($user);
        for ($i = 0; $i < 5; $i++) {
            $this->deleteJson('/api/me', ['password' => 'wrong-password'])->assertJsonPath('code', 'invalid_password');
        }
        $this->deleteJson('/api/me', ['password' => 'Password1!'])->assertTooManyRequests();
        $this->assertModelExists($user);
    }

    public function test_読み込み後に変更されたパスワードをロック内で読み直す(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $user->fresh()->update(['password' => 'NewPassword1!']);
        try {
            app(AccountDeletionService::class)->delete($user, 'Password1!');
            $this->fail('古いパスワードでは削除できません。');
        } catch (ApiException $error) {
            $this->assertSame(ApiErrorCode::InvalidPassword, $error->errorCode);
        }
        $this->assertModelExists($user);
    }
}
