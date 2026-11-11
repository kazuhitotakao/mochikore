<?php

namespace App\Policies;

use App\Models\SavedItem;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class SavedItemPolicy
{
    /**
     * よく使う項目の削除（API-33）。ほかの人の候補は、存在しない候補と同じ404にする（07_権限）。
     */
    public function delete(User $user, SavedItem $savedItem): Response
    {
        return $user->id === $savedItem->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
