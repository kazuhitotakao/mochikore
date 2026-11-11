<?php

namespace App\Models;

use Database\Factories\SavedItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * よく使う項目（D-66）。本人が選んだときだけ、名前とカテゴリー1つで保存する（D-68）。
 * リスト・持ち物とはつながらず、リストへ追加するときは名前を複製する。
 */
#[Fillable(['name', 'category_id'])]
class SavedItem extends Model
{
    /** @use HasFactory<SavedItemFactory> */
    use HasFactory;

    // D-72：1人200件まで
    public const MAX_PER_USER = 200;

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
