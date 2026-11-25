import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SwitchIndicator } from "@/components/SwitchIndicator";
import { PUBLISH_MESSAGE } from "./visibility";
import type { VisibilityToggle } from "./useVisibilityToggle";

type SwitchProps = {
  isPublic: boolean;
  disabled: boolean;
  // 運営による非公開の案内（ModeratedNotice）の id。押せない理由として読み上げる
  describedBy?: string;
  onToggle: () => void;
};

/**
 * 公開・非公開のオン・オフのスイッチ（D-73）。オン（緑、つまみが右）が公開。
 * SC-06 の公開設定で使う。SC-07 は「…」の中の行（ListMenu）で同じ見た目（SwitchIndicator）を使い、動きは useVisibilityToggle で共通にする。今の状態の文字は、使う画面が隣に置く。
 */
export function VisibilitySwitch({
  isPublic,
  disabled,
  describedBy,
  onToggle,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label="リストを公開する"
      aria-checked={isPublic}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onToggle}
      // 押せる範囲は44px四方以上にする（D-73）
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
    >
      <SwitchIndicator on={isPublic} />
    </button>
  );
}

// D-42：非公開から公開にするときだけ確認する。SC-06 と SC-07 で同じ文言・同じ動き
export function PublishConfirmDialog({
  visibility,
  onCancel,
}: {
  visibility: VisibilityToggle;
  // 「キャンセル」・Esc・外枠で閉じた後に呼ぶ。SC-07 は「…」を開いたまま戻すのに使う（D-73）
  onCancel?: () => void;
}) {
  return (
    <ConfirmDialog
      open={visibility.confirming}
      message={PUBLISH_MESSAGE}
      confirmLabel="公開する"
      cancelLabel="キャンセル"
      busy={visibility.sending}
      error={visibility.dialogError}
      onConfirm={visibility.confirmPublish}
      onCancel={() => {
        visibility.cancelPublish();
        onCancel?.();
      }}
    />
  );
}

// SC-06-8・SC-07-2：運営により非公開になったリストは、本人も公開に戻せない（F-08・D-48）
export function ModeratedNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-sm text-muted">
      このリストは運営により非公開になっています。 お問い合わせ：
      <a href="mailto:simasyam@gmail.com" className="text-link tap-target">
        simasyam@gmail.com
      </a>
    </p>
  );
}
