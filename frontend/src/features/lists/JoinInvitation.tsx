"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { Invitation, InvitationJoinResult } from "@/types/api";
import { DisplayNameField } from "./DisplayNameField";
import { MAX_PEOPLE, validateDisplayName } from "./validation";

type Props = {
  token: string;
  invitation: Invitation;
  // 本人の表示名。まだなければ、参加するときに入れてもらう（V-27）
  displayName: string | null;
};

/**
 * SC-19 招待の内容と「参加する」（F-34、D-119）。
 * 参加する前に見せるのは、リスト名・所有者の表示名・人数だけ。持ち物は参加してから見られる。
 */
export function JoinInvitation({ token, invitation, displayName }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const nameId = useId();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 開いた後にほかの人が参加して、10人になったとき
  const [full, setFull] = useState(invitation.status === "full");
  const needsDisplayName = displayName === null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setError(null);
    if (needsDisplayName) {
      // C-04：送る前に確かめる。最終的な判定は Laravel が行う（V-27）
      const invalid = validateDisplayName(name);
      setNameError(invalid);
      if (invalid) return;
    }

    setSending(true);
    try {
      // API-62：前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      const result = await clientApi<InvitationJoinResult>(
        `/invites/${token}/join`,
        {
          method: "POST",
          body: needsDisplayName ? { display_name: name } : undefined,
        },
      );
      // 参加できたら、リストの内容（SC-07）へ移る。ブラウザの戻るで、この画面には戻さない
      router.replace(`/lists/${result.list.id}`);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      setSending(false);
      if (!(failure instanceof ApiError)) {
        setError(NETWORK_ERROR_MESSAGE);
        return;
      }
      switch (failure.code) {
        case "not_found":
          // 開いている間に、招待リンクが止められた・期限が切れた
          setError(
            "この招待リンクは使えなくなりました。招待した人に、新しいリンクを送ってもらってください。",
          );
          break;
        case "member_limit_reached":
          setFull(true);
          break;
        case "joined_list_limit_reached":
          setError(failure.message);
          break;
        case "validation_error":
          if (failure.errors.display_name?.[0]) {
            setNameError(failure.errors.display_name[0]);
            break;
          }
          setError(NETWORK_ERROR_MESSAGE);
          break;
        default:
          setError(NETWORK_ERROR_MESSAGE);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 card p-4">
        {/* ほかの人が付けた名前なので、文字としてそのまま出す */}
        <p className="text-lg font-medium wrap-break-word">
          {invitation.list.title}
        </p>
        <p className="text-sm text-muted wrap-break-word">
          {/* 「さん」で終わる表示名でも読みやすいよう、敬称は付けない */}
          所有者：{invitation.owner_display_name ?? "（表示名なし）"}
          ・いま{invitation.member_count + 1}人が使っています
        </p>
      </section>

      {full ? (
        <p role="alert">
          このリストはメンバーが{MAX_PEOPLE}人いるため、参加できません。
        </p>
      ) : (
        <>
          <p>
            参加すると、このリストの持ち物をメンバーと一緒に追加・チェックできます。変更は全員のリストに反映されます。
          </p>
          {needsDisplayName ? (
            <DisplayNameField
              id={nameId}
              value={name}
              error={nameError}
              disabled={sending}
              onChange={(value) => {
                setName(value);
                setNameError(undefined);
              }}
            />
          ) : (
            <p className="text-sm text-muted wrap-break-word">
              メンバーには「{displayName}
              」と表示されます。メールアドレスは見えません。
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {!full && (
          <button type="submit" disabled={sending} className="btn-primary">
            {sending ? "参加中…" : "参加する"}
          </button>
        )}
        <Link href="/lists" prefetch={false} className="text-link tap-target">
          {full ? "自分のリスト一覧へ" : "参加しない"}
        </Link>
      </div>
    </form>
  );
}
