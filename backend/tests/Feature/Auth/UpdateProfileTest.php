<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * API-55 表示名を変える（F-34、SC-12、D-119、V-27、C-01・C-03）。
 */
class UpdateProfileTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsUser(User $user): static
    {
        return $this->withToken(app(AuthService::class)->issueToken($user));
    }

    public function test_表示名を保存し、本人の情報で返す(): void
    {
        $user = User::factory()->create(['email' => 'user@example.com']);

        // C-01：前後の空白は標準どおり削る。絵文字は使える
        $this->actingAsUser($user)->patchJson('/api/me', ['display_name' => ' たろう🍙 '])
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => $user->id,
                'email' => 'user@example.com',
                'email_verified_at' => $user->email_verified_at->toJSON(),
                'display_name' => 'たろう🍙',
                'pending_email' => null,
            ]]);
        $this->assertSame('たろう🍙', $user->fresh()->display_name);

        // 20文字ちょうどは使え、何度でも変えられる
        $this->patchJson('/api/me', ['display_name' => str_repeat('あ', 20)])->assertOk();
        $this->getJson('/api/me')->assertJsonPath('data.display_name', str_repeat('あ', 20));
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で変えない(array $body, string $field, string $message): void
    {
        $user = User::factory()->create(['display_name' => 'もとの名前']);

        $this->actingAsUser($user)->patchJson('/api/me', $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}.0", $message);
        $this->assertSame('もとの名前', $user->fresh()->display_name);
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidBodies(): array
    {
        return [
            // 一度入れた表示名は、空にはできない
            '省略' => [[], 'display_name', '表示名を入力してください。'],
            '空文字' => [['display_name' => ''], 'display_name', '表示名を入力してください。'],
            '空白だけ' => [['display_name' => " 　\t"], 'display_name', '表示名を入力してください。'],
            'null' => [['display_name' => null], 'display_name', '表示名を入力してください。'],
            '21文字' => [['display_name' => str_repeat('あ', 21)], 'display_name', '表示名は20文字以内で入力してください。'],
            '途中の改行' => [['display_name' => "たろ\nう"], 'display_name', '表示名は改行せずに入力してください。'],
            '途中のタブ' => [['display_name' => "たろ\tう"], 'display_name', '表示名は改行せずに入力してください。'],
            '数値' => [['display_name' => 123], 'display_name', '表示名を文字で入力してください。'],
            '配列' => [['display_name' => ['たろう']], 'display_name', '表示名を文字で入力してください。'],
            '定義していない項目' => [['display_name' => 'たろう', 'email' => 'other@example.com'], 'email', 'この項目は送信できません。'],
        ];
    }

    public function test_未ログインは401、メール未認証は403(): void
    {
        $this->patchJson('/api/me', ['display_name' => 'たろう'])->assertUnauthorized();

        $unverified = User::factory()->unverified()->create(['display_name' => 'もとの名前']);
        $this->actingAsUser($unverified)->patchJson('/api/me', ['display_name' => 'たろう'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
        $this->assertSame('もとの名前', $unverified->fresh()->display_name);
    }
}
