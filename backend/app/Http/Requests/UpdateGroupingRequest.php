<?php

namespace App\Http\Requests;

use App\Models\PackingListGroup;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGroupingRequest extends FormRequest
{
    use NormalizesListText;

    // C-02：JSON の整数は安全整数の範囲まで
    private const MAX_SAFE_INTEGER = 9007199254740991;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * 06_API一覧「グループ整理のAPI仕様」：ここでは基本の型・必須条件だけを確かめる。
     * グループIDがこのリストのものか・全有効持ち物が1件ずつそろっているかは、
     * 親リストをロックして revision を比べた後に GroupingService で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // V-13
            'base_revision' => ['bail', 'required', 'integer:strict', 'min:0', 'max:'.self::MAX_SAFE_INTEGER],

            // V-14：0〜20グループ。配列の順が見出しの順（sort_order は0から）
            'groups' => ['bail', 'present', 'array', 'list', 'max:'.PackingListGroup::MAX_PER_LIST],
            'groups.*' => ['bail', 'required', 'array'],
            // key は下書きの識別だけに使い、DBには保存しない
            'groups.*.key' => ['bail', 'required', 'string', 'regex:/\A[A-Za-z0-9_-]{1,64}\z/', 'distinct:strict'],
            // 既存のグループはID、新しいグループは null
            'groups.*.id' => ['bail', 'present', 'nullable', 'integer:strict', 'min:1', 'distinct:strict'],
            // D-57：前後空白を削った後で1〜50文字。予約名「未分類」と、同じリストの中の同名（完全一致）は使えない。
            // 照合順序（utf8mb4_unicode_ci）に頼らず、送られた名前どうしを PHP で比べる（distinct:strict）
            'groups.*.name' => [
                'bail', 'required', 'string', 'max:50', 'not_regex:'.self::LINE_BREAK_OR_TAB,
                Rule::notIn([PackingListGroup::RESERVED_NAME]), 'distinct:strict',
            ],

            // 全有効持ち物を1件ずつ。group_key が null なら未分類
            'assignments' => ['bail', 'present', 'array', 'list'],
            'assignments.*' => ['bail', 'required', 'array'],
            'assignments.*.item_id' => ['bail', 'required', 'integer:strict', 'min:1', 'distinct:strict'],
            'assignments.*.group_key' => ['bail', 'present', 'nullable', 'string', Rule::in($this->groupKeys())],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['groups.*.name' => __('validation.grouping.name_attribute')];
    }

    /**
     * 送られた groups の key。所属先がこの中にあるかを確かめる。
     *
     * @return list<string>
     */
    private function groupKeys(): array
    {
        $groups = $this->input('groups');
        if (! is_array($groups)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($group) => is_array($group) ? ($group['key'] ?? null) : null, $groups),
            'is_string',
        ));
    }
}
