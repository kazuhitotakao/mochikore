<?php

namespace App\Policies;

use App\Models\PackingList;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class PackingListPolicy
{
    public function copy(User $user, PackingList $list): Response
    {
        // D-10・43・48：自分のリストでも、公開されているものだけをコピーできる
        return $list->is_public && $list->moderated_at === null
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /**
     * 自分のリストの内容を見る（API-07）。
     */
    public function view(User $user, PackingList $list): Response
    {
        return $this->ownedBy($user, $list);
    }

    /**
     * リストの編集（API-08）。
     */
    public function update(User $user, PackingList $list): Response
    {
        return $this->ownedBy($user, $list);
    }

    /**
     * リストの削除（API-09）。
     */
    public function delete(User $user, PackingList $list): Response
    {
        return $this->ownedBy($user, $list);
    }

    /**
     * D-43：他人のリストは、存在しないリストと同じ404にして、そのIDのリストがあることを知らせない。
     */
    private function ownedBy(User $user, PackingList $list): Response
    {
        return $user->id === $list->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
