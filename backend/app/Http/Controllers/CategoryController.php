<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    /**
     * API-18 カテゴリーの一覧。ログイン不要。表示順（D-33）で「その他」が最後になる。
     */
    public function __invoke(): AnonymousResourceCollection
    {
        return CategoryResource::collection(
            Category::orderBy('sort_order')->orderBy('id')->get(),
        );
    }
}
