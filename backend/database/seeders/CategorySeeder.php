<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    /**
     * 01_機能一覧「カテゴリーの一覧」の順。「その他」は最後（D-33・D-69）。
     *
     * @var list<array{name: string, example: string}>
     */
    private const CATEGORIES = [
        ['name' => '旅行・お泊まり', 'example' => '旅行、帰省、出張'],
        ['name' => 'お出かけ', 'example' => '公園、遊園地、外出'],
        ['name' => '買い物', 'example' => '食料品、日用品'],
        ['name' => '保育園・学校', 'example' => '登園、通学、学校行事'],
        ['name' => '仕事・通勤', 'example' => '出勤、外回り、研修'],
        ['name' => '趣味・スポーツ', 'example' => 'キャンプ、釣り、ジム'],
        ['name' => '通院・入院', 'example' => '診察、検査、入院'],
        ['name' => '結婚式・お葬式', 'example' => '式に持っていくもの'],
        ['name' => '防災・避難', 'example' => '非常用の持ち出し、避難'],
        ['name' => 'その他', 'example' => 'どれにも当てはまらないもの'],
    ];

    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach (self::CATEGORIES as $index => $category) {
            // D-69：表示順とidは別に持つ。名前で探して例と表示順だけを直すので、繰り返しても重複せず、
            // 登録済みのidとリストの所属は変わらない。足りないカテゴリーだけ新しいidで追加される
            Category::updateOrCreate(
                ['name' => $category['name']],
                ['example' => $category['example'], 'sort_order' => $index + 1],
            );
        }
    }
}
