<?php

namespace App\Models;

use Database\Factories\SavedGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * よく使うグループ（D-102）。グループ整理（SC-09）で、丸のグループ名だけをカテゴリー1つで保存する。
 * リスト・グループとはつながらず、候補から丸を足すときは名前を複製する。
 */
#[Fillable(['name', 'category_id'])]
class SavedGroup extends Model
{
    /** @use HasFactory<SavedGroupFactory> */
    use HasFactory;

    // D-102：1人100件まで
    public const MAX_PER_USER = 100;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Category, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
