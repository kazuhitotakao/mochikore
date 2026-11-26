<?php

namespace App\Services;

use App\Enums\ApiErrorCode;
use App\Exceptions\ApiException;
use App\Models\CombinedView;
use App\Models\PackingList;
use App\Models\PackingListMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * まとめ表示（F-37、D-124）。本人だけの名前と、並べるリストの順番を保存する。
 * 元のリストは変えない（更新日時・公開・共同編集の設定もそのまま、D-24）。
 */
class CombinedViewService
{
    /**
     * API-66 まとめ表示を作る。1人10件まで。
     *
     * @param  list<int>  $listIds  選んだ順
     */
    public function create(User $user, string $name, array $listIds): CombinedView
    {
        return DB::transaction(function () use ($user, $name, $listIds) {
            // C-05：9件の人が同時に2件送っても11件にならないよう、本人の行をロックしてから数える
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($user->combinedViews()->count() >= CombinedView::MAX_PER_USER) {
                throw new ApiException(ApiErrorCode::CombinedViewLimitReached, 'まとめ表示は10件までです。');
            }

            $this->ensureAccessible($user, $listIds);

            $view = $user->combinedViews()->create(['name' => $name]);
            $view->lists()->sync(self::ordered($listIds));

            return $view;
        });
    }

    /**
     * API-68 まとめ表示を変える。送られた項目だけを変え、list_ids は並べるリストと順番を丸ごと置き換える。
     * 名前・リスト・順番のどれかが変わったときだけ、更新日時を新しくする（SC-05 の並び順、D-24 と同じ考え方）。
     *
     * @param  array{name?: string, list_ids?: list<int>}  $changes
     */
    public function update(User $user, CombinedView $view, array $changes): CombinedView
    {
        return DB::transaction(function () use ($user, $view, $changes) {
            $locked = CombinedView::whereKey($view->id)->lockForUpdate()->firstOrFail();
            $changed = false;

            if (array_key_exists('list_ids', $changes)) {
                $this->ensureAccessible($user, $changes['list_ids']);
                // 見られなくなって外れていたリストも、送られた並びに入っていなければ消える
                $result = $locked->lists()->sync(self::ordered($changes['list_ids']));
                $changed = $result['attached'] !== [] || $result['detached'] !== [] || $result['updated'] !== [];
            }

            if (array_key_exists('name', $changes)) {
                $locked->name = $changes['name'];
                $changed = $changed || $locked->isDirty('name');
            }

            if ($changed) {
                $locked->updated_at = now();
                $locked->save();
            }

            return $locked;
        });
    }

    /**
     * D-124：共同編集から外された・抜けた人のまとめ表示から、そのリストを外す（API-59・60）。
     * メンバーの行を消したのと同じトランザクションで呼ぶ。まとめ表示の更新日時は変えない。
     */
    public function forgetList(int $userId, int $listId): void
    {
        // まとめ表示の行はロックせずに読む。DELETE の副問い合わせにすると、まとめ表示を変える処理（API-68）と
        // ロックを取り合うことがあるため
        $viewIds = CombinedView::where('user_id', $userId)->pluck('id');
        if ($viewIds->isEmpty()) {
            return;
        }

        DB::table('combined_view_lists')
            ->where('packing_list_id', $listId)
            ->whereIn('combined_view_id', $viewIds)
            ->delete();
    }

    /**
     * D-124・D-119：本人が今見られるリスト（所有者か、共同編集のメンバー）だけを入れられる。
     * 見られないリストは、存在するかを区別しない同じ文にする（D-43）。
     * 外す・抜ける処理（API-59・60）や削除と同時に送られても、見られないリストを残さないよう、
     * リストとメンバーの行を共有ロックしてから確かめる。
     *
     * @param  list<int>  $listIds
     */
    private function ensureAccessible(User $user, array $listIds): void
    {
        $owners = PackingList::whereIn('id', $listIds)->sharedLock()->pluck('user_id', 'id');
        $joined = PackingListMember::whereIn('packing_list_id', $listIds)
            ->where('user_id', $user->id)
            ->sharedLock()
            ->pluck('packing_list_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach ($listIds as $listId) {
            $accessible = (int) $owners->get($listId) === $user->id || in_array($listId, $joined, true);
            if (! $accessible) {
                throw ValidationException::withMessages(['list_ids' => [__('validation.combined_view.lists')]]);
            }
        }
    }

    /**
     * 選んだ順に 0 から番号を付ける。
     *
     * @param  list<int>  $listIds
     * @return array<int, array{sort_order: int}>
     */
    private static function ordered(array $listIds): array
    {
        $ordered = [];
        foreach (array_values($listIds) as $index => $listId) {
            $ordered[$listId] = ['sort_order' => $index];
        }

        return $ordered;
    }
}
