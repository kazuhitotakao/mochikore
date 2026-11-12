<?php

namespace App\Policies;

use App\Models\SavedGroup;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class SavedGroupPolicy
{
    /**
     * よく使うグループの削除（API-41）。ほかの人の候補は、存在しない候補と同じ404にする（07_権限）。
     */
    public function delete(User $user, SavedGroup $savedGroup): Response
    {
        return $user->id === $savedGroup->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
