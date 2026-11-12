<?php

namespace Tests\Feature\Auth;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Services\AccountDeletionService;
use Illuminate\Cache\RateLimiter as CacheRateLimiter;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class DeleteAccountConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public function test_4回失敗後の同時送信でも5回までで待機する(): void
    {
        $this->assertSame(['invalid_password', 'too_many_requests'], $this->runConcurrent(false));
        $this->assertDatabaseCount('users', 1);
    }

    public function test_同時に退会しても1件だけ削除しもう一方は401扱いになる(): void
    {
        $this->assertSame(['deleted', 'unauthenticated'], $this->runConcurrent(true));
        $this->assertDatabaseCount('users', 0);
    }

    private function runConcurrent(bool $deleting): array
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        RateLimiter::swap(new CacheRateLimiter(Cache::store('database')));
        $user = User::factory()->create(['password' => 'Password1!']);
        if (! $deleting) {
            for ($i = 0; $i < 4; $i++) {
                try {
                    app(AccountDeletionService::class)->delete($user, 'wrong-password');
                } catch (ApiException $error) {
                    $this->assertSame('invalid_password', $error->errorCode->value);
                }
            }
        }
        $userId = $user->id;
        $barrier = sys_get_temp_dir().'/mochikore-account-deletion-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];
        for ($index = 0; $index < 2; $index++) {
            $tasks[] = static function () use ($userId, $barrier, $index, $deleting) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The deletion test requires mochikore_test.');
                }
                RateLimiter::swap(new CacheRateLimiter(Cache::store('database')));
                $account = User::findOrFail($userId);
                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent deletion test did not start.');
                    }
                    usleep(1000);
                }
                // D-72：件数の読み取りを重ね、DBキャッシュでも本人のロックが制限を守ることを確かめる
                DB::listen(static function (QueryExecuted $query) {
                    if (str_contains($query->sql, 'select') && str_contains($query->sql, 'cache')) {
                        usleep(100000);
                    }
                });
                try {
                    app(AccountDeletionService::class)->delete($account, $deleting ? 'Password1!' : 'wrong-password');

                    return 'deleted';
                } catch (ApiException $error) {
                    return $error->errorCode->value;
                }
            };
        }
        try {
            $results = Concurrency::driver('process')->run($tasks, 15);
        } finally {
            foreach (glob($barrier.'/*') as $file) {
                unlink($file);
            }
            rmdir($barrier);
        }
        sort($results);

        return $results;
    }
}
