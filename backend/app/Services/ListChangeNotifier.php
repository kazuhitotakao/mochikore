<?php

namespace App\Services;

use App\Models\PackingList;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Broadcast;
use Throwable;

/**
 * 共同編集のリストが「変わった」という合図を、開いているほかのメンバーへ配信する（F-35、D-119）。
 * 中身（持ち物の名前など）は送らない。受け取った画面が、今までのAPI（API-07・29）で読み直す。
 * キューは使わず、保存の後にその場で送る。
 */
class ListChangeNotifier
{
    // 画面（frontend/src/lib/realtime）と同じ名前にする
    public const EVENT = 'changed';

    private const CHANNEL_PREFIX = 'lists.';

    // pusher-js が付ける接続の番号（例：1234.5678）。操作した本人の画面を配信先から外すのに使う
    private const SOCKET_ID_PATTERN = '/\A\d+\.\d+\z/';

    /**
     * リストごとのプライベートチャンネルの名前。認可（API-63）は所有者とメンバーにだけ通す。
     */
    public static function channelName(int|string $listId): string
    {
        return self::CHANNEL_PREFIX.$listId;
    }

    /**
     * チャンネルを聞いてよい人を登録する。所有者とメンバーにだけ聞かせる（API-63）。
     * 起動時（AppServiceProvider）に、そのときの配信先へ登録する。
     */
    public static function registerChannel(): void
    {
        Broadcast::channel(
            self::channelName('{listId}'),
            fn (User $user, string $listId): bool => PackingList::whereKey($listId)->accessibleBy($user)->exists(),
        );
    }

    public function notify(int $listId, ?string $socketId = null): void
    {
        $payload = is_string($socketId) && preg_match(self::SOCKET_ID_PATTERN, $socketId) === 1
            ? ['socket' => $socketId]
            : [];

        try {
            Broadcast::connection()->broadcast([new PrivateChannel(self::channelName($listId))], self::EVENT, $payload);
        } catch (Throwable $e) {
            // D-119：配信に失敗しても保存は成功のままにする。ほかのメンバーは、再接続・画面に戻ったときに読み直す
            report($e);
        }
    }
}
