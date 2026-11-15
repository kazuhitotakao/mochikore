"use client";

import { useRef, type MouseEvent } from "react";

/**
 * ブラウザの dialog（showModal で開いたもの）を、外枠（暗くした背景）を押したときに閉じる（利用者の指示）。
 * 押し始めと離した位置の両方が外枠のときだけ閉じる。入力欄の文字を選びながら外へはみ出して離したときに、
 * 入力中の内容を消さないため。返す2つを dialog 要素にそのまま渡す。閉じてよいかは onDismiss の側で判断する。
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressedOnBackdrop = useRef(false);

  return {
    onPointerDown(event: MouseEvent<HTMLDialogElement>) {
      pressedOnBackdrop.current = isBackdrop(event);
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const fromBackdrop = pressedOnBackdrop.current && isBackdrop(event);
      pressedOnBackdrop.current = false;
      if (fromBackdrop) onDismiss();
    },
  };
}

// 外枠を押すと dialog 自身が対象になる。dialog の余白（padding）を押したときも dialog 自身が対象になるので、
// 枠の外かどうかを位置で確かめる。中に重ねた確認ダイアログの外枠は、そのダイアログが対象になるので閉じない
function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}
