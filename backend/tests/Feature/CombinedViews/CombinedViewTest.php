<?php

namespace Tests\Feature\CombinedViews;

use App\Models\CombinedView;
use App\Models\PackingList;
use App\Models\PackingListMember;
use App\Models\User;
use App\Services\ListChangeNotifier;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * まとめ表示（F-37、API-65〜69、D-124・D-43・D-119、V-31、C-03・C-05）。
 * 本人だけのもので、共同編集のメンバーには、まとめ表示があることもほかに入れたリストも見せない。
 */
class CombinedViewTest extends ListApiTestCase
{
    private const NOT_FOUND = ['message' => 'ページが見つかりません。', 'code' => 'not_found'];

    private const LISTS_INVALID = '選んだリストの情報が正しくありません。読み直してください。';

    private User $me;

    private User $owner;

    private User $stranger;

    /** 自分のリスト（個人用） */
    private PackingList $mine;

    /** 共同編集で参加しているリスト（所有者は owner） */
    private PackingList $family;

    protected function setUp(): void
    {
        parent::setUp();

        $this->me = User::factory()->create(['display_name' => 'わたし']);
        $this->owner = User::factory()->create(['display_name' => 'おかあさん']);
        $this->stranger = User::factory()->create();
        $this->mine = PackingList::factory()->for($this->me)->create([
            'title' => '自分の買い物',
            'updated_at' => now()->subDay(),
        ]);
        $this->family = PackingList::factory()->for($this->owner)->create([
            'title' => '家族の買い物',
            'updated_at' => now()->subDay(),
        ]);
        $this->family->members()->create(['user_id' => $this->me->id]);
    }

