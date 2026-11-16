"use client";

type Props = {
  // 行の中身をずらしている間だけ出す（ずらしていないときは「…」のメニューを切らないよう、何も置かない）
  visible: boolean;
  // 開いて止まっているときだけ、キーボード・読み上げでも押せるようにする
  open: boolean;
  label: string;
  onDelete: () => void;
};

// D-105：左にスワイプした行の下に敷く赤い背景と、右端の「削除」。ずらした分だけ赤い部分が見える
export function SwipeDeleteLayer({ visible, open, label, onDelete }: Props) {
  if (!visible) return null;

  return (
    // 押したときに並べ替えのドラッグを始めない（components/dragSensors）
    <div data-no-drag className="absolute inset-0 flex justify-end bg-danger">
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={label}
        onClick={onDelete}
        className="w-20 shrink-0 font-medium text-white"
      >
        削除
      </button>
    </div>
  );
}
