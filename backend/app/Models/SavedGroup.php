<?php

namespace App\Models;

use App\Enums\GroupCheckMode;
use Database\Factories\SavedGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * よく使うグループ（D-102）。グループ整理（SC-09）で、丸のグループ名とチェックの動き（D-122）をカテゴリー1つで保存する。
 * リスト・グループとはつながらず、候補から丸を足すときは名前と設定を複製する。
 */
#[Fillable(['name', 'category_id', 'check_mode'])]
class SavedGroup extends Model
{
    /** @use HasFactory<SavedGroupFactory> */
    use HasFactory;

    // D-102：1人100件まで
    public const MAX_PER_USER = 100;

    /**
     * D-122：DBの既定値と同じ「通常」。
     *
     * @var array<string, mixed>
     */
    protected $attributes = ['check_mode' => GroupCheckMode::Normal->value];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'check_mode' => GroupCheckMode::class,
        ];
    }

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
