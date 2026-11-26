<?php

namespace App\Http\Requests;

use App\Models\CombinedView;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * V-31・D-124：まとめ表示の作成（API-66）と変更（API-68）で、名前と並べるリストに同じ条件を使う。
 * ここでは形だけを確かめる。本人が見られるリストかと、1人10件の上限は CombinedViewService で確かめる。
 */
trait ValidatesCombinedView
{
    use NormalizesListText;

    private const FIELDS = ['name', 'list_ids'];

    /**
     * @param  list<string>  $presence  作成では required、変更では sometimes と required
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    private function combinedViewRules(array $presence): array
    {
        return [
            // V-04 のリスト名と同じ条件。同じ名前のまとめ表示も作れる
            'name' => ['bail', ...$presence, 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB],
            // 選んだ順に並べる。C-02：JSON の正の整数だけで、"1"・1.5 は変換せずに拒否する
            'list_ids' => ['bail', ...$presence, 'array', 'list', 'min:'.CombinedView::MIN_LISTS, 'max:'.CombinedView::MAX_LISTS],
            'list_ids.*' => ['bail', 'integer:strict', 'min:1', 'distinct:strict'],
        ];
    }

    /**
     * 特定の決まりの文言を先に書く（ワイルドカードを先に書くと、選んでいないときの文まで上書きするため）。
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $lists = __('validation.combined_view.lists');

        return [
            'list_ids.required' => __('validation.combined_view.min'),
            'list_ids.min' => __('validation.combined_view.min'),
            'list_ids.max' => __('validation.combined_view.max'),
            'list_ids.array' => $lists,
            'list_ids.list' => $lists,
            'list_ids.*.*' => $lists,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['name' => __('validation.combined_view.attribute')];
    }
}
