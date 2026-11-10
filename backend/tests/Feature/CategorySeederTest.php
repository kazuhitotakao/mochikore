<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CategorySeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_10カテゴリーが設計の順に例つきで登録される(): void
    {
        $this->seed(CategorySeeder::class);

        $categories = Category::orderBy('sort_order')->get(['name', 'example', 'sort_order']);

        // 01_機能一覧「カテゴリーの一覧」・D-69：買い物はお出かけの次、その他は最後
        $this->assertSame([
            ['name' => '旅行・お泊まり', 'example' => '旅行、帰省、出張', 'sort_order' => 1],
            ['name' => 'お出かけ', 'example' => '公園、遊園地、外出', 'sort_order' => 2],
            ['name' => '買い物', 'example' => '食料品、日用品', 'sort_order' => 3],
            ['name' => '保育園・学校', 'example' => '登園、通学、学校行事', 'sort_order' => 4],
            ['name' => '仕事・通勤', 'example' => '出勤、外回り、研修', 'sort_order' => 5],
            ['name' => '趣味・スポーツ', 'example' => 'キャンプ、釣り、ジム', 'sort_order' => 6],
            ['name' => '通院・入院', 'example' => '診察、検査、入院', 'sort_order' => 7],
            ['name' => '結婚式・お葬式', 'example' => '式に持っていくもの', 'sort_order' => 8],
            ['name' => '防災・避難', 'example' => '非常用の持ち出し、避難', 'sort_order' => 9],
            ['name' => 'その他', 'example' => 'どれにも当てはまらないもの', 'sort_order' => 10],
        ], $categories->toArray());
    }

    public function test_繰り返し実行しても重複せず、idも変わらない(): void
    {
        $this->seed(CategorySeeder::class);
        $before = Category::orderBy('id')->pluck('name', 'id')->all();

        $this->seed(CategorySeeder::class);

        $this->assertSame(10, Category::count());
        $this->assertSame($before, Category::orderBy('id')->pluck('name', 'id')->all());
    }

    public function test_買い物がない既存データでは、既存のidとリストの所属を保って買い物を追加する(): void
    {
        // D-69：買い物を足す前の9種類が登録済みで、お出かけの例にまだ買い物が入っている状態
        $now = now();
        $oldNames = ['旅行・お泊まり', 'お出かけ', '保育園・学校', '仕事・通勤', '趣味・スポーツ', '通院・入院', '結婚式・お葬式', '防災・避難', 'その他'];
        foreach ($oldNames as $index => $name) {
            DB::table('categories')->insert([
                'name' => $name,
                'example' => $name === 'お出かけ' ? '公園、買い物、外出' : '古い例',
                'sort_order' => $index + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
        $oldIds = Category::pluck('id', 'name')->all();

        $user = User::factory()->create();
        $listId = DB::table('packing_lists')->insertGetId([
            'user_id' => $user->id,
            'category_id' => $oldIds['お出かけ'],
            'title' => '公園',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->seed(CategorySeeder::class);

        $this->assertSame(10, Category::count());
        foreach ($oldIds as $name => $id) {
            $this->assertSame($id, Category::where('name', $name)->value('id'));
        }

        $shopping = Category::where('name', '買い物')->firstOrFail();
        $this->assertGreaterThan(max($oldIds), $shopping->id);
        $this->assertSame(3, $shopping->sort_order);
        $this->assertSame(10, Category::where('name', 'その他')->value('sort_order'));
        $this->assertSame('公園、遊園地、外出', Category::where('name', 'お出かけ')->value('example'));

        $this->assertSame($oldIds['お出かけ'], DB::table('packing_lists')->where('id', $listId)->value('category_id'));
    }
}
