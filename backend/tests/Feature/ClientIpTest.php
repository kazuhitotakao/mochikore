<?php

namespace Tests\Feature;

use App\Http\Middleware\UseClientIpFromNextJs;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ClientIpTest extends TestCase
{
    use RefreshDatabase;

    private const PROXY_KEY = 'test-proxy-key';

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.nextjs.proxy_key' => self::PROXY_KEY]);
        Route::get('/api/testing/ip', fn (Request $request) => ['ip' => $request->ip()]);
    }

    public function test_合言葉が一致すると、窓口が渡した利用者の接続元を使う(): void
    {
        $this->getJson('/api/testing/ip', $this->fromNextJs('203.0.113.10'))
            ->assertJsonPath('ip', '203.0.113.10');

        $this->getJson('/api/testing/ip', $this->fromNextJs('2001:db8::1'))
            ->assertJsonPath('ip', '2001:db8::1');
    }

    /**
     * @param  array<string, string>  $headers
     */
    #[DataProvider('untrustedHeaders')]
    public function test_合言葉が一致しない通信の接続元のヘッダーは無視する(array $headers): void
    {
        // テストの接続元は 127.0.0.1
        $this->getJson('/api/testing/ip', $headers)->assertJsonPath('ip', '127.0.0.1');
    }

    /**
     * @return array<string, array{array<string, string>}>
     */
    public static function untrustedHeaders(): array
    {
        return [
            '合言葉が違う' => [[
                UseClientIpFromNextJs::CLIENT_IP_HEADER => '203.0.113.10',
                UseClientIpFromNextJs::PROXY_KEY_HEADER => 'wrong-key',
            ]],
            '合言葉がない' => [[UseClientIpFromNextJs::CLIENT_IP_HEADER => '203.0.113.10']],
            'IPの形が正しくない' => [[
                UseClientIpFromNextJs::CLIENT_IP_HEADER => '203.0.113.10, 198.51.100.1',
                UseClientIpFromNextJs::PROXY_KEY_HEADER => self::PROXY_KEY,
            ]],
            // 転送元を誰も信頼していないので、利用者が付けた X-Forwarded-For は使わない
            'X-Forwarded-Forだけ' => [['X-Forwarded-For' => '203.0.113.10']],
        ];
    }

    public function test_合言葉が未設定なら、空の合言葉を送られても信じない(): void
    {
        config(['services.nextjs.proxy_key' => null]);

        $this->getJson('/api/testing/ip', [
            UseClientIpFromNextJs::CLIENT_IP_HEADER => '203.0.113.10',
            UseClientIpFromNextJs::PROXY_KEY_HEADER => '',
        ])->assertJsonPath('ip', '127.0.0.1');
    }

    public function test_ログインの回数制限は、利用者の接続元ごとに数える(): void
    {
        User::factory()->create(['email' => 'user@example.com', 'password' => 'password1!']);
        $wrong = ['email' => 'user@example.com', 'password' => 'wrong-password'];

        // D-37：同じメールアドレスとIPの組み合わせで5回失敗すると待機
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', $wrong, $this->fromNextJs('203.0.113.10'))
                ->assertJsonPath('code', 'invalid_credentials');
        }
        $this->postJson('/api/login', $wrong, $this->fromNextJs('203.0.113.10'))
            ->assertTooManyRequests();

        // 別の利用者（別のIP）は、同じNext.jsを通っていても待機にならない
        $this->postJson('/api/login', $wrong, $this->fromNextJs('198.51.100.20'))
            ->assertJsonPath('code', 'invalid_credentials');
    }

    /**
     * @return array<string, string>
     */
    private function fromNextJs(string $clientIp): array
    {
        return [
            UseClientIpFromNextJs::CLIENT_IP_HEADER => $clientIp,
            UseClientIpFromNextJs::PROXY_KEY_HEADER => self::PROXY_KEY,
        ];
    }
}
