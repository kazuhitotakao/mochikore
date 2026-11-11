<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

class ApiErrorResponseTest extends TestCase
{
    public function test_想定外のエラーは詳細を返さず、server_errorにする(): void
    {
        Route::get('/api/testing/server-error', fn () => throw new RuntimeException('内部の詳細'));

        $this->getJson('/api/testing/server-error')
            ->assertInternalServerError()
            ->assertExactJson([
                'message' => 'サーバーでエラーが発生しました。',
                'code' => 'server_error',
            ]);
    }

    public function test_用意していない宛先への要求は404_not_foundにする(): void
    {
        // D-54：画面は code で判定するので、Laravel 標準の404にも code を付ける
        $this->getJson('/api/testing/missing')
            ->assertNotFound()
            ->assertExactJson([
                'message' => 'ページが見つかりません。',
                'code' => 'not_found',
            ]);
    }
}
