<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | D-119：共同編集の「変わった」という合図の配信先。開発・公開では reverb
    | （公開先で外部サービスにするときは、同じ方式の接続を足す）、
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

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
