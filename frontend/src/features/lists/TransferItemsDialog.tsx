"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FieldError } from "@/components/FieldError";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type {
  GroupingState,
  ItemImportResult,
  PackingListGroup,
  PackingListSummary,
} from "@/types/api";
import { itemAdditionLimitMessage } from "./itemErrors";
import { RemainingCount } from "./ListForm";
import {
  copyTitle,
  TITLE_MAX_LENGTH,
  titleLength,
  validateTitle,
} from "./validation";

// copy・move は自分のリストの間（F-32）、import は公開リスト・限定公開のリストから（F-33）
export type TransferMode = "copy" | "move" | "import";

// 「新しいリストを作る」を選んでいるとき
const NEW_LIST = "new";
const TITLE_ID = "transfer-new-title";
const MODERATED_MESSAGE = "このリストは運営により非公開になっています。";

// D-118（利用者の指示）：取り込みは、SC-11・SC-18 の「選んで取り込む」とつながるよう「取り込む」の言葉にそろえる
const WORDING: Record<
  TransferMode,
  {
    heading: string;
    legend: string;
    submit: string;
    sending: string;
    reselect: string;
  }
> = {
  copy: {
    heading: "別のリストへコピー",
    legend: "コピー先のリスト",
    submit: "コピーする",
    sending: "コピー中…",
    reselect: "移し先のリストを選び直してください。",
  },
  move: {
    heading: "別のリストへ移動",
    legend: "移動先のリスト",
    submit: "移動する",
    sending: "移動中…",
    reselect: "移し先のリストを選び直してください。",
  },
  import: {
    heading: "自分のリストへ取り込む",
    legend: "取り込み先のリスト",
    submit: "取り込む",
    sending: "取り込み中…",
    reselect: "取り込み先のリストを選び直してください。",
  },
};

type Props<R extends ItemImportResult> = {
  // 元のリスト。自分のリストなら移し先の候補から外す
  listId: number;
  listTitle: string;
  itemIds: number[];
  mode: TransferMode;
  // 送り先。API-51・52（/lists/{id}/items/copy・move）か、API-53・54（…/items/import）
  submitPath: string;
  onDone: (result: R) => void;
  onCancel: () => void;
  // 開いている間に運営が非公開にしていたとき。親が案内を出す（D-116・D-118）。取り込みでは404になるので使わない
  onModerated?: () => void;
};

/**
 * 選んだ持ち物の移し先（D-118）。SC-07-21「選んでコピー・移動」（F-32、API-51・52）と、
 * SC-11・SC-18「選んで取り込む」（F-33、API-53・54）で使う。
 * 自分のリスト（更新が新しい順、元のリストは出さない）を選び、続けてそのリストのグループを選ぶ。
 * 先頭の「新しいリストを作る」は名前だけ入れる（カテゴリーは元と同じ）。グループそのものは写さない。
 * このダイアログが確認を兼ねるので、移動にもう一度の確認と「元に戻す」は置かない。
 */
