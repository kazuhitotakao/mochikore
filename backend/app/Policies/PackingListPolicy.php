<?php

namespace App\Policies;

use App\Models\PackingList;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class PackingListPolicy
{
    /**
     * 自分のリストの内容を見る（API-07）。
     */
    public function view(User $user, PackingList $list): Response
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
