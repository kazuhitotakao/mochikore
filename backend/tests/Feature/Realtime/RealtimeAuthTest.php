<?php

namespace Tests\Feature\Realtime;

use App\Models\PackingList;
use App\Models\User;
use App\Services\ListChangeNotifier;
use Illuminate\Support\Facades\Broadcast;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-63 共同編集のリストのチャンネルの認可（F-35、D-119・D-43、C-03）。
 */
class RealtimeAuthTest extends ListApiTestCase
{
    private const KEY = 'test-app-key';

    private const SECRET = 'test-app-secret';

    private const SOCKET_ID = '1234.5678';

    private const NOT_FOUND = ['message' => 'ページが見つかりません。', 'code' => 'not_found'];

    private User $owner;

    private User $member;

    private PackingList $list;

    protected function setUp(): void
    {
        parent::setUp();

        // テストでは配信先が null（何も送らない）なので、署名を作る reverb の設定に切り替えて、
        // チャンネルを登録し直す。実際の配信はしない（認可は署名を計算するだけ）
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => self::KEY,
            'broadcasting.connections.reverb.secret' => self::SECRET,
            'broadcasting.connections.reverb.app_id' => 'test-app',
            'broadcasting.connections.reverb.options.host' => 'localhost',
        ]);
        Broadcast::forgetDrivers();
        ListChangeNotifier::registerChannel();

        $this->owner = User::factory()->create();
        $this->member = User::factory()->create();
        $this->list = PackingList::factory()->for($this->owner)->create();
        $this->list->members()->create(['user_id' => $this->member->id]);
    }

    protected function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return parent::actingAsUser($user);
    }

    /**
     * @return array{socket_id: string, channel_name: string}
     */
    private function body(?int $listId = null): array
    {
        return ['socket_id' => self::SOCKET_ID, 'channel_name' => 'private-lists.'.($listId ?? $this->list->id)];
    }

    public function test_所有者とメンバーに、そのリストのチャンネルを聞くための署名を返す(): void
    {
        $channel = 'private-lists.'.$this->list->id;
        // Pusher 方式の署名：接続の番号とチャンネル名を、サーバーだけが持つ secret で署名する
        $expected = self::KEY.':'.hash_hmac('sha256', self::SOCKET_ID.':'.$channel, self::SECRET);

        foreach ([$this->owner, $this->member] as $user) {
            $this->actingAsUser($user)->postJson('/api/realtime/auth', $this->body())
                ->assertOk()
                ->assertExactJson(['data' => ['auth' => $expected]]);
        }
    }

    public function test_メンバーでない人・外された人・存在しないリストは同じ404(): void
    {
        $stranger = User::factory()->create();
        $this->actingAsUser($stranger)->postJson('/api/realtime/auth', $this->body())
            ->assertNotFound()->assertExactJson(self::NOT_FOUND);
        $this->postJson('/api/realtime/auth', $this->body(999999))
            ->assertNotFound()->assertExactJson(self::NOT_FOUND);

        // 外された後は、もう聞けない
        $this->list->members()->delete();
        $this->actingAsUser($this->member)->postJson('/api/realtime/auth', $this->body())
            ->assertNotFound()->assertExactJson(self::NOT_FOUND);
        // メンバーがいなくても、所有者は自分のリストを聞ける（招待リンクから参加した人にすぐ気づくため）
        $this->actingAsUser($this->owner)->postJson('/api/realtime/auth', $this->body())->assertOk();
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で署名を返さない(array $body, string $field, string $message): void
    {
        $this->actingAsUser($this->owner)->postJson('/api/realtime/auth', $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath("errors.{$field}.0", $message)
            ->assertJsonMissingPath('data');
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidBodies(): array
    {
        $invalid = '接続の情報が正しくありません。画面を読み直してください。';

        return [
            '接続の番号なし' => [['channel_name' => 'private-lists.1'], 'socket_id', $invalid],
            '接続の番号の形が違う' => [['socket_id' => 'abc', 'channel_name' => 'private-lists.1'], 'socket_id', $invalid],
            '接続の番号が数値' => [['socket_id' => 1234.5678, 'channel_name' => 'private-lists.1'], 'socket_id', $invalid],
            'チャンネル名なし' => [['socket_id' => self::SOCKET_ID], 'channel_name', $invalid],
            'ほかの種類のチャンネル' => [['socket_id' => self::SOCKET_ID, 'channel_name' => 'private-users.1'], 'channel_name', $invalid],
            '参加者を見せるチャンネル' => [['socket_id' => self::SOCKET_ID, 'channel_name' => 'presence-lists.1'], 'channel_name', $invalid],
            '公開のチャンネル' => [['socket_id' => self::SOCKET_ID, 'channel_name' => 'lists.1'], 'channel_name', $invalid],
            'リストの番号が0' => [['socket_id' => self::SOCKET_ID, 'channel_name' => 'private-lists.0'], 'channel_name', $invalid],
            '定義していない項目' => [
                ['socket_id' => self::SOCKET_ID, 'channel_name' => 'private-lists.1', 'user_id' => 1], 'user_id', 'この項目は送信できません。',
            ],
        ];
    }

    public function test_未ログインは401、メール未認証は403(): void
    {
        $this->postJson('/api/realtime/auth', $this->body())->assertUnauthorized();

        $this->actingAsUser(User::factory()->unverified()->create())
            ->postJson('/api/realtime/auth', $this->body())
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
    }

    public function test_標準の認可の入口は置かない(): void
    {
        // メール認証・エラーの形をそろえた API-63 だけから認可する
        $this->actingAsUser($this->owner)->postJson('/broadcasting/auth', $this->body())->assertNotFound();
        $this->postJson('/api/broadcasting/auth', $this->body())->assertNotFound();
    }
}
