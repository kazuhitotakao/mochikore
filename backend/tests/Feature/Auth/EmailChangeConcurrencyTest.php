<?php

namespace Tests\Feature\Auth;

use App\Exceptions\ApiException;
use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Services\AuthService;
use App\Services\EmailChangeService;
use App\Services\PasswordResetService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EmailChangeConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public function test_同時送信でも依頼は1件だけ受け付ける(): void
    {
        $this->assertSame(['sent', 'too_many_requests'], $this->runConcurrent('send'));
        $this->assertSame(1, User::whereNotNull('pending_email')->count());
    }

    public function test_同じ変更先を同時に確定しても1人だけ変更できる(): void
    {
        $this->assertSame(['changed', 'link_invalid'], $this->runConcurrent('different-users'));
        $this->assertSame(1, User::where('email', 'shared@example.com')->count());
        $this->assertSame(1, User::whereNotNull('pending_email')->count());
    }

    public function test_同じリンクの同時確定でも1回だけ変更する(): void
    {
        $this->assertSame(['changed', 'link_invalid'], $this->runConcurrent('same-user'));
        $this->assertSame(1, User::where('email', 'shared@example.com')->count());
    }

    public function test_旧メールの再設定と変更確定が同時でも、両方は成立しない(): void
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        $user = User::factory()->create(['password' => 'Password1!']);
        $user->forceFill(['pending_email' => 'shared@example.com', 'pending_email_requested_at' => now()->startOfSecond()])->save();
        $tokenId = (int) explode('|', app(AuthService::class)->issueToken($user))[0];
        $userId = $user->id;
        $email = $user->email;
        // テストDBだけで有効な固定の再設定情報。実際のメールやリンクは使わない
        DB::table('password_reset_tokens')->insert(['email' => $email, 'token' => Hash::make('f18-race-fixture'), 'created_at' => now()]);
        $hash = hash('sha256', $user->pending_email."\0".$user->pending_email_requested_at->getTimestamp());
        $barrier = sys_get_temp_dir().'/mochikore-email-reset-race-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [
            static function () use ($email, $barrier) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }
                $paused = false;
                DB::listen(static function (QueryExecuted $query) use ($barrier, &$paused) {
                    if (! $paused && str_contains($query->sql, 'select') && str_contains($query->sql, 'password_reset_tokens')) {
                        $paused = true;
                        file_put_contents($barrier.'/reset-ready', 'ready');
                        usleep(500000);
                    }
                });
                try {
                    app(PasswordResetService::class)->reset('f18-race-fixture', $email, 'NewPassword1!');

                    return 'reset';
                } catch (ApiException $error) {
                    return $error->errorCode->value;
                }
            },
            static function () use ($userId, $tokenId, $hash, $barrier) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('Test database required.');
                }
                Mail::shouldReceive('raw')->andReturn(null);
                $deadline = microtime(true) + 5;
                while (! file_exists($barrier.'/reset-ready')) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('Reset test did not start.');
                    }
                    usleep(1000);
                }
                $account = User::findOrFail($userId);
                $account->withAccessToken(PersonalAccessToken::findOrFail($tokenId));
                try {
                    app(EmailChangeService::class)->confirm($account, (string) $userId, $hash);

                    return 'changed';
                } catch (ApiException $error) {
                    return $error->errorCode->value;
                }
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
        sort($results);
        $this->assertSame(['reset', 'unauthenticated'], $results);
        $this->assertSame($email, $user->fresh()->email);
    }

    private function runConcurrent(string $mode): array
    {
        $this->assertSame('mochikore_test', DB::getDatabaseName());
        Mail::shouldReceive('raw')->andReturn(null);
        $first = User::factory()->create(['password' => 'Password1!']);
        $second = $mode === 'different-users' ? User::factory()->create(['password' => 'Password1!']) : $first;
        $accounts = [];
        foreach ([$first, $second] as $index => $account) {
            if ($index === 1 && $first->is($second)) {
                $accounts[] = $accounts[0];

                continue;
            }
            $token = app(AuthService::class)->issueToken($account);
            $tokenId = (int) explode('|', $token)[0];
            $account->withAccessToken(PersonalAccessToken::findOrFail($tokenId));
            if ($mode !== 'send') {
                app(EmailChangeService::class)->send($account, 'shared@example.com', 'Password1!');
                $account->refresh();
            }
            $accounts[] = ['user' => $account->id, 'token' => $tokenId, 'hash' => $mode === 'send' ? '' : hash('sha256', $account->pending_email."\0".$account->pending_email_requested_at->getTimestamp())];
        }
        $barrier = sys_get_temp_dir().'/mochikore-email-change-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $tasks = [];
        foreach ($accounts as $index => $account) {
            $tasks[] = static function () use ($account, $mode, $barrier, $index) {
                config(['database.connections.mysql.database' => 'mochikore_test']);
                DB::purge('mysql');
                if (DB::getDatabaseName() !== 'mochikore_test') {
                    throw new \RuntimeException('The email-change test requires mochikore_test.');
                }
                Mail::shouldReceive('raw')->andReturn(null);
                $user = User::findOrFail($account['user']);
                $user->withAccessToken(PersonalAccessToken::findOrFail($account['token']));
                file_put_contents($barrier.'/'.$index, 'ready');
                $deadline = microtime(true) + 5;
                while (count(glob($barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('The concurrent email-change test did not start.');
                    }
                    usleep(1000);
                }
                try {
                    if ($mode === 'send') {
                        app(EmailChangeService::class)->send($user, 'shared@example.com', 'Password1!');

                        return 'sent';
                    }
                    app(EmailChangeService::class)->confirm($user, (string) $account['user'], $account['hash']);

                    return 'changed';
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
