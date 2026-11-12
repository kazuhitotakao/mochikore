<?php

namespace Tests\Feature\Lists;

use App\Enums\ReportReason;
use App\Models\ListReport;
use App\Models\PackingList;
use App\Models\User;
use App\Services\ListReportService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * F-17・SC-11・API-26、V-22（37行・Jメモ）・C-01〜08、D-46〜48・62・72・92・104。
 */
class StoreListReportTest extends ListApiTestCase
{
    public static function reasons(): array
    {
        return array_map(fn ($reason) => [$reason->value], ReportReason::cases());
    }

    #[DataProvider('reasons')]
    public function test_匿名で4種類を保存し通報者情報・自動非公開・即時メールを加えない(string $reason): void
    {
        Mail::spy();
        $list = PackingList::factory()->create(['is_public' => true, 'grouping_revision' => 4]);
        $updated = $list->updated_at;
        $this->travel(5)->seconds();
        $response = $this->postJson("/api/public/lists/{$list->id}/reports", ['reason' => $reason])->assertNoContent();
        $this->assertSame('', $response->getContent());
        $row = (array) DB::table('list_reports')->sole();
        $this->assertSame(['id', 'packing_list_id', 'reason', 'reviewed_at', 'created_at', 'updated_at'], array_keys($row));
        $this->assertSame($reason, $row['reason']);
        $this->assertSame($list->id, $row['packing_list_id']);
        $this->assertNull($row['reviewed_at']);
        $this->assertTrue($list->fresh()->is_public);
        $this->assertTrue($list->fresh()->updated_at->equalTo($updated));
        $this->assertSame(4, $list->fresh()->grouping_revision);
        Mail::shouldNotHaveReceived('raw');
        Mail::shouldNotHaveReceived('send');
    }

    public function test_未認証・無効トークンでも標準変換後の理由を受け付ける(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $this->actingAsUser(User::factory()->unverified()->create())->postJson("/api/public/lists/{$list->id}/reports", ['reason' => ' spam '])->assertNoContent();
        $this->withToken('invalid-token')->postJson("/api/public/lists/{$list->id}/reports", ['reason' => 'other'])->assertNoContent();
        $this->assertSame(['spam', 'other'], ListReport::orderBy('id')->pluck('reason')->all());
    }

    public static function invalidReasons(): array
    {
        $cases = ['missing' => [[], false]];
        foreach ([null, '', ' ', 'unknown', 'SPAM', 'spam\n'] as $i => $value) {
            $cases['selection-'.$i] = [['reason' => $value], false];
        }
        foreach ([0, 1, 1.5, true, false, [], ['spam'], (object) [], (object) ['code' => 'spam']] as $i => $value) {
            $cases['type-'.$i] = [['reason' => $value], true];
        }

        return $cases;
    }

    #[DataProvider('invalidReasons')]
    public function test_不正な理由は確定した1文で返し保存しない(array $body, bool $typeError): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $this->postJson("/api/public/lists/{$list->id}/reports", $body)->assertUnprocessable()
            ->assertJsonPath('code', 'validation_error')
            ->assertJsonPath('errors.reason', [$typeError ? '通報理由を文字で入力してください。' : '通報理由を選択してください。']);
        $this->assertDatabaseCount('list_reports', 0);
    }

    public function test_未定義の本文キーを拒否する(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $body = ['reason' => 'other', 'user_id' => 1, 'ip_address' => '127.0.0.1', 'reviewed_at' => now()->toJSON(), 'packing_list_id' => $list->id];
        $response = $this->postJson("/api/public/lists/{$list->id}/reports", $body)->assertUnprocessable();
        foreach (['user_id', 'ip_address', 'reviewed_at', 'packing_list_id'] as $field) {
            $response->assertJsonPath('errors.'.$field, ['この項目は送信できません。']);
        }
        $this->assertDatabaseCount('list_reports', 0);
    }

    public function test_非公開・運営非公開・不存在は不正な入力でも同じ404(): void
    {
        $owner = User::factory()->create();
        $private = PackingList::factory()->for($owner)->create();
        $moderated = PackingList::factory()->for($owner)->create(['is_public' => true, 'moderated_at' => now()]);
        foreach ([$private->id, $moderated->id, '9999999', 'abc'] as $id) {
            foreach ([[], ['reason' => 'spam']] as $body) {
                $this->postJson("/api/public/lists/{$id}/reports", $body)->assertNotFound()
                    ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
            }
        }
        $this->actingAsUser($owner)->postJson("/api/public/lists/{$private->id}/reports", ['reason' => 'spam'])->assertNotFound();
        $this->assertDatabaseCount('list_reports', 0);
    }

    public function test_リストをまたいでも同じ_i_pは1時間10回までで別_i_pと別_ap_iには影響しない(): void
    {
        $first = PackingList::factory()->create(['is_public' => true]);
        $second = PackingList::factory()->create(['is_public' => true]);
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.10']);
        for ($i = 0; $i < 10; $i++) {
            $id = $i % 2 === 0 ? $first->id : $second->id;
            $this->postJson("/api/public/lists/{$id}/reports", ['reason' => 'spam'])->assertNoContent();
        }
        $this->postJson("/api/public/lists/{$first->id}/reports", ['reason' => 'other'])->assertTooManyRequests()
            ->assertJsonPath('code', 'too_many_requests')->assertJsonStructure(['retry_after'])->assertHeader('Retry-After');
        $this->getJson("/api/public/lists/{$first->id}")->assertOk();
        $this->assertDatabaseCount('list_reports', 10);
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.11'])->postJson("/api/public/lists/{$first->id}/reports", ['reason' => 'other'])->assertNoContent();
        $this->assertDatabaseCount('list_reports', 11);
        $this->travel(61)->minutes();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.10'])->postJson("/api/public/lists/{$first->id}/reports", ['reason' => 'spam'])->assertNoContent();
    }

    public function test_読み込み後に非公開になってもロック内で再確認する(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        PackingList::whereKey($list->id)->update(['is_public' => false]);
        try {
            app(ListReportService::class)->create($list, 'other');
            $this->fail('非公開リストへの通報を拒否する必要があります。');
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $this->assertDatabaseCount('list_reports', 0);
    }

    public function test_読み込み後に削除されても通報を残さない(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $list->delete();
        $this->expectException(ModelNotFoundException::class);
        app(ListReportService::class)->create($list, 'other');
    }
}
