<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * まとめ表示（D-124）。選んだ複数のリストを1つの画面に並べるための、本人だけの名前と並び。
 * 持ち物・グループ・チェックは元のリストのまま持ち、ここには写さない。共同編集のメンバーにも見せない。
 */
#[Fillable(['name'])]
class CombinedView extends Model
{
    // D-124：1人10件まで
    public const MAX_PER_USER = 10;

    // D-124：1つのまとめ表示に並べるリストは2〜5件
    public const MIN_LISTS = 2;

    public const MAX_LISTS = 5;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * 並べるリスト（選んだ順）。見られなくなったリストを含むことがあるので、返すときは
     * PackingList::accessibleBy で絞る（D-124）。
     *
     * @return BelongsToMany<PackingList, $this>
     */
    public function lists(): BelongsToMany
    {
        return $this->belongsToMany(PackingList::class, 'combined_view_lists')
            ->withPivot('sort_order')
            ->withTimestamps()
            ->orderByPivot('sort_order')
            ->orderByPivot('id');
    }
}
