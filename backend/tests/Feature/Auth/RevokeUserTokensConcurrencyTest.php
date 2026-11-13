<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use App\Services\UserTokenRevocationService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RevokeUserTokensConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public function test_先に始まったログインの発行を待って既存の端末とまとめて無効にする(): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach ([$user, $user, $other] as $account) {
            app(AuthService::class)->issueToken($account);
        }
        $userId = $user->id;
        $barrier = sys_get_temp_dir().'/mochikore-revoke-tokens-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [
            static function () use ($userId, $barrier) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }

                return DB::transaction(function () use ($userId, $barrier) {
                    $account = User::whereKey($userId)->lockForUpdate()->firstOrFail();
                    file_put_contents($barrier.'/login-locked', 'ready');
                    $deadline = microtime(true) + 5;
                    while (! file_exists($barrier.'/revoking')) {
                        if (microtime(true) > $deadline) {
                            throw new \RuntimeException('The revocation test did not start.');
                        }
                        usleep(1000);
                    }
                    // D-78：発行が未確定の間に無効化を始め、ロックなしなら新しい情報が残る状況を作る。
                    usleep(250000);
                    app(AuthService::class)->issueToken($account);

                    return 'issued';
                });
            },
            static function () use ($userId, $barrier) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }
                $deadline = microtime(true) + 5;
                while (! file_exists($barrier.'/login-locked')) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The login test did not start.');
                    }
                    usleep(1000);
                }
                file_put_contents($barrier.'/revoking', 'ready');

                return app(UserTokenRevocationService::class)->revoke($userId);
            },
        ];
        try {
            $this->assertSame(['issued', 3], Concurrency::driver('process')->run($tasks, 15));
        } finally {
            foreach (glob($barrier.'/*') as $file) {
                unlink($file);
            }
            rmdir($barrier);
        }

        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(1, $other->tokens()->count());
    }
}
