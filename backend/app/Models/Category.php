<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * リストの用途（10種類で固定、D-02・D-69）。リスト内のグループ（PackingListGroup）とは別物。
 * 利用者は追加・変更できず、CategorySeederだけで登録する。
 */
#[Fillable(['name', 'example', 'sort_order'])]
class Category extends Model
{
    //
}
