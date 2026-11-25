<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 共同編集のメンバー（編集者、D-119）。招待リンクから参加した人を、リストごとに1行で持つ。
 * 所有者は packing_lists.user_id で持ち、この表には入れない。
 */
#[Fillable(['user_id'])]
class PackingListMember extends Model
{
    /**
     * @return BelongsTo<PackingList, $this>
     */
    public function packingList(): BelongsTo
    {
        return $this->belongsTo(PackingList::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
