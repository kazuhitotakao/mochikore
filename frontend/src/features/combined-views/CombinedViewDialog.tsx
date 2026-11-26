"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { Icon } from "@/components/Icon";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import { firstErrors, type FieldErrors } from "@/features/auth/validation";
import { RemainingCount } from "@/features/lists/ListForm";
import { titleLength } from "@/features/lists/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { CombinedView, PackingListSummary } from "@/types/api";
import {
  COMBINED_LISTS_INVALID_MESSAGE,
  COMBINED_VIEW_LIMIT_MESSAGE,
  COMBINED_VIEW_NAME_MAX_LENGTH,
  MAX_COMBINED_LISTS,
  defaultCombinedViewName,
  validateCombinedLists,
  validateCombinedViewName,
} from "./validation";

const FIELDS = ["name", "list_ids"] as const;
// 同じ画面のほかの入力欄と id が重ならないよう、エラーで移すカーソルの先に付ける
const ID_PREFIX = "combined-";

type Props = {
  // 編集するまとめ表示（作るときは null）
  view: CombinedView | null;
  // 作るとき：押したカードのリストを選んだ状態で始める。編集のときは今の並び
  initialListIds: number[];
  // 選べるリスト（SC-05 と同じ順）。自分のリスト一覧（SC-05）から開くときは一覧の値を渡す。
  // まとめ表示（SC-20）から開くときは渡さず、開いた後に API-05 を読む
  lists?: PackingListSummary[];
  // 作るとき、すでに10件あるか（SC-05 は件数を知っているので、送る前に案内する）
  limitReached?: boolean;
  // 「キャンセル」・Esc・外枠で閉じたとき
  onCancel: () => void;
  // 保存できたとき。親がこのダイアログを外すまで送信中のままにし、二重に送らない
  onSaved: (view: CombinedView) => void;
};

/**
 * まとめ表示を作る・編集する（F-37、SC-05-9・SC-20-2、API-66・68、D-124）。
 * 名前と、並べるリスト（2〜5件）を選ぶ。選んだリストは上に表示する順で並び、「上へ」「下へ」で順番を変える。
 * 開いたときだけ置き、閉じたら親が外す。送信中は閉じない（02_画面配置 共通5）。
 */