    /**
     * 1つのテストの中で人を入れ替えて送るので、前の人のログインを残さない。
     */
    protected function actingAsUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return parent::actingAsUser($user);
    }

    /**
     * @param  list<int>  $listIds
     */
    private function createView(User $user, array $listIds, string $name = '家族と自分の買い物'): CombinedView
    {
        $view = $user->combinedViews()->create(['name' => $name]);
        foreach ($listIds as $index => $listId) {
            $view->lists()->attach($listId, ['sort_order' => $index]);
        }

        return $view;
    }

    // ---- API-66 作る ----

    public function test_自分のリストと参加しているリストを選んだ順に並べて作れる(): void
    {
        $this->freezeSecond();
        $listUpdatedAt = $this->family->updated_at->toJSON();

        $response = $this->actingAsUser($this->me)
            ->postJson('/api/combined-views', [
                'name' => '  家族と自分の買い物  ',
                'list_ids' => [$this->family->id, $this->mine->id],
            ])
            ->assertCreated();

        $view = CombinedView::sole();
        $response->assertExactJson(['data' => [
            'id' => $view->id,
            // C-01：前後の空白は Laravel 標準で消す
            'name' => '家族と自分の買い物',
            'lists' => [
                ['id' => $this->family->id, 'title' => '家族の買い物'],
                ['id' => $this->mine->id, 'title' => '自分の買い物'],
            ],
            'updated_at' => now()->toJSON(),
        ]]);
        $this->assertSame($this->me->id, $view->user_id);

        // D-24：元のリストの更新日時（SC-05 の並び順）・公開・共同編集の設定は変えない
        $family = $this->family->fresh();
        $this->assertSame($listUpdatedAt, $family->updated_at->toJSON());
        $this->assertFalse($family->is_public);
        $this->assertSame(1, $family->members()->count());
    }

    public function test_同じリストを別のまとめ表示にも入れられ、同じ名前も作れる(): void
    {
        $this->actingAsUser($this->me);
        $body = ['name' => '買い物', 'list_ids' => [$this->mine->id, $this->family->id]];

        $this->postJson('/api/combined-views', $body)->assertCreated();
        $this->postJson('/api/combined-views', $body)->assertCreated();

        $this->assertSame(2, $this->me->combinedViews()->count());
    }

    public function test_見られないリストは、存在するかを区別しない同じ422で、何も作らない(): void
    {
        $others = PackingList::factory()->for($this->stranger)->create();
        $public = PackingList::factory()->for($this->stranger)->create(['is_public' => true]);
        $missing = PackingList::max('id') + 100;
        $this->actingAsUser($this->me);

        foreach ([$others->id, $public->id, $missing] as $listId) {
            $this->postJson('/api/combined-views', [
                'name' => '買い物',
                'list_ids' => [$this->mine->id, $listId],
            ])
                ->assertUnprocessable()
                ->assertExactJson([
                    'message' => '入力内容を確認してください。',
                    'code' => 'validation_error',
                    'errors' => ['list_ids' => [self::LISTS_INVALID]],
                ]);
        }

        $this->assertSame(0, CombinedView::count());
    }

    public function test_外された・抜けたリストは選べない(): void
    {
        $this->family->members()->where('user_id', $this->me->id)->delete();

        $this->actingAsUser($this->me)
            ->postJson('/api/combined-views', ['name' => '買い物', 'list_ids' => [$this->mine->id, $this->family->id]])
            ->assertUnprocessable()
            ->assertJsonPath('errors.list_ids.0', self::LISTS_INVALID);
    }

    public function test_1人10件まで。11件目は422で作らない(): void
    {
        foreach (range(1, CombinedView::MAX_PER_USER) as $number) {
            $this->createView($this->me, [$this->mine->id, $this->family->id], "まとめ{$number}");
        }
        // ほかの人のまとめ表示は数えない
        $this->createView($this->owner, [$this->family->id, PackingList::factory()->for($this->owner)->create()->id]);

        $this->actingAsUser($this->me)
            ->postJson('/api/combined-views', ['name' => '11件目', 'list_ids' => [$this->mine->id, $this->family->id]])
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'まとめ表示は10件までです。', 'code' => 'combined_view_limit_reached']);

        $this->assertSame(10, $this->me->combinedViews()->count());
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function invalidBodies(): array
    {
        return [
            '名前の省略' => [['list_ids' => 'LISTS'], 'name', 'まとめ表示の名前を入力してください。'],
            '名前が空白だけ' => [['name' => '　 ', 'list_ids' => 'LISTS'], 'name', 'まとめ表示の名前を入力してください。'],
            '名前が null' => [['name' => null, 'list_ids' => 'LISTS'], 'name', 'まとめ表示の名前を入力してください。'],
            '名前が数値' => [['name' => 1, 'list_ids' => 'LISTS'], 'name', 'まとめ表示の名前を文字で入力してください。'],
            '名前が51文字' => [['name' => 'NAME51', 'list_ids' => 'LISTS'], 'name', 'まとめ表示の名前は50文字以内で入力してください。'],
            '名前の途中に改行' => [['name' => "家族\n自分", 'list_ids' => 'LISTS'], 'name', 'まとめ表示の名前は改行せずに入力してください。'],
            'リストの省略' => [['name' => '買い物'], 'list_ids', 'まとめて表示するリストを2件以上選んでください。'],
            'リストが1件' => [['name' => '買い物', 'list_ids' => 'ONE'], 'list_ids', 'まとめて表示するリストを2件以上選んでください。'],
            'リストが6件' => [['name' => '買い物', 'list_ids' => 'SIX'], 'list_ids', 'まとめて表示できるリストは5件までです。'],
            'リストが配列でない' => [['name' => '買い物', 'list_ids' => 'abc'], 'list_ids', self::LISTS_INVALID],
            'リストIDが文字列' => [['name' => '買い物', 'list_ids' => 'STRING_ID'], 'list_ids.1', self::LISTS_INVALID],
            '同じリストを2回' => [['name' => '買い物', 'list_ids' => 'DUPLICATE'], 'list_ids.1', self::LISTS_INVALID],
            '定義していない項目' => [['name' => '買い物', 'list_ids' => 'LISTS', 'user_id' => 1], 'user_id', 'この項目は送信できません。'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('invalidBodies')]
    public function test_入力が正しくなければ422で、何も作らない(array $body, string $field, string $message): void
    {
        $extra = PackingList::factory()->for($this->me)->count(4)->create()->pluck('id')->all();
        $ids = [$this->mine->id, $this->family->id];
        $body = array_map(fn ($value) => match ($value) {
            'LISTS' => $ids,
            'ONE' => [$this->mine->id],
            'SIX' => [...$ids, ...$extra],
            'STRING_ID' => [$this->mine->id, (string) $this->family->id],
            'DUPLICATE' => [$this->mine->id, $this->mine->id],
            'NAME51' => str_repeat('あ', 51),
            default => $value,
        }, $body);

        $response = $this->actingAsUser($this->me)
            ->postJson('/api/combined-views', $body)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error');
        // 項目名に「.」を含む（list_ids.1 など）ので、パスではなく項目名のまま取り出す
        $this->assertSame([$message], $response->json('errors')[$field] ?? null);

        $this->assertSame(0, CombinedView::count());
    }

    public function test_名前は50文字・リストは5件まで作れる(): void
    {
        $extra = PackingList::factory()->for($this->me)->count(3)->create()->pluck('id')->all();

        $this->actingAsUser($this->me)
            ->postJson('/api/combined-views', [
                'name' => str_repeat('あ', 50),
                'list_ids' => [$this->mine->id, $this->family->id, ...$extra],
            ])
            ->assertCreated()
            ->assertJsonCount(5, 'data.lists');
    }

    // ---- API-65・67 読む ----

    public function test_一覧は本人のものだけを更新が新しい順に返す(): void
    {
        $this->freezeSecond();
        $old = $this->createView($this->me, [$this->mine->id, $this->family->id], '古い');
        $old->forceFill(['updated_at' => now()->subHour()])->save();
        $new = $this->createView($this->me, [$this->family->id, $this->mine->id], '新しい');
        $this->createView($this->owner, [$this->family->id, PackingList::factory()->for($this->owner)->create()->id], 'おかあさんの');

        $this->actingAsUser($this->me)
            ->getJson('/api/combined-views')
            ->assertOk()
            ->assertExactJson(['data' => [
                [
                    'id' => $new->id,
                    'name' => '新しい',
                    'lists' => [
                        ['id' => $this->family->id, 'title' => '家族の買い物'],
                        ['id' => $this->mine->id, 'title' => '自分の買い物'],
                    ],
                    'updated_at' => now()->toJSON(),
                ],
                [
                    'id' => $old->id,
                    'name' => '古い',
                    'lists' => [
                        ['id' => $this->mine->id, 'title' => '自分の買い物'],
                        ['id' => $this->family->id, 'title' => '家族の買い物'],
                    ],
                    'updated_at' => now()->subHour()->toJSON(),
                ],
            ]]);
    }

    public function test_1件を読むと、選んだ順にリストを返す(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);

        $this->actingAsUser($this->me)
            ->getJson("/api/combined-views/{$view->id}")
            ->assertOk()
            ->assertJsonPath('data.name', '家族と自分の買い物')
            ->assertJsonPath('data.lists', [
                ['id' => $this->family->id, 'title' => '家族の買い物'],
                ['id' => $this->mine->id, 'title' => '自分の買い物'],
            ]);
    }

    public function test_ほかの人のまとめ表示は、同じリストのメンバー・所有者でも404(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $missing = $view->id + 100;

        // D-124・D-43：共同編集の所有者にも、メンバーがまとめ表示を持っていることを知らせない
        foreach ([$this->owner, $this->stranger] as $user) {
            $this->actingAsUser($user);
            $this->getJson("/api/combined-views/{$view->id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
            $this->patchJson("/api/combined-views/{$view->id}", ['name' => '乗っ取り'])->assertNotFound()->assertExactJson(self::NOT_FOUND);
            $this->deleteJson("/api/combined-views/{$view->id}")->assertNotFound()->assertExactJson(self::NOT_FOUND);
            $this->getJson('/api/combined-views')->assertOk()->assertExactJson(['data' => []]);
        }
        $this->actingAsUser($this->me)->getJson("/api/combined-views/{$missing}")->assertNotFound()->assertExactJson(self::NOT_FOUND);

        $this->assertSame('家族と自分の買い物', $view->fresh()->name);
    }

    public function test_共同編集のメンバー・所有者に返すリストの情報に、まとめ表示のことを入れない(): void
    {
        $this->createView($this->me, [$this->family->id, $this->mine->id], '秘密のまとめ');

        foreach ([$this->owner, $this->me] as $user) {
            $this->actingAsUser($user);
            foreach (["/api/lists/{$this->family->id}", '/api/lists', "/api/lists/{$this->family->id}/members", "/api/lists/{$this->family->id}/grouping"] as $path) {
                $body = $this->getJson($path)->assertOk()->getContent();
                $this->assertStringNotContainsString('秘密のまとめ', $body);
                $this->assertStringNotContainsString('combined', $body);
            }
        }
        // 所有者には、メンバーの個人用のリストの名前も届かない
        $this->actingAsUser($this->owner);
        foreach (["/api/lists/{$this->family->id}", '/api/lists', "/api/lists/{$this->family->id}/members"] as $path) {
            $this->assertStringNotContainsString('自分の買い物', $this->getJson($path)->getContent());
        }
    }

    public function test_見られなくなったリストは、外し忘れがあっても返さない(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        // 外す処理（API-59）を通さずにメンバーの行だけを消した状態
        PackingListMember::where('user_id', $this->me->id)->delete();

        $this->actingAsUser($this->me)
            ->getJson("/api/combined-views/{$view->id}")
            ->assertOk()
            ->assertJsonPath('data.lists', [['id' => $this->mine->id, 'title' => '自分の買い物']]);
        $this->getJson('/api/combined-views')->assertJsonPath('data.0.lists', [['id' => $this->mine->id, 'title' => '自分の買い物']]);
    }

    // ---- 共同編集から外れる・リストを消す・退会 ----

    public function test_メンバーから外された・抜けたら、そのリストを本人のまとめ表示から外し、ほかの人のものは変えない(): void
    {
        $this->freezeSecond();
        $sister = User::factory()->create(['display_name' => 'いもうと']);
        $this->family->members()->create(['user_id' => $sister->id]);
        $myView = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $myView->forceFill(['updated_at' => now()->subHour()])->save();
        $sisterView = $this->createView($sister, [$this->family->id, PackingList::factory()->for($sister)->create()->id]);
        $ownerView = $this->createView($this->owner, [$this->family->id, PackingList::factory()->for($this->owner)->create()->id]);

        // API-59：所有者が外す
        $member = $this->family->members()->where('user_id', $this->me->id)->sole();
        $this->actingAsUser($this->owner)
            ->deleteJson("/api/lists/{$this->family->id}/members/{$member->id}")
            ->assertNoContent();

        $this->assertSame([$this->mine->id], $myView->lists()->pluck('packing_lists.id')->all());
        // まとめ表示は残し、更新日時（SC-05 の並び順）も変えない
        $this->assertSame(now()->subHour()->toJSON(), $myView->fresh()->updated_at->toJSON());
        $this->assertSame(2, $sisterView->lists()->count());
        $this->assertSame(2, $ownerView->lists()->count());

        // API-60：自分で抜ける
        $this->actingAsUser($sister)->deleteJson("/api/lists/{$this->family->id}/membership")->assertNoContent();
        $this->assertSame(1, $sisterView->lists()->count());
        $this->assertSame(2, $ownerView->lists()->count());

        // もう一度参加しても、外したリストは戻らない
        $this->family->members()->create(['user_id' => $this->me->id]);
        $this->assertSame(1, $myView->lists()->count());
    }

    public function test_リストを消すとまとめ表示から外れ、まとめ表示を消してもリストは残る(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);

        $this->actingAsUser($this->owner)->deleteJson("/api/lists/{$this->family->id}")->assertNoContent();
        $this->assertSame([$this->mine->id], $view->lists()->pluck('packing_lists.id')->all());

        // API-69
        $this->actingAsUser($this->me)->deleteJson("/api/combined-views/{$view->id}")->assertNoContent();
        $this->assertNull($view->fresh());
        $this->assertSame(0, DB::table('combined_view_lists')->count());
        $this->assertNotNull($this->mine->fresh());
        $this->getJson("/api/combined-views/{$view->id}")->assertNotFound();
    }

    public function test_退会すると本人のまとめ表示も消え、ほかの人のものは残る(): void
    {
        $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $ownerView = $this->createView($this->owner, [$this->family->id, PackingList::factory()->for($this->owner)->create()->id]);

        $this->me->delete();

        $this->assertSame(0, CombinedView::where('user_id', $this->me->id)->count());
        $this->assertSame(2, $ownerView->lists()->count());
    }

    // ---- API-68 変える ----

    public function test_名前とリストを変えると、並びを丸ごと置き換えて更新日時を新しくする(): void
    {
        $this->freezeSecond();
        $third = PackingList::factory()->for($this->me)->create(['title' => '日用品']);
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $view->forceFill(['updated_at' => now()->subHour()])->save();

        $this->actingAsUser($this->me)
            ->patchJson("/api/combined-views/{$view->id}", [
                'name' => '週末',
                'list_ids' => [$third->id, $this->family->id],
            ])
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => $view->id,
                'name' => '週末',
                'lists' => [
                    ['id' => $third->id, 'title' => '日用品'],
                    ['id' => $this->family->id, 'title' => '家族の買い物'],
                ],
                'updated_at' => now()->toJSON(),
            ]]);
        $this->assertSame(2, DB::table('combined_view_lists')->where('combined_view_id', $view->id)->count());
    }

    public function test_順番だけ・名前だけでも変えられ、省略した項目は変えない(): void
    {
        $this->freezeSecond();
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $view->forceFill(['updated_at' => now()->subHour()])->save();
        $this->actingAsUser($this->me);

        $this->patchJson("/api/combined-views/{$view->id}", ['list_ids' => [$this->mine->id, $this->family->id]])
            ->assertOk()
            ->assertJsonPath('data.name', '家族と自分の買い物')
            ->assertJsonPath('data.lists.0.id', $this->mine->id)
            ->assertJsonPath('data.updated_at', now()->toJSON());

        $this->travel(1)->minutes();
        $this->patchJson("/api/combined-views/{$view->id}", ['name' => '買い物'])
            ->assertOk()
            ->assertJsonPath('data.lists.0.id', $this->mine->id)
            ->assertJsonPath('data.updated_at', now()->toJSON());
    }

    public function test_何も変わらない送信では、更新日時を変えない(): void
    {
        $this->freezeSecond();
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $view->forceFill(['updated_at' => now()->subHour()])->save();

        $this->actingAsUser($this->me)
            ->patchJson("/api/combined-views/{$view->id}", [
                'name' => '家族と自分の買い物',
                'list_ids' => [$this->family->id, $this->mine->id],
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_at', now()->subHour()->toJSON());
    }

    public function test_変えるときも、見られないリストは422で何も変えない(): void
    {
        $others = PackingList::factory()->for($this->stranger)->create();
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);

        $this->actingAsUser($this->me)
            ->patchJson("/api/combined-views/{$view->id}", ['name' => '変えた', 'list_ids' => [$this->mine->id, $others->id]])
            ->assertUnprocessable()
            ->assertJsonPath('errors.list_ids.0', self::LISTS_INVALID);

        $this->assertSame('家族と自分の買い物', $view->fresh()->name);
        $this->assertSame([$this->family->id, $this->mine->id], $view->lists()->pluck('packing_lists.id')->all());
    }

    public function test_変える項目がない・null・定義していない項目は422(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);
        $this->actingAsUser($this->me);

        $this->patchJson("/api/combined-views/{$view->id}", [])
            ->assertUnprocessable()
            ->assertJsonPath('errors._form.0', '変更する項目を入力してください。');
        $this->patchJson("/api/combined-views/{$view->id}", ['name' => null])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'まとめ表示の名前を入力してください。');
        $this->patchJson("/api/combined-views/{$view->id}", ['list_ids' => null])
            ->assertUnprocessable()
            ->assertJsonPath('errors.list_ids.0', 'まとめて表示するリストを2件以上選んでください。');
        $this->patchJson("/api/combined-views/{$view->id}", ['name' => '買い物', 'user_id' => $this->owner->id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.user_id.0', 'この項目は送信できません。');

        $this->assertSame('家族と自分の買い物', $view->fresh()->name);
        $this->assertSame($this->me->id, $view->fresh()->user_id);
    }

    // ---- 共通 ----

    public function test_まとめ表示の操作は共同編集に配信しない(): void
    {
        $notified = [];
        $this->app->instance(ListChangeNotifier::class, new class($notified) extends ListChangeNotifier
        {
            /**
             * @param  list<int>  $notified
             */
            public function __construct(private array &$notified) {}

            public function notify(int $listId, ?string $socketId = null): void
            {
                $this->notified[] = $listId;
            }
        });
        $this->actingAsUser($this->me);

        $id = $this->postJson('/api/combined-views', ['name' => '買い物', 'list_ids' => [$this->family->id, $this->mine->id]])
            ->assertCreated()
            ->json('data.id');
        $this->patchJson("/api/combined-views/{$id}", ['list_ids' => [$this->mine->id, $this->family->id]])->assertOk();
        $this->deleteJson("/api/combined-views/{$id}")->assertNoContent();

        $this->assertSame([], $notified);
    }

    public function test_ログインしていない・メール未認証では使えない(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);

        $this->getJson('/api/combined-views')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
        $this->postJson('/api/combined-views', ['name' => '買い物', 'list_ids' => [1, 2]])->assertUnauthorized();
        $this->getJson("/api/combined-views/{$view->id}")->assertUnauthorized();

        $unverified = User::factory()->unverified()->create();
        $this->actingAsUser($unverified)
            ->getJson('/api/combined-views')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');
    }

    public function test_消すときに本文を送ると422で消さない(): void
    {
        $view = $this->createView($this->me, [$this->family->id, $this->mine->id]);

        $this->actingAsUser($this->me)
            ->deleteJson("/api/combined-views/{$view->id}", ['name' => '買い物'])
            ->assertUnprocessable();

        $this->assertNotNull($view->fresh());
    }
}
