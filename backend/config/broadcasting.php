<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | D-119：共同編集の「変わった」という合図の配信先。開発では reverb、
    | 公開先では同じ方式の外部サービスの pusher（費用を月1,000円に収めるため）、
    | テストと配信を動かさない環境では null か log にする。
    |
    */

    'default' => env('BROADCAST_CONNECTION', 'null'),

    'connections' => [

        'reverb' => [
            'driver' => 'reverb',
            'key' => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),
            // Laravel から Reverb へ合図を送るときの宛先（開発では compose の reverb）
            'options' => [
                'host' => env('REVERB_HOST'),
                'port' => env('REVERB_PORT', 443),
                'scheme' => env('REVERB_SCHEME', 'https'),
                'useTLS' => env('REVERB_SCHEME', 'https') === 'https',
            ],
            'client_options' => [
                // D-119：配信は保存の後にその場で送るので、Reverb が止まっていても保存の応答を長く待たせない
                'connect_timeout' => 1,
                'timeout' => 3,
            ],
        ],

        // D-119：公開先の配信（Pusher の無料枠）。合図の送り先は、クラスターから Pusher の API の宛先を決める
        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            'options' => [
                'cluster' => env('PUSHER_APP_CLUSTER'),
                'host' => env('PUSHER_HOST') ?: 'api-'.env('PUSHER_APP_CLUSTER', 'mt1').'.pusher.com',
                'port' => env('PUSHER_PORT', 443),
                'scheme' => env('PUSHER_SCHEME', 'https'),
                'encrypted' => true,
                'useTLS' => env('PUSHER_SCHEME', 'https') === 'https',
            ],
            'client_options' => [
                // reverb と同じく、配信先が止まっていても保存の応答を長く待たせない
                'connect_timeout' => 1,
                'timeout' => 3,
            ],
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