export function CombinedViewDialog({
  view,
  initialListIds,
  lists: givenLists,
  limitReached = false,
  onCancel,
  onSaved,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [fetchedLists, setFetchedLists] = useState<PackingListSummary[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>(initialListIds);
  // D-124：作るときの名前は、自分で書き換えるまでは選んだリスト名をつないだものにする
  const [name, setName] = useState(view?.name ?? "");
  const [nameEdited, setNameEdited] = useState(view !== null);
  const [sending, setSending] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS, ID_PREFIX);
  const [formError, setFormError] = useState<string | null>(null);

  const lists = givenLists ?? fetchedLists;
  const listById = new Map((lists ?? []).map((list) => [list.id, list]));
  // 選んだ後に一覧から消えたリスト（ほかの画面で削除した・外された）は数えない
  const selectedLists = selected.flatMap((id) => listById.get(id) ?? []);
  const otherLists = (lists ?? []).filter(
    (list) => !selected.includes(list.id),
  );
  const shownName = nameEdited
    ? name
    : defaultCombinedViewName(selectedLists.map((list) => list.title));
  const full = selectedLists.length >= MAX_COMBINED_LISTS;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // SC-20 から開いたときは、開いた後に自分のリスト一覧（API-05）を読む。並びは更新が新しい順（D-24）
  useEffect(() => {
    if (givenLists) return;
    let active = true;
    clientApi<PackingListSummary[]>("/lists")
      .then((result) => {
        if (active) setFetchedLists(result);
      })
      .catch((failure: unknown) => {
        if (!active || redirectIfAuthError(failure)) return;
        setLoadError(NETWORK_ERROR_MESSAGE);
      });
    return () => {
      active = false;
    };
  }, [givenLists, redirectIfAuthError]);

  function closeIfIdle() {
    if (!sending) onCancel();
  }
  const backdrop = useBackdropDismiss(closeIfIdle);

  function toggle(listId: number) {
    fieldErrors.clear("list_ids");
    setSelected((current) =>
      current.includes(listId)
        ? current.filter((id) => id !== listId)
        : [...current, listId],
    );
  }

  function move(listId: number, offset: -1 | 1) {
    setSelected((current) => {
      const visible = current.filter((id) => listById.has(id));
      const index = visible.indexOf(listId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= visible.length) return current;
      const next = [...visible];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || limitReached) return;
    setFormError(null);

    const listIds = selectedLists.map((list) => list.id);
    // C-04：送る前に確かめる。最終的な判定は Laravel が行う（V-31）
    const errors = {
      name: validateCombinedViewName(shownName),
      list_ids: validateCombinedLists(listIds),
    };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSending(true);
    fieldErrors.reset();
    try {
      // 前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      const saved = await clientApi<CombinedView>(
        view ? `/combined-views/${view.id}` : "/combined-views",
        {
          method: view ? "PATCH" : "POST",
          body: { name: shownName, list_ids: listIds },
        },
      );
      onSaved(saved);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        // ほかの画面でまとめ表示が消えていた。読み直すと「ページが見つかりません」になる（D-43）
        router.refresh();
        return;
      }

      const serverErrors =
        failure instanceof ApiError && failure.code === "validation_error"
          ? listIdErrors(failure.errors ?? {})
          : {};
      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else if (
        failure instanceof ApiError &&
        failure.code === "combined_view_limit_reached"
      ) {
        setFormError(COMBINED_VIEW_LIMIT_MESSAGE);
      } else {
        setFormError(NETWORK_ERROR_MESSAGE);
      }
      setSending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeIfIdle();
      }}
      {...backdrop}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          {view ? "まとめ表示を編集" : "まとめ表示を作る"}
        </h2>

        {(limitReached || formError) && (
          <p role="alert" className="text-danger">
            {limitReached ? COMBINED_VIEW_LIMIT_MESSAGE : formError}
          </p>
        )}

        <div>
          <label htmlFor={`${ID_PREFIX}name`} className="mb-1 block font-bold">
            名前
          </label>
          <input
            id={`${ID_PREFIX}name`}
            type="text"
            value={shownName}
            disabled={sending}
            aria-describedby={`${ID_PREFIX}name-count ${ID_PREFIX}name-error`}
            aria-invalid={Boolean(fieldErrors.errors.name)}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
              fieldErrors.clear("name");
            }}
            className="field w-full"
          />
          <RemainingCount
            id={`${ID_PREFIX}name-count`}
            max={COMBINED_VIEW_NAME_MAX_LENGTH}
            length={titleLength(shownName)}
          />
          <FieldError
            id={`${ID_PREFIX}name-error`}
            message={fieldErrors.errors.name}
          />
        </div>

        <fieldset
          id={`${ID_PREFIX}list_ids`}
          tabIndex={-1}
          aria-describedby={`${noteId} ${ID_PREFIX}list_ids-error`}
          className="flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <legend className="mb-1 font-bold">表示するリスト</legend>
          <p id={noteId} className="text-sm text-muted">
            2〜5件選びます。上から順に並びます。
          </p>

          {loadError ? (
            <p role="alert" className="text-danger">
              {loadError}
            </p>
          ) : lists === null ? (
            <p role="status" className="text-muted">
              読み込み中…
            </p>
          ) : (
            <>
              {selectedLists.length > 0 && (
                <ol className="flex flex-col">
                  {selectedLists.map((list, index) => (
                    <li
                      key={list.id}
                      className="flex min-h-11 items-center gap-1 border-b border-line-soft"
                    >
                      <ListChoice
                        list={list}
                        checked
                        disabled={sending}
                        onToggle={() => toggle(list.id)}
                      />
                      <button
                        type="button"
                        aria-label={`${list.title}を上へ`}
                        disabled={sending || index === 0}
                        onClick={() => move(list.id, -1)}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-brand hover:bg-sunken disabled:text-faint"
                      >
                        <Icon name="chevron" className="size-5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${list.title}を下へ`}
                        disabled={sending || index === selectedLists.length - 1}
                        onClick={() => move(list.id, 1)}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-brand hover:bg-sunken disabled:text-faint"
                      >
                        <Icon name="chevron" className="size-5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              {otherLists.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="mt-2 text-sm font-medium text-muted">
                    ほかのリスト
                    {full && "（5件まで選べます）"}
                  </p>
                  <ul className="flex flex-col">
                    {otherLists.map((list) => (
                      <li key={list.id} className="flex min-h-11 items-center">
                        <ListChoice
                          list={list}
                          checked={false}
                          disabled={sending || full}
                          onToggle={() => toggle(list.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <FieldError
            id={`${ID_PREFIX}list_ids-error`}
            message={fieldErrors.errors.list_ids}
          />
        </fieldset>

        {/* D-124：個人用のリストを入れても、共同編集のメンバーには見えないことを伝える */}
        <p className="text-sm text-muted">
          まとめ表示はあなただけに見えます。共同編集のメンバーには見えません。
        </p>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={sending}
            className="btn-outline"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={sending || limitReached || lists === null}
            className="btn-primary"
          >
            {view
              ? sending
                ? "保存中…"
                : "保存する"
              : sending
                ? "作成中…"
                : "作る"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ListChoice({
  list,
  checked,
  disabled,
  onToggle,
}: {
  list: PackingListSummary;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  // D-119：共同編集のリスト（参加している・メンバーがいる）は、個人用と見分けられるよう印を付ける
  const collaborative = !list.is_owner || list.member_count > 0;

  return (
    <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="size-5 shrink-0"
      />
      <span className="min-w-0 wrap-break-word">{list.title}</span>
      {collaborative && (
        <span className="flex shrink-0 items-center text-muted">
          <Icon name="people" className="size-4" />
          <span className="sr-only">（共同編集）</span>
        </span>
      )}
    </label>
  );
}

// V-31：配列の要素の誤り（list_ids.1 など）も、リストの選択の下にまとめて出す（C-04）
function listIdErrors(
  errors: Record<string, string[]>,
): FieldErrors<(typeof FIELDS)[number]> {
  const result = firstErrors(errors, FIELDS);
  if (!result.list_ids) {
    const element = Object.keys(errors).find((key) =>
      key.startsWith("list_ids."),
    );
    if (element) result.list_ids = COMBINED_LISTS_INVALID_MESSAGE;
  }
  return result;
}
