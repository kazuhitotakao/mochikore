"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { PackingList } from "@/types/api";
import { visibilityErrorMessage } from "./visibility";

// D-85：公開する前の準備（SC-06 の未保存の入力の保存）の結果
export type BeforePublishResult =
  // saved：先に入力を保存した。公開だけ失敗したときに、保存したことを伝える
  | { proceed: true; saved: boolean }
  // 公開しない。error があれば確認の中に出し、なければ確認を閉じる（入力欄の下にエラーを出したときなど）
  | { proceed: false; error?: string };

type Options = {
  listId: number;
  isPublic: boolean;
  // 画面のほかの保存中などで、切り替えを止めるとき
  blocked: boolean;
  // SC-06 だけ：公開の確認で「公開する」を押した後、API-14 の前に呼ぶ（D-85）
  beforePublish?: () => Promise<BeforePublishResult>;
  // 切り替えを始めるとき（前の通知・エラーを消すため）
  onStart?: () => void;
  // API-14 が成功した後、保存できた値で呼ぶ
  onChanged: (isPublic: boolean) => void;
  // 403 list_moderated：運営により非公開になっていた
  onModerated: () => void;
};

/**
 * 公開・非公開の切り替え（F-08・API-14）。リスト編集（SC-06）と自分のリストの内容（SC-07）で同じ動きにする（D-73）。
 * ・公開にするときだけ確認し（D-42）、非公開に戻すときは確認せずすぐ送る。
 * ・送信中は連打を受け付けない。成功してから画面の公開状態を変える。
 * ・公開の失敗は確認の中に、非公開の失敗はスイッチの下に理由を出す。
 * API-14、09_バリデーション12行Jメモ（V-07）と38〜45行Jメモ（C-01〜08）を確認。
 */
export function useVisibilityToggle({
  listId,
  isPublic,
  blocked,
  beforePublish,
  onStart,
  onChanged,
  onModerated,
}: Options) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 状態の反映を待たずに二重送信を防ぐ
  const inFlight = useRef(false);

  function toggle() {
    if (blocked || inFlight.current) return;
    setError(null);
    setDialogError(null);
    onStart?.();
    if (isPublic) void send(false);
    else setConfirming(true);
  }

  async function send(next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    setDialogError(null);
    let saved = false;

    try {
      if (next && beforePublish) {
        const prepared = await beforePublish();
        if (!prepared.proceed) {
          if (prepared.error) setDialogError(prepared.error);
          else setConfirming(false);
          return;
        }
        saved = prepared.saved;
      }

      const result = await clientApi<Pick<PackingList, "is_public">>(
        `/lists/${listId}/visibility`,
        { method: "PATCH", body: { is_public: next } },
      );
      setConfirming(false);
      onChanged(result.is_public);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // 共通9・D-43：ほかの画面で先に削除されていたら、読み直して「ページが見つかりません」にする
      if (failure instanceof ApiError && failure.status === 404) {
        router.refresh();
        return;
      }

      // D-85：入力を先に保存できていたら、公開できなかった理由と一緒に伝える
      const message =
        (saved ? "変更内容は保存しました。" : "") +
        visibilityErrorMessage(failure);
      if (failure instanceof ApiError && failure.code === "list_moderated") {
        // スイッチを押せなくし、運営による非公開の案内を出す。保存を伝える必要がなければ確認を閉じる
        onModerated();
        if (saved) setDialogError(message);
        else setConfirming(false);
      } else if (next) {
        setDialogError(message);
      } else {
        setError(message);
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return {
    confirming,
    sending,
    dialogError,
    error,
    toggle,
    confirmPublish: () => void send(true),
    cancelPublish: () => setConfirming(false),
  };
}

export type VisibilityToggle = ReturnType<typeof useVisibilityToggle>;
