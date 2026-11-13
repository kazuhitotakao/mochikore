<?php

namespace Tests\Feature\Auth;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\PersonalAccessToken;
use App\Models\SavedGroup;
use App\Models\SavedItem;
use App\Models\User;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * F-01・D-78・D-74、手動テスト14-03。
 * 09_バリデーション38〜45行Jメモ（C-01〜08）を確認。CLI専用で対象のV行・新しいAPIはない。
 */
class RevokeUserTokensTest extends TestCase
{
    use RefreshDatabase;

    public function test_全端末の情報を削除して次の通信を401にし他の利用者には影響しない(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $other = User::factory()->create();
        $auth = app(AuthService::class);
        $devices = [$auth->issueToken($user), $auth->issueToken($user)];
        $otherToken = $auth->issueToken($other);

        $this->artisan('users:revoke-tokens', ['user' => (string) $user->id])
            ->expectsOutput("利用者ID {$user->id} のログイン情報を2件無効にしました。")
            ->assertSuccessful();

        foreach ($devices as $token) {
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->getJson('/api/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        }
        $this->app['auth']->forgetGuards();
        $this->withToken($otherToken)->getJson('/api/me')->assertOk()->assertJsonPath('data.id', $other->id);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(1, $other->tokens()->count());

        // D-78：再ログインを求める操作なので、正しい認証情報で新しくログインできる。
        $this->app['auth']->forgetGuards();
        $newToken = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'Password1!'])
            ->assertOk()->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->withToken($newToken)->getJson('/api/me')->assertOk();
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_本人情報やリストと保存候補と再設定情報は変更しない(): void
    {
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create(['pending_email' => 'pending@example.com']);
        $list = PackingList::factory()->for($user)->create(['is_public' => true, 'grouping_revision' => 3]);
        $item = PackingListItem::factory()->for($list)->create(['is_checked' => true]);
        $savedItem = SavedItem::factory()->for($user)->create();
        $savedGroup = SavedGroup::factory()->for($user)->create();
        app(AuthService::class)->issueToken($user);
        DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => 'revocation-fixture', 'created_at' => now()]);
        $before = [$user->fresh()->getAttributes(), $list->fresh()->getAttributes(), $item->fresh()->getAttributes()];

        $this->artisan('users:revoke-tokens', ['user' => $user->id])->assertSuccessful();

        $this->assertSame($before, [$user->fresh()->getAttributes(), $list->fresh()->getAttributes(), $item->fresh()->getAttributes()]);
        $this->assertModelExists($savedItem);
        $this->assertModelExists($savedGroup);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email, 'token' => 'revocation-fixture']);
    }

    public function test_期限内と期限切れの両方を無効にし未認証の本人にも使える(): void
    {
        $user = User::factory()->unverified()->create();
        $auth = app(AuthService::class);
        $auth->issueToken($user);
        $expired = explode('|', $auth->issueToken($user))[0];
        PersonalAccessToken::findOrFail($expired)->forceFill(['last_activity_at' => now()->subDays(181)])->save();

        $this->artisan('users:revoke-tokens', ['user' => $user->id])
            ->expectsOutput("利用者ID {$user->id} のログイン情報を2件無効にしました。")
            ->assertSuccessful();

        $this->assertSame(0, $user->tokens()->count());
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_ログイン情報が0件でも成功し繰り返しても他の利用者を変更しない(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        app(AuthService::class)->issueToken($other);

        for ($i = 0; $i < 2; $i++) {
            $this->artisan('users:revoke-tokens', ['user' => $user->id])
                ->expectsOutput("利用者ID {$user->id} のログイン情報を0件無効にしました。")
                ->assertSuccessful();
        }

        $this->assertSame(1, $other->tokens()->count());
    }

    #[DataProvider('invalidIds')]
    public function test_不正な利用者_i_dは拒否して既存の情報を消さない(string $id): void
    {
        $user = User::factory()->create();
        app(AuthService::class)->issueToken($user);

        $this->artisan('users:revoke-tokens', ['user' => $id])
            ->expectsOutput('有効な利用者IDを指定してください。')->assertFailed();

        $this->assertSame(1, $user->tokens()->count());
    }

    public static function invalidIds(): array
    {
        return array_map(fn ($id) => [$id], ['', '0', '-1', '01', '+1', '1abc', '1.0', '1e0', ' 1 ', '９', '9007199254740992', str_repeat('9', 100)]);
    }

    public function test_存在しない利用者_i_dは失敗し誰のログイン情報も消さない(): void
    {
        $user = User::factory()->create();
        app(AuthService::class)->issueToken($user);

        $this->artisan('users:revoke-tokens', ['user' => 999999])
            ->expectsOutput('利用者が見つかりません。')->assertFailed();

        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_削除後の障害でもロールバックし成功表示しない(): void
    {
        $user = User::factory()->create();
        app(AuthService::class)->issueToken($user);
        DB::listen(static function (QueryExecuted $query) {
            if (str_starts_with($query->sql, 'delete from `personal_access_tokens`')) {
                throw new \RuntimeException('revocation unavailable');
            }
        });

        $this->artisan('users:revoke-tokens', ['user' => $user->id])
            ->expectsOutput('ログイン情報の無効化に失敗しました。データベースの接続と実行環境を確認してください。')
            ->assertFailed();

        $this->assertSame(1, $user->tokens()->count());
        $this->assertModelExists($user);
    }
}
