<?php

namespace Tests\Feature;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\ListReport;
use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\PackingListItem;
use App\Models\PersonalAccessToken;
use App\Models\SavedGroup;
use App\Models\SavedItem;
use App\Models\User;
use App\Services\AuthService;
use App\Services\DailyCleanupService;
use App\Services\EmailVerification;
use App\Services\PasswordResetService;
use Database\Seeders\CategorySeeder;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * F-01・F-05・F-17、D-35・36・44・47・49・52・59・78。
 * 09_バリデーション5〜7・31行（V-01〜03・16）と38〜45行（C-01〜08）のJメモを確認。
 * 入力条件・復元できる画面の期間は変更せず、保管期限の経過後だけを整理する。
 */
class DailyCleanupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        $this->seed(CategorySeeder::class);
        Notification::fake();
    }

    public function test_登録から7日経過した未認証だけを削除し同じメールで再登録できる(): void
    {
        $expired = User::factory()->unverified()->create(['created_at' => now()->subDays(7)]);
        $older = User::factory()->unverified()->create(['created_at' => now()->subDays(8)]);
        $recent = User::factory()->unverified()->create(['created_at' => now()->subDays(7)->addSecond()]);
        $verified = User::factory()->create(['created_at' => now()->subYear()]);

        $this->artisan('maintenance:cleanup')
            ->expectsOutput('未認証アカウント2件、削除済みの持ち物0件、期限切れのログイン情報0件を削除しました。')
            ->assertSuccessful();

        $this->assertModelMissing($expired);
        $this->assertModelMissing($older);
        $this->assertModelExists($recent);
        $this->assertModelExists($verified);
        $this->postJson('/api/register', ['email' => $expired->email, 'password' => 'Password1!'])->assertCreated();
    }

    public function test_未認証の本人データと認証情報は消し他人と変更先アドレスの再設定情報を残す(): void
    {
        $other = User::factory()->create();
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(7), 'pending_email' => $other->email]);
        $list = PackingList::factory()->for($user)->create();
        $group = PackingListGroup::factory()->for($list)->create();
        $item = PackingListItem::factory()->for($list)->create(['group_id' => $group->id]);
        $trashed = PackingListItem::factory()->for($list)->create(['deleted_at' => now()]);
        $report = ListReport::create(['packing_list_id' => $list->id, 'reason' => 'other']);
        $savedItem = SavedItem::factory()->for($user)->create();
        $savedGroup = SavedGroup::factory()->for($user)->create();
        $copy = PackingList::factory()->for($other)->create(['source_list_id' => $list->id]);
        $copyItem = PackingListItem::factory()->for($copy)->create(['is_checked' => true]);
        foreach ([$user, $user, $other] as $account) {
            app(AuthService::class)->issueToken($account);
        }
        foreach ([$user, $other] as $account) {
            DB::table('password_reset_tokens')->insert(['email' => $account->email, 'token' => 'cleanup-fixture', 'created_at' => now()]);
        }

        app(DailyCleanupService::class)->run();

        foreach ([$user, $list, $group, $item, $trashed, $report, $savedItem, $savedGroup] as $model) {
            $this->assertDatabaseMissing($model->getTable(), ['id' => $model->id]);
        }
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $other->email]);
        $this->assertSame(1, $other->tokens()->count());
        $this->assertNull($copy->fresh()->source_list_id);
        $this->assertTrue($copyItem->fresh()->is_checked);
        $this->assertModelExists($other);
    }

    public function test_本人の削除に失敗した場合は認証情報も元に戻す(): void
    {
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(7)]);
        app(AuthService::class)->issueToken($user);
        DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => 'cleanup-fixture', 'created_at' => now()]);
        Event::listen('eloquent.deleting: '.User::class, fn () => throw new \RuntimeException('deletion unavailable'));

        $this->artisan('maintenance:cleanup')
            ->expectsOutput('定期削除に失敗しました。データベースの接続と実行環境を確認してください。')
            ->assertFailed();

        $this->assertModelExists($user);
        $this->assertSame(1, $user->tokens()->count());
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_削除から7日経過した持ち物だけを完全削除しリストの日時や構造を変えない(): void
    {
        $list = PackingList::factory()->create(['updated_at' => now()->subDays(2), 'grouping_revision' => 7]);
        $group = PackingListGroup::factory()->for($list)->create();
        $active = PackingListItem::factory()->for($list)->create(['group_id' => $group->id, 'is_checked' => true, 'sort_order' => 2]);
        $expired = PackingListItem::factory()->for($list)->create(['deleted_at' => now()->subDays(7)]);
        $older = PackingListItem::factory()->for($list)->create(['deleted_at' => now()->subDays(30)]);
        $recent = PackingListItem::factory()->for($list)->create(['deleted_at' => now()->subDays(7)->addSecond()]);
        $updatedAt = $list->updated_at;

        $this->assertSame(['users' => 0, 'items' => 2, 'tokens' => 0], app(DailyCleanupService::class)->run());

        $this->assertDatabaseMissing('packing_list_items', ['id' => $expired->id]);
        $this->assertDatabaseMissing('packing_list_items', ['id' => $older->id]);
        $this->assertSoftDeleted($recent);
        $this->assertSame(2, $active->fresh()->sort_order);
        $this->assertTrue($active->fresh()->is_checked);
        $this->assertSame($group->id, $active->fresh()->group_id);
        $this->assertSame(7, $list->fresh()->grouping_revision);
        $this->assertTrue($list->fresh()->updated_at->eq($updatedAt));
        $this->assertModelExists($group);
    }

    #[DataProvider('tokenAges')]
    public function test_期限は初回365日と操作180日で判定し他の日時を使わない(int $firstDays, int $idleDays, int $extraSeconds, bool $expired): void
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);
        $firstLogin = now()->subDays($firstDays)->addSeconds($extraSeconds);
        $lastActivity = now()->subDays($idleDays)->addSeconds($extraSeconds);
        $token->forceFill([
            'first_login_at' => $firstLogin,
            'last_activity_at' => $lastActivity,
            // D-36：この2つの値は、期限判定に影響してはいけない。
            'last_used_at' => $expired ? now() : now()->subYears(2),
            'expires_at' => $expired ? now()->addYear() : now()->subYear(),
        ])->save();

        $this->assertSame($expired ? 1 : 0, app(DailyCleanupService::class)->run()['tokens']);

        if ($expired) {
            $this->assertModelMissing($token);
        } else {
            $this->assertModelExists($token);
            $this->assertTrue($token->fresh()->first_login_at->eq($firstLogin));
            $this->assertTrue($token->fresh()->last_activity_at->eq($lastActivity));
        }
        $this->assertModelExists($user);
    }

    public static function tokenAges(): array
    {
        return [
            '操作から180日ちょうど' => [200, 180, 0, true],
            '操作期限の1秒前' => [200, 180, 1, false],
            '初回から365日ちょうど' => [365, 1, 0, true],
            '初回期限の1秒前' => [365, 1, 1, false],
            '両方の期限切れ' => [400, 200, 0, true],
            'どちらも期限内' => [30, 10, 0, false],
        ];
    }

    public function test_100件を超える対象も漏れなく削除し繰り返しても成功する(): void
    {
        User::factory()->count(103)->unverified()->create(['created_at' => now()->subDays(7)]);

        $this->assertSame(103, app(DailyCleanupService::class)->run()['users']);
        $this->assertDatabaseCount('users', 0);
        $this->assertSame(['users' => 0, 'items' => 0, 'tokens' => 0], app(DailyCleanupService::class)->run());
    }

    public function test_削除後の古い本人情報でログイン情報を作り直せない(): void
    {
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(7)]);
        app(DailyCleanupService::class)->run();

        try {
            app(AuthService::class)->issueToken($user);
            $this->fail('削除後のアカウントにトークンが発行されました。');
        } catch (ApiException $exception) {
            $this->assertSame(ApiErrorCode::InvalidCredentials, $exception->errorCode);
        }
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_削除後の古い本人情報でメール認証を成功させない(): void
    {
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(7)]);
        app(DailyCleanupService::class)->run();

        try {
            app(EmailVerification::class)->verify($user, (string) $user->id, sha1($user->email));
            $this->fail('削除後のアカウントが認証されました。');
        } catch (ApiException $exception) {
            $this->assertSame(ApiErrorCode::Unauthenticated, $exception->errorCode);
        }
        $this->assertModelMissing($user);
    }

    public function test_再設定メールを予約した後に削除されても再設定情報を残さない(): void
    {
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(7)]);
        app(PasswordResetService::class)->sendLinkAfterResponse($user->email);

        app(DailyCleanupService::class)->run();
        app(DeferredCallbackCollection::class)->invoke();

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        Notification::assertNotSentTo($user, ResetPassword::class);
    }

    public function test_毎日日本時間の0時に1回だけ登録され重複起動を防ぐ(): void
    {
        $events = collect(app(Schedule::class)->events())->filter(fn ($event) => str_contains($event->command ?? '', 'maintenance:cleanup'));

        $this->assertCount(1, $events);
        $this->assertSame('0 0 * * *', $events->first()->expression);
        $this->assertSame('Asia/Tokyo', $events->first()->timezone);
        $this->assertTrue($events->first()->withoutOverlapping);
    }

    private function tokenFor(User $user): PersonalAccessToken
    {
        $id = explode('|', app(AuthService::class)->issueToken($user))[0];

        return PersonalAccessToken::findOrFail($id);
    }
}
