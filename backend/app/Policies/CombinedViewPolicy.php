<?php

namespace App\Policies;

use App\Models\CombinedView;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class CombinedViewPolicy
{
    /**
     * まとめ表示を見る・変える・消す（API-67〜69）。本人だけができる。
     * D-124・D-43：ほかの人（共同編集のメンバーを含む）のまとめ表示は、存在しないものと同じ404にし、あることを知らせない。
     */
    public function manage(User $user, CombinedView $combinedView): Response
    {
        return $user->id === $combinedView->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