export function TransferItemsDialog<R extends ItemImportResult>({
  listId,
  listTitle,
  itemIds,
  mode,
  submitPath,
  onDone,
  onCancel,
  onModerated,
}: Props<R>) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const listGroupName = useId();
  const groupGroupName = useId();
  const [lists, setLists] = useState<PackingListSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 選んだ移し先。null はまだ選んでいない
  const [destination, setDestination] = useState<
    number | typeof NEW_LIST | null
  >(null);
  // D-118（利用者の指示）：コピー・取り込みは複製と同じ「元の名前（コピー）」、移動は合う言葉がないので空欄から入れる
  const [title, setTitle] = useState(() =>
    mode === "move" ? "" : copyTitle(listTitle),
  );
  const [titleError, setTitleError] = useState<string | undefined>();
  // 選んだリストのグループ。読み込み中は null
  const [groups, setGroups] = useState<PackingListGroup[] | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wording = WORDING[mode];

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 開いた後に自分のリスト一覧（API-05）を読む。並びは更新が新しい順（D-24）
  useEffect(() => {
    let active = true;
    clientApi<PackingListSummary[]>("/lists")
      .then((result) => {
        if (!active) return;
        const others = result.filter((list) => list.id !== listId);
        setLists(others);
        // 移し先になるリストがなければ、新しいリストを作るしかないので選んでおく
        if (others.length === 0) setDestination(NEW_LIST);
      })
      .catch((failure: unknown) => {
        if (!active || redirectIfAuthError(failure)) return;
        setLoadError(NETWORK_ERROR_MESSAGE);
      });
    return () => {
      active = false;
    };
  }, [listId, redirectIfAuthError]);

  // 選んだリストのグループ（API-29）を読む。最初は「グループに入れない」
  useEffect(() => {
    if (typeof destination !== "number") return;
    let active = true;
    clientApi<GroupingState>(`/lists/${destination}/grouping`)
      .then((result) => {
        if (active) setGroups(result.groups);
      })
      .catch((failure: unknown) => {
        if (!active || redirectIfAuthError(failure)) return;
        // ほかの画面で移し先が消えていたときも、読み直しを案内して選び直してもらう
        setGroups([]);
        setError(
          failure instanceof ApiError && failure.code === "not_found"
            ? WORDING[mode].reselect
            : NETWORK_ERROR_MESSAGE,
        );
      });
    return () => {
      active = false;
    };
  }, [destination, mode, redirectIfAuthError]);

  function closeIfIdle() {
    if (!sending) onCancel();
  }
  const backdrop = useBackdropDismiss(closeIfIdle);

  function choose(next: number | typeof NEW_LIST) {
    setDestination(next);
    setGroups(null);
    setGroupId(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || destination === null) return;
    setError(null);

    if (destination === NEW_LIST) {
      // V-04：新しいリストの名前は、リストの作成と同じ条件（最終の判定は Laravel）
      const message = validateTitle(title);
      setTitleError(message);
      if (message) {
        document.getElementById(TITLE_ID)?.focus();
        return;
      }
    }

    setSending(true);
    try {
      const result = await clientApi<R>(submitPath, {
        method: "POST",
        body:
          destination === NEW_LIST
            ? {
                item_ids: itemIds,
                destination_list_id: null,
                new_list_title: title,
              }
            : {
                item_ids: itemIds,
                destination_list_id: destination,
                destination_group_id: groupId,
              },
      });
      onDone(result);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        // ほかの画面で元のリストが消えた・非公開になった・リンクが止められた。
        // 読み直すと「ページが見つかりません」になる（D-43・D-114）
        router.refresh();
        return;
      }
      if (failure instanceof ApiError && failure.code === "list_moderated") {
        onModerated?.();
      }
      const nameError =
        failure instanceof ApiError && failure.code === "validation_error"
          ? failure.errors.new_list_title?.[0]
          : undefined;
      if (nameError) {
        setTitleError(nameError);
        document.getElementById(TITLE_ID)?.focus();
      } else {
        setError(transferErrorMessage(failure));
      }
      setSending(false);
    }
  }

  const ready =
    destination === NEW_LIST || (destination !== null && groups !== null);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        closeIfIdle();
      }}
      {...backdrop}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={headingId} className="text-lg font-bold">
          {wording.heading}（{itemIds.length}件）
        </h2>

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}

        <fieldset className="flex flex-col gap-1" disabled={sending}>
          <legend className="mb-1 font-bold">{wording.legend}</legend>
          {loadError ? (
            <p role="alert" className="text-danger">
              {loadError}
            </p>
          ) : lists === null ? (
            <p className="text-muted">読み込み中…</p>
          ) : (
            // リストが多いときも「キャンセル」「コピーする」が隠れないよう、一覧だけを動かす
            <div className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line">
              <Choice
                name={listGroupName}
                checked={destination === NEW_LIST}
                onChange={() => choose(NEW_LIST)}
              >
                ＋ 新しいリストを作る
              </Choice>
              {lists.map((list) => (
                <Choice
                  key={list.id}
                  name={listGroupName}
                  checked={destination === list.id}
                  onChange={() => choose(list.id)}
                >
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {list.title}
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    {list.category.name}
                  </span>
                </Choice>
              ))}
            </div>
          )}
        </fieldset>

        {destination === NEW_LIST && (
          <div>
            <label htmlFor={TITLE_ID} className="mb-1 block font-bold">
              新しいリストの名前
            </label>
            <input
              id={TITLE_ID}
              type="text"
              value={title}
              disabled={sending}
              aria-describedby={`${TITLE_ID}-count ${TITLE_ID}-error`}
              aria-invalid={Boolean(titleError)}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError(undefined);
              }}
              className="field w-full"
            />
            <RemainingCount
              id={`${TITLE_ID}-count`}
              max={TITLE_MAX_LENGTH}
              length={titleLength(title)}
            />
            <FieldError id={`${TITLE_ID}-error`} message={titleError} />
            {/* D-118：カテゴリーは元と同じで作る。変えるときはリストを編集（SC-06）で */}
            <p className="mt-1 text-sm text-muted">
              カテゴリーは今のリストと同じになります。
            </p>
          </div>
        )}

        {typeof destination === "number" && (
          <fieldset className="flex flex-col gap-1" disabled={sending}>
            <legend className="mb-1 font-bold">入れるグループ</legend>
            {groups === null ? (
              <p className="text-muted">読み込み中…</p>
            ) : (
              <div className="flex max-h-44 flex-col overflow-y-auto rounded-lg border border-line">
                <Choice
                  name={groupGroupName}
                  checked={groupId === null}
                  onChange={() => setGroupId(null)}
                >
                  グループに入れない
                </Choice>
                {groups.map((group) => (
                  <Choice
                    key={group.id}
                    name={groupGroupName}
                    checked={groupId === group.id}
                    onChange={() => setGroupId(group.id)}
                  >
                    <span className="min-w-0 flex-1 wrap-break-word">
                      {group.name}
                    </span>
                  </Choice>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {mode === "move" && (
          // D-118：移した持ち物はこのリストからなくなり、チェックはそのまま
          <p className="text-sm text-muted">
            このリストからはなくなります。チェックはそのまま移ります。
          </p>
        )}

        {/* 狭い幅で並びきらないときは、文字を途中で折らずにボタンごと次の行へ送る */}
        <div className="mt-2 flex flex-wrap justify-end gap-3">
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
            disabled={sending || !ready}
            className="btn-primary"
          >
            {sending ? wording.sending : wording.submit}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// 1行で押しやすい選択肢。押せる高さは44px以上（D-73）、選んでいるものは丸の印と色で示す
function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 border-b border-line-soft px-3 py-2 last:border-b-0 ${
        checked ? "bg-brand-soft" : "hover:bg-sunken"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="shrink-0"
      />
      {children}
    </label>
  );
}

// SC-07-22・SC-11-9：移せなかった・取り込めなかった理由。画面は code で決める（D-53）
function transferErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_limit_reached":
      return "リストは100件までです。";
    case "list_moderated":
      return MODERATED_MESSAGE;
    case "validation_error":
      // V-26：選び直し・読み直しを案内する文を、項目の順に1つだけ出す
      return (
        error.errors.item_ids?.[0] ??
        error.errors.destination_list_id?.[0] ??
        error.errors.destination_group_id?.[0] ??
        error.message
      );
    default:
      return itemAdditionLimitMessage(error) ?? NETWORK_ERROR_MESSAGE;
  }
}
