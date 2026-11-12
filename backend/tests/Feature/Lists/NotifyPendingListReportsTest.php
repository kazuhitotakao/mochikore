<?php

namespace Tests\Feature\Lists;

use App\Models\ListReport;
use App\Models\PackingList;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mime\Email;

class NotifyPendingListReportsTest extends ListApiTestCase
{
    public function test_未確認がなければメールを送らない(): void
    {
        Mail::spy();
        $this->artisan('reports:notify')->expectsOutput('未確認の通報はありません。')->assertSuccessful();
        Mail::shouldNotHaveReceived('raw');
    }

    public function test_未確認だけをリストごとに数え1通にまとめ確認済みにはしない(): void
    {
        Mail::spy();
        config(['app.frontend_url' => 'https://mochikore.example/']);
        $first = PackingList::factory()->create(['title' => 'メールへ出さないリスト名']);
        $second = PackingList::factory()->create();
        $reviewed = PackingList::factory()->create();
        foreach ([$first, $first, $second] as $list) {
            ListReport::create(['packing_list_id' => $list->id, 'reason' => 'spam']);
        }
        ListReport::create(['packing_list_id' => $reviewed->id, 'reason' => 'other', 'reviewed_at' => now()]);

        $this->artisan('reports:notify')->expectsOutput('未確認の通報3件を通知しました。')->assertSuccessful();
        Mail::shouldHaveReceived('raw')->once()->withArgs(function (string $body, callable $configure) use ($first, $second, $reviewed) {
            $this->assertStringContainsString('未確認の通報が3件あります。', $body);
            $this->assertStringContainsString("2件：https://mochikore.example/public/lists/{$first->id}", $body);
            $this->assertStringContainsString("1件：https://mochikore.example/public/lists/{$second->id}", $body);
            $this->assertStringNotContainsString("/public/lists/{$reviewed->id}", $body);
            $this->assertStringNotContainsString($first->title, $body);
            $message = new Message(new Email);
            $configure($message);
            $this->assertSame('simasyam@gmail.com', $message->getSymfonyMessage()->getTo()[0]->getAddress());
            $this->assertSame('【もちこれ】未確認の通報があります', $message->getSymfonyMessage()->getSubject());

            return true;
        });
        $this->assertSame(3, ListReport::whereNull('reviewed_at')->count());
    }

    public function test_確認済みだけなら通知せずリストの削除で通報も消える(): void
    {
        Mail::spy();
        $list = PackingList::factory()->create();
        ListReport::create(['packing_list_id' => $list->id, 'reason' => 'other', 'reviewed_at' => now()]);
        $this->artisan('reports:notify')->assertSuccessful();
        Mail::shouldNotHaveReceived('raw');
        $list->delete();
        $this->assertDatabaseCount('list_reports', 0);
    }

    public function test_送信失敗は失敗終了し未確認の通報を残す(): void
    {
        $list = PackingList::factory()->create();
        ListReport::create(['packing_list_id' => $list->id, 'reason' => 'other']);
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('mail unavailable'));
        $this->artisan('reports:notify')->expectsOutput('通報の通知に失敗しました。メールの設定と接続を確認してください。')->assertFailed();
        $this->assertSame(1, ListReport::whereNull('reviewed_at')->count());
    }

    public function test_通報通知は1日1回で重複起動を防ぐ(): void
    {
        $events = collect(app(Schedule::class)->events())->filter(fn ($event) => str_contains($event->command ?? '', 'reports:notify'));
        $this->assertCount(1, $events);
        $this->assertSame('0 0 * * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
        $this->assertSame('Asia/Tokyo', $events->first()->timezone);
    }
}
