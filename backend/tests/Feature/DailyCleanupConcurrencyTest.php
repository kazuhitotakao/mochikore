<?php

namespace Tests\Feature;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Services\AuthService;
use App\Services\DailyCleanupService;
use App\Services\EmailVerification;
use App\Services\PackingListItemService;
use App\Services\PasswordResetService;
use Database\Seeders\CategorySeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class DailyCleanupConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    #[DataProvider('operations')]
    public function test_認証や復元と重なっても再確認し認証情報を残さない(string $operation): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $this->seed(CategorySeeder::class);
        $user = User::factory()->unverified()->create(['created_at' => now()->subDays(8)]);
        $itemId = null;
        if ($operation === 'restore') {
            $user->markEmailAsVerified();
            $list = PackingList::factory()->for($user)->create();
            $itemId = PackingListItem::factory()->for($list)->create(['deleted_at' => now()->subDays(8)])->id;
        }
        $userId = $user->id;
        $barrier = sys_get_temp_dir().'/mochikore-cleanup-race-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $table = $operation === 'restore' ? 'packing_lists' : 'users';
        $tasks = [
            static function () use ($userId, $itemId, $barrier, $operation, $table) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }
                Notification::fake();
                $paused = false;
                DB::listen(static function (QueryExecuted $query) use ($barrier, $table, &$paused) {
                    if (! $paused && str_contains($query->sql, "from `{$table}`") && str_contains($query->sql, 'for update')) {
                        $paused = true;
                        file_put_contents($barrier.'/locked', 'ready');
                        // ロック中に削除候補を読み取らせ、古い候補を後で消す実装なら確実に検出する。
                        $deadline = microtime(true) + 5;
                        while (! file_exists($barrier.'/selected')) {
                            if (microtime(true) > $deadline) {
                                throw new \RuntimeException('Cleanup did not select candidates.');
                            }
                            usleep(1000);
                        }
                    }
                });
                $account = User::findOrFail($userId);
                match ($operation) {
                    'verify' => app(EmailVerification::class)->verify($account, (string) $userId, sha1($account->email)),
                    'restore' => app(PackingListItemService::class)->restore(PackingListItem::withTrashed()->findOrFail($itemId)),
                    'login' => app(AuthService::class)->issueToken($account),
                    'reset' => app(PasswordResetService::class)->sendLinkAfterResponse($account->email),
                };
                if ($operation === 'reset') {
                    app(DeferredCallbackCollection::class)->invoke();
                }

                return 'completed';
            },
            static function () use ($barrier, $table) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }
                $deadline = microtime(true) + 5;
                while (! file_exists($barrier.'/locked')) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The user operation did not lock its row.');
                    }
                    usleep(1000);
                }
                DB::listen(static function (QueryExecuted $query) use ($barrier, $table) {
                    if (str_contains($query->sql, "from `{$table}`") && ! str_contains($query->sql, 'for update')) {
                        file_put_contents($barrier.'/selected', 'ready');
                    }
                });

                return app(DailyCleanupService::class)->run();
            },
        ];
        try {
            $results = Concurrency::driver('process')->run($tasks, 15);
        } finally {
            foreach (glob($barrier.'/*') as $file) {
                unlink($file);
            }
            rmdir($barrier);
        }

        $this->assertSame('completed', $results[0]);
        $this->assertSame(0, $results[1]['items']);
        if ($operation === 'verify') {
            $this->assertSame(0, $results[1]['users']);
            $this->assertTrue($user->fresh()->hasVerifiedEmail());
        } elseif ($operation === 'restore') {
            $this->assertSame(0, $results[1]['users']);
            $this->assertFalse(PackingListItem::withTrashed()->findOrFail($itemId)->trashed());
        } else {
            $this->assertSame(1, $results[1]['users']);
            $this->assertModelMissing($user);
            $this->assertDatabaseCount('personal_access_tokens', 0);
            $this->assertDatabaseCount('password_reset_tokens', 0);
        }
    }

    public static function operations(): array
    {
        return [
            'メール認証が先に成功したら削除しない' => ['verify'],
            '復元が先に成功したら完全削除しない' => ['restore'],
            '同時のログインで発行されたトークンも削除する' => ['login'],
            '同時に作られた再設定情報も削除する' => ['reset'],
        ];
    }
}
