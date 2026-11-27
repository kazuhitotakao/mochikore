<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 本人の写真（F-38、D-128）。本人と、共同編集で同じリストのメンバーにだけ見せ、公開リストには出さない。
 * ブラウザで256px四方の JPEG に作り直してから受け取るので、撮影場所などの情報は持たない。
 */
#[Fillable(['image'])]
#[Hidden(['image'])]
class UserAvatar extends Model
{
    // V-32：ブラウザで作り直す大きさ（px、正方形）と、受け取る容量の上限（バイト）
    public const SIZE = 256;

    public const MAX_BYTES = 60 * 1024;

    // 1人1枚なので、利用者のIDをそのまま主キーにする
    protected $primaryKey = 'user_id';

    public $incrementing = false;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * 画面の img でそのまま表示できる形（data URL）。JSON の中で返し、Next.js の窓口は文字のまま通す。
     */
    public function dataUrl(): string
    {
        return 'data:image/jpeg;base64,'.base64_encode($this->image);
    }
}
