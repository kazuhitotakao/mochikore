<?php

namespace App\Http\Requests;

/**
 * リストの作成（API-06）と編集（API-08）で、名前と説明文に同じ条件を使う（V-04・V-06）。
 */
trait NormalizesListText
{
    /**
     * V-04・V-08：名前の途中の改行・タブを拒否する。
     * 前後のものは標準の TrimStrings が削るので、残るのは途中にあるものだけ。
     */
    // タブ・LF・VT・FF・CR・NEL・行区切り・段落区切り。画面（features/lists/validation.ts）と同じ文字
    private const LINE_BREAK_OR_TAB = '/[\x{09}\x{0A}\x{0B}\x{0C}\x{0D}\x{85}\x{2028}\x{2029}]/u';

    /**
     * V-06・C-01：説明文の途中の CRLF・CR を LF にそろえる。文字数は変換後で数える。
     * 前後の空白・改行の削除と空文字→null は標準に任せ、文字列のときだけ変換する。
     */
    protected function normalizeLineBreaks(string $key): void
    {
        $value = $this->input($key);
        if (! is_string($value)) {
            return;
        }

        $this->merge([$key => str_replace(["\r\n", "\r"], "\n", $value)]);
    }
}
