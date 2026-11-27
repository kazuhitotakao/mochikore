"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { MyAvatar } from "@/types/api";
import {
  MAX_ZOOM,
  PhotoError,
  drawCrop,
  exportAvatar,
  initialCrop,
  panCrop,
  zoomCrop,
  type Crop,
} from "./avatarImage";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";

type Props = {
  // 選んで読み込んだ写真（調整用に縮めたもの）
  photo: HTMLCanvasElement;
  onCancel: () => void;
  onSaved: (avatar: string) => void;
};

type Point = { x: number; y: number };

// 矢印キー1回で動かす量（px）。Shift を押していれば大きく動かす
const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;
const KEY_ZOOM_STEP = 0.1;

/**
 * SC-12-13 写真の位置と大きさ（F-38、D-128）。丸の中が写真になる。
 * 指・マウスのドラッグで動かし、2本の指でつまむ・下のつまみ・ホイールで大きさを変える。
 * キーボードでは、枠を選んで矢印キーで動かし、＋・−で大きさを変える。
 */
export function AvatarCropDialog({ photo, onCancel, onSaved }: Props) {
  const redirectIfAuthError = useAuthErrorRedirect();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const titleId = useId();
  const hintId = useId();
  const zoomId = useId();
  const [crop, setCrop] = useState<Crop>(() => initialCrop(photo));
  const [viewSize, setViewSize] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelIfIdle() {
    if (!sending) onCancel();
  }
  const backdrop = useBackdropDismiss(cancelIfIdle);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 枠の大きさは画面の幅で変わるので、測ってから描く
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewSize(entry.contentRect.width);
    });
    observer.observe(view);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewSize === 0) return;
    // 高精細の画面でもぼやけないよう、画素の数を合わせる
    const pixels = Math.round(viewSize * window.devicePixelRatio);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const context = canvas.getContext("2d");
    if (context) drawCrop(context, photo, crop, pixels);
  }, [photo, crop, viewSize]);

  // ホイールで画面がスクロールしないよう、受け身でない聞き方にする
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      if (sending) return;
      const rect = view!.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setCrop((current) =>
        zoomCrop(
          photo,
          current,
          current.zoom * Math.exp(-event.deltaY * 0.002),
          px,
          py,
          rect.width,
        ),
      );
    }
    view.addEventListener("wheel", handleWheel, { passive: false });
    return () => view.removeEventListener("wheel", handleWheel);
  }, [photo, sending]);

  function pointFrom(event: PointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (sending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pointFrom(event));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || sending) return;
    const point = pointFrom(event);
    const size = event.currentTarget.getBoundingClientRect().width;
    const others = [...pointers.current.entries()].filter(
      ([id]) => id !== event.pointerId,
    );
    pointers.current.set(event.pointerId, point);

    if (others.length === 0) {
      setCrop((current) =>
        panCrop(
          photo,
          current,
          point.x - previous.x,
          point.y - previous.y,
          size,
        ),
      );
      return;
    }

    // 2本の指：指の間の長さの変化で大きさを、真ん中の動きで位置を変える
    const other = others[0][1];
    const before = distance(previous, other);
    const after = distance(point, other);
    if (before === 0) return;
    const middleBefore = middle(previous, other);
    const middleAfter = middle(point, other);
    setCrop((current) => {
      const zoomed = zoomCrop(
        photo,
        current,
        current.zoom * (after / before),
        middleAfter.x,
        middleAfter.y,
        size,
      );
      return panCrop(
        photo,
        zoomed,
        middleAfter.x - middleBefore.x,
        middleAfter.y - middleBefore.y,
        size,
      );
    });
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (sending) return;
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    // 矢印の向きに写真を動かす
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCrop((current) => panCrop(photo, current, move.x, move.y, viewSize));
      return;
    }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      const delta = event.key === "-" ? -KEY_ZOOM_STEP : KEY_ZOOM_STEP;
      setCrop((current) => zoomAtCenter(current, current.zoom + delta));
    }
  }

  function zoomAtCenter(current: Crop, zoom: number): Crop {
    return zoomCrop(photo, current, zoom, viewSize / 2, viewSize / 2, viewSize);
  }

  async function save() {
    if (sending) return;
    setError(null);
    let avatar: string;
    try {
      // 透明な部分は、写真を出す丸の地と同じ色で埋める
      const background =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-background")
          .trim() || "white";
      avatar = exportAvatar(photo, crop, background);
    } catch (failure) {
      setError(
        failure instanceof PhotoError ? failure.message : NETWORK_ERROR_MESSAGE,
      );
      return;
    }

    setSending(true);
    try {
      // API-71：Laravel が形式・大きさ・容量を確かめて保存する（V-32）
      const result = await clientApi<MyAvatar>("/me/avatar", {
        method: "PUT",
        body: { avatar },
      });
      onSaved(result.avatar ?? avatar);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      setSending(false);
      const message =
        failure instanceof ApiError && failure.code === "validation_error"
          ? failure.errors.avatar?.[0]
          : undefined;
      setError(message ?? NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        cancelIfIdle();
      }}
      {...backdrop}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <h2 id={titleId} className="text-lg font-bold">
        写真の位置と大きさ
      </h2>
      <p id={hintId} className="mt-1 text-sm text-muted">
        写真を動かして、丸の中に入れる部分を決めます。
      </p>

      <div
        ref={viewRef}
        tabIndex={0}
        role="group"
        aria-label="写真の位置。矢印キーで動かし、＋と−で大きさを変えます"
        aria-describedby={hintId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
        // 指で動かす間に画面がスクロール・拡大しないようにする
        className="relative mx-auto mt-4 aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-xl bg-sunken select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
        {/* 丸の外を暗くして、表示される範囲を示す */}
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-background/80 ring-[999px] ring-overlay/45" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label htmlFor={zoomId} className="shrink-0 text-sm font-bold">
          大きさ
        </label>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          disabled={sending}
          aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
          onChange={(event) =>
            setCrop((current) =>
              zoomAtCenter(current, Number(event.target.value)),
            )
          }
          className="min-h-11 w-full accent-brand"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="btn-outline"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={sending}
          className="btn-primary"
        >
          {sending ? "保存中…" : "保存する"}
        </button>
      </div>
    </dialog>
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
