<?php

namespace Tests\Feature\Auth;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;
use App\Models\UserAvatar;
use App\Services\AuthService;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * API-70〜72 本人の写真と、API-58 のメンバーの写真（F-38、SC-05・SC-12・SC-07-23、D-128、V-32、C-03）。
 */
class AvatarTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // メンバーの一覧・公開リストの確認で、リストを作る
        $this->seed(CategorySeeder::class);
    }

    private function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken(app(AuthService::class)->issueToken($user));
    }

    private static function fixture(string $name): string
    {
        return (string) file_get_contents(__DIR__.'/../../Fixtures/avatars/'.$name);
    }

    private static function dataUrl(string $bytes, string $type = 'image/jpeg'): string
    {
        return "data:{$type};base64,".base64_encode($bytes);
    }

    public function test_写真を載せる・変える・削除でき、本人の写真として読める(): void
    {
        $user = User::factory()->create();
        $first = self::fixture('square-256.jpg');
        $second = self::fixture('other-256.jpg');

        $this->actingAsUser($user)->getJson('/api/me/avatar')
            ->assertOk()->assertExactJson(['data' => ['avatar' => null]]);

        $this->putJson('/api/me/avatar', ['avatar' => self::dataUrl($first)])
            ->assertOk()->assertExactJson(['data' => ['avatar' => self::dataUrl($first)]]);
        $this->getJson('/api/me/avatar')->assertExactJson(['data' => ['avatar' => self::dataUrl($first)]]);
        $this->assertSame($first, UserAvatar::findOrFail($user->id)->image);

        // 変えると前の写真は残さない（1人1枚）
        $this->putJson('/api/me/avatar', ['avatar' => self::dataUrl($second)])->assertOk();
        $this->assertSame(1, UserAvatar::count());
        $this->assertSame($second, UserAvatar::findOrFail($user->id)->image);

        $this->deleteJson('/api/me/avatar')->assertNoContent()->assertContent('');
        $this->assertDatabaseCount('user_avatars', 0);
        $this->getJson('/api/me/avatar')->assertExactJson(['data' => ['avatar' => null]]);
        // 載せていないときに送り直しても同じ
        $this->deleteJson('/api/me/avatar')->assertNoContent();
    }

    public function test_ほかの人の写真は変わらず、本人の情報には写真を入れない(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $other->avatar()->create(['image' => self::fixture('other-256.jpg')]);

        $this->actingAsUser($user)->putJson('/api/me/avatar', ['avatar' => self::dataUrl(self::fixture('square-256.jpg'))])->assertOk();
        $this->deleteJson('/api/me/avatar')->assertNoContent();

        $this->assertSame(self::fixture('other-256.jpg'), $other->fresh()->avatar->image);
        $this->getJson('/api/me')->assertOk()->assertJsonMissingPath('data.avatar');
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_写真が条件に合わなければ422で変えない(array $body, string $field, string $message): void
    {
        $user = User::factory()->create();
        $user->avatar()->create(['image' => self::fixture('other-256.jpg')]);

        $this->actingAsUser($user)->putJson('/api/me/avatar', $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}.0", $message);
        $this->assertSame(self::fixture('other-256.jpg'), $user->fresh()->avatar->image);
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidBodies(): array
    {
        $invalid = 'この写真は使えません。別の写真を選んでください。';
        $jpeg = self::fixture('square-256.jpg');

        return [
            '省略' => [[], 'avatar', '写真を選んでください。'],
            '空文字' => [['avatar' => ''], 'avatar', '写真を選んでください。'],
            'null' => [['avatar' => null], 'avatar', '写真を選んでください。'],
            '数値' => [['avatar' => 123], 'avatar', $invalid],
            '配列' => [['avatar' => [self::dataUrl($jpeg)]], 'avatar', $invalid],
            // data URL でない・JPEG でない種類
            '中身だけ' => [['avatar' => base64_encode($jpeg)], 'avatar', $invalid],
            'PNGの種類' => [['avatar' => self::dataUrl(self::fixture('square-256.png'), 'image/png')], 'avatar', $invalid],
            // 種類を JPEG と書いても、中身で確かめる
            '中身がPNG' => [['avatar' => self::dataUrl(self::fixture('square-256.png'))], 'avatar', $invalid],
            '中身が文字' => [['avatar' => self::dataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>')], 'avatar', $invalid],
            'base64でない' => [['avatar' => 'data:image/jpeg;base64,***'], 'avatar', $invalid],
            '中身が空' => [['avatar' => 'data:image/jpeg;base64,'], 'avatar', $invalid],
            '壊れたJPEG' => [['avatar' => self::dataUrl(substr($jpeg, 0, 40))], 'avatar', $invalid],
            // 256px四方だけを受け取る
            '128px' => [['avatar' => self::dataUrl(self::fixture('square-128.jpg'))], 'avatar', $invalid],
            '正方形でない' => [['avatar' => self::dataUrl(self::fixture('wide-256x200.jpg'))], 'avatar', $invalid],
            // 60KBまで。後ろに足したデータも容量に数える
            '60KBを超える' => [['avatar' => self::dataUrl($jpeg.str_repeat("\0", UserAvatar::MAX_BYTES - strlen($jpeg) + 1))], 'avatar', $invalid],
            '定義していない項目' => [['avatar' => self::dataUrl($jpeg), 'user_id' => 1], 'user_id', 'この項目は送信できません。'],
        ];
    }

    public function test_容量の上限ちょうどまでは受け取る(): void
    {
        $jpeg = self::fixture('square-256.jpg');
        $padded = $jpeg.str_repeat("\0", UserAvatar::MAX_BYTES - strlen($jpeg));

        $this->actingAsUser(User::factory()->create())
            ->putJson('/api/me/avatar', ['avatar' => self::dataUrl($padded)])
            ->assertOk();
        $this->assertSame(UserAvatar::MAX_BYTES, strlen(UserAvatar::firstOrFail()->image));
    }

    public function test_削除は本文を受け取らない(): void
    {
        $user = User::factory()->create();
        $user->avatar()->create(['image' => self::fixture('square-256.jpg')]);

        $this->actingAsUser($user)->deleteJson('/api/me/avatar', ['user_id' => 1])
            ->assertUnprocessable()
            ->assertJsonPath('errors.user_id.0', 'この項目は送信できません。');
        $this->assertDatabaseCount('user_avatars', 1);
    }

    public function test_未ログインは401、メール未認証は403(): void
    {
        $body = ['avatar' => self::dataUrl(self::fixture('square-256.jpg'))];
        $this->getJson('/api/me/avatar')->assertUnauthorized();
        $this->putJson('/api/me/avatar', $body)->assertUnauthorized();
        $this->deleteJson('/api/me/avatar')->assertUnauthorized();

        $unverified = User::factory()->unverified()->create();
        $this->actingAsUser($unverified)->getJson('/api/me/avatar')
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->putJson('/api/me/avatar', $body)
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->deleteJson('/api/me/avatar')
            ->assertForbidden()->assertJsonPath('code', 'email_not_verified');
        $this->assertDatabaseCount('user_avatars', 0);
    }

    public function test_共同編集のメンバーの一覧に、所有者とメンバーの写真を出す(): void
    {
        $owner = User::factory()->create();
        $withPhoto = User::factory()->create();
        $withoutPhoto = User::factory()->create();
        $list = PackingList::factory()->for($owner)->create();
        $list->members()->create(['user_id' => $withPhoto->id]);
        $list->members()->create(['user_id' => $withoutPhoto->id]);
        $owner->avatar()->create(['image' => self::fixture('square-256.jpg')]);
        $withPhoto->avatar()->create(['image' => self::fixture('other-256.jpg')]);

        $this->actingAsUser($withoutPhoto)->getJson("/api/lists/{$list->id}/members")
            ->assertOk()
            ->assertJsonPath('data.owner.avatar', self::dataUrl(self::fixture('square-256.jpg')))
            ->assertJsonPath('data.members.0.avatar', self::dataUrl(self::fixture('other-256.jpg')))
            ->assertJsonPath('data.members.1.avatar', null);
    }

    public function test_退会すると写真も消え、公開リストには写真を出さない(): void
    {
        $user = User::factory()->create(['password' => 'Password1!']);
        $user->avatar()->create(['image' => self::fixture('square-256.jpg')]);
        $list = PackingList::factory()->for($user)->create(['is_public' => true]);
        PackingListItem::factory()->for($list)->create();

        $response = $this->getJson("/api/public/lists/{$list->id}")->assertOk();
        $this->assertStringNotContainsString('data:image', $response->getContent());

        $this->actingAsUser($user)->deleteJson('/api/me', ['password' => 'Password1!'])->assertNoContent();
        $this->assertDatabaseCount('user_avatars', 0);
    }
}
