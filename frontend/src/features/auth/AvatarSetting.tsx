"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { clientApi } from "@/lib/api/client";
import { NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { PhotoError, loadPhoto } from "./avatarImage";
import { SETTING_ACTION, SettingRow } from "./SettingRow";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";

type Props = {
  // 今の写真（API-70）。載せていなければ null
  avatar: string | null;
};

/**
 * SC-12-12 写真（F-38、D-128）。自分のリスト一覧（SC-05）の右上と、共同編集のメンバーの一覧に出す。
 * 選んだ写真は、位置と大きさを調整してから保存する（SC-12-13）。
 */
export function AvatarSetting({ avatar }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(avatar);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 同じ写真を選び直しても、もう一度読み込めるようにする
    event.target.value = "";
    if (!file) return;
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      setPhoto(await loadPhoto(file));
    } catch (failure) {
      setError(
        failure instanceof PhotoError
          ? failure.message
          : "この写真は読み込めませんでした。別の写真を選んでください。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteAvatar() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // API-72
      await clientApi<void>("/me/avatar", { method: "DELETE" });
      setCurrent(null);
      setConfirmingDelete(false);
      setStatus("写真を削除しました。");
      router.refresh();
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      setDeleteError(NETWORK_ERROR_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SettingRow
      title="写真"
      value={
        <div className="mt-1">
          <Avatar
            src={current}
            size="lg"
            label={current ? "今の写真" : "写真なし"}
          />
        </div>
      }
      action={
        <button
          type="button"
          disabled={loading}
          // 行の見出しと合わせて、何をするボタンかを読み上げで伝える
          aria-label={current ? "写真を変更" : "写真を選ぶ"}
          onClick={() => inputRef.current?.click()}
          className={SETTING_ACTION}
        >
          {loading ? "読み込み中…" : current ? "変更" : "選ぶ"}
        </button>
      }
    >
      {/* 写真を選ぶ欄はボタンから開き、画面には出さない。iPhone でも開けるよう、display:none にはしない */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleFile(event)}
        className="sr-only"
      />
      <p className="text-sm text-muted">
        共同編集のメンバーに見えます。公開リストには出ません。
      </p>
      {current && (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setConfirmingDelete(true);
          }}
          className="mt-1 self-start text-sm text-danger underline underline-offset-4 tap-target"
        >
          写真を削除
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}

      {photo && (
        <AvatarCropDialog
          photo={photo}
          onCancel={() => setPhoto(null)}
          onSaved={(saved) => {
            setPhoto(null);
            setCurrent(saved);
            setStatus("写真を保存しました。");
            // 自分のリスト一覧（SC-05）の右上にも、保存した写真を出す
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmingDelete}
        message="写真を削除しますか？人型のアイコンに戻ります。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        destructive
        busy={deleting}
        error={deleteError}
        onConfirm={() => void deleteAvatar()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </SettingRow>
  );
}
