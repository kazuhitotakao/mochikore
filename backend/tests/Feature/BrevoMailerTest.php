<?php

namespace Tests\Feature;

use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;
use Symfony\Component\Mailer\Exception\IncompleteDsnException;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Tests\TestCase;

// D-15：公開先（Railway の Hobby）は SMTP で外へ送れないので、brevo の送り方は HTTPS の API で送る。
// 実際の Brevo へは送らず、送り手を差し替えて中身を確かめる
class BrevoMailerTest extends TestCase
{
    public function test_brevo_mailer_uses_the_https_api(): void
    {
        config(['services.brevo.key' => 'test-api-key']);

        $transport = Mail::mailer('brevo')->getSymfonyTransport();

        $this->assertInstanceOf(BrevoApiTransport::class, $transport);
        $this->assertSame('brevo+api://api.brevo.com', (string) $transport);
    }

    public function test_brevo_mailer_sends_the_message_to_the_api_with_the_key(): void
    {
        $requests = [];
        $this->app->instance(HttpClientInterface::class, new MockHttpClient(
            function (string $method, string $url, array $options) use (&$requests): MockResponse {
                $requests[] = ['method' => $method, 'url' => $url, 'options' => $options];

                return new MockResponse((string) json_encode(['messageId' => '<test@brevo>']), ['http_code' => 201]);
            },
        ));
        config([
            'services.brevo.key' => 'test-api-key',
            'mail.from.address' => 'no-reply@mochikore.com',
            'mail.from.name' => 'もちこれ',
        ]);

        Mail::mailer('brevo')->raw('本文です', fn (Message $message) => $message->to('user@example.com')->subject('件名です'));

        $this->assertCount(1, $requests);
        $this->assertSame('POST', $requests[0]['method']);
        $this->assertSame('https://api.brevo.com/v3/smtp/email', $requests[0]['url']);
        $this->assertContains('api-key: test-api-key', $requests[0]['options']['headers']);

        $payload = json_decode($requests[0]['options']['body'], true);
        $this->assertSame('no-reply@mochikore.com', $payload['sender']['email']);
        $this->assertSame('もちこれ', $payload['sender']['name']);
        $this->assertSame(['user@example.com'], array_column($payload['to'], 'email'));
        $this->assertSame('件名です', $payload['subject']);
        $this->assertSame('本文です', $payload['textContent']);
    }

    // キーがないまま公開先で送ろうとしたときに、黙って捨てずに失敗させる
    public function test_brevo_mailer_requires_the_api_key(): void
    {
        config(['services.brevo.key' => null]);

        $this->expectException(IncompleteDsnException::class);

        Mail::mailer('brevo')->getSymfonyTransport();
    }
}
