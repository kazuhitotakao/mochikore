// F-38・D-128・V-32：写真をブラウザで256px四方の JPEG に作り直してから送る。
// 作り直すと撮影場所などの情報（Exif）も消えるので、写真の中身のほかは Laravel へ渡らない。

export const AVATAR_SIZE = 256;
// Laravel の上限（UserAvatar::MAX_BYTES）と同じ
export const AVATAR_MAX_BYTES = 60 * 1024;
// 選べる元の写真の容量。読み込みでブラウザが重くならないよう、スマホで撮った写真が収まる大きさにする
export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
// 調整で拡大できる倍率。元の写真の短い辺に対して
export const MAX_ZOOM = 4;

// 調整に使う写真の大きさ。短い辺を1024px（4倍に拡大しても256pxに足りる）、長い辺を4096pxまでに縮めて持つ
const WORKING_MIN_SIDE = AVATAR_SIZE * MAX_ZOOM;
const WORKING_MAX_SIDE = 4096;

const JPEG_PREFIX = "data:image/jpeg;base64,";
// 容量に収まるまで、少しずつ画質を下げる
const JPEG_QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46, 0.36];

/**
 * 切り抜く範囲。cx・cy は調整用の写真の上での丸の中心（px）、zoom は短い辺を丸の直径にしたときからの倍率。
 * 画面の大きさに左右されないよう、写真の上の位置で持つ。
 */
export type Crop = { cx: number; cy: number; zoom: number };

export class PhotoError extends Error {}

/**
 * 選んだ写真を読み込み、調整用の大きさに縮めた canvas にする。向き（Exif の回転）はブラウザが直して読む。
 */
export async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith("image/")) {
    throw new PhotoError("写真の画像を選んでください。");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new PhotoError("20MBまでの写真を選んでください。");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    // 読めない形式（ブラウザが対応していない写真など）は、ここで失敗する
    await image.decode().catch(() => {
      throw new PhotoError(
        "この写真は読み込めませんでした。別の写真を選んでください。",
      );
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) {
      throw new PhotoError(
        "この写真は読み込めませんでした。別の写真を選んでください。",
      );
    }

    const scale = Math.min(
      1,
      WORKING_MIN_SIDE / Math.min(width, height),
      WORKING_MAX_SIDE / Math.max(width, height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new PhotoError(
        "この写真は読み込めませんでした。別の写真を選んでください。",
      );
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 丸の直径にあたる、写真の上の長さ（px）
function cropSide(photo: Size, zoom: number): number {
  return Math.min(photo.width, photo.height) / zoom;
}

type Size = { width: number; height: number };

/**
 * 丸の中がいつも写真で埋まるよう、倍率と中心を写真の内側に収める。
 */
export function clampCrop(photo: Size, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const half = cropSide(photo, zoom) / 2;
  return {
    zoom,
    cx: Math.min(photo.width - half, Math.max(half, crop.cx)),
    cy: Math.min(photo.height - half, Math.max(half, crop.cy)),
  };
}

// 初めは写真の真ん中を、短い辺いっぱいの丸で切り抜く
export function initialCrop(photo: Size): Crop {
  return { cx: photo.width / 2, cy: photo.height / 2, zoom: 1 };
}

/**
 * 画面の上で dx・dy（px）だけ指を動かしたとき。写真が指と同じ向きに動くので、丸の中心は逆へ動く。
 * viewSize は調整の枠の一辺（px）。
 */
export function panCrop(
  photo: Size,
  crop: Crop,
  dx: number,
  dy: number,
  viewSize: number,
): Crop {
  const perPixel = cropSide(photo, crop.zoom) / viewSize;
  return clampCrop(photo, {
    ...crop,
    cx: crop.cx - dx * perPixel,
    cy: crop.cy - dy * perPixel,
  });
}

/**
 * 枠の中の点（px・py、枠の左上から）を動かさずに、倍率を変える。指でつまむ・ホイールでは指の位置、
 * つまみ・キーでは枠の真ん中を中心にする。
 */
export function zoomCrop(
  photo: Size,
  crop: Crop,
  zoom: number,
  px: number,
  py: number,
  viewSize: number,
): Crop {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const side = cropSide(photo, crop.zoom);
  const nextSide = cropSide(photo, next);
  const rx = px / viewSize;
  const ry = py / viewSize;
  // 指の下にある写真の上の点
  const sx = crop.cx - side / 2 + rx * side;
  const sy = crop.cy - side / 2 + ry * side;
  return clampCrop(photo, {
    zoom: next,
    cx: sx - (rx - 0.5) * nextSide,
    cy: sy - (ry - 0.5) * nextSide,
  });
}

/**
 * 切り抜いた範囲を、canvas の大きさいっぱいに描く。調整中の表示と、送る写真の両方で使う。
 */
export function drawCrop(
  context: CanvasRenderingContext2D,
  photo: HTMLCanvasElement,
  crop: Crop,
  size: number,
): void {
  const side = cropSide(photo, crop.zoom);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    photo,
    crop.cx - side / 2,
    crop.cy - side / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
}

/**
 * 送る写真を作る。256px四方の JPEG で、60KBに収まるまで画質を下げる。
 * 透明な部分（PNG など）は、画面の地の色で埋める。
 */
export function exportAvatar(
  photo: HTMLCanvasElement,
  crop: Crop,
  background: string,
): string {
  // 大きく縮めるときに線がギザギザにならないよう、2倍の大きさを1度はさむ
  const middle = document.createElement("canvas");
  middle.width = AVATAR_SIZE * 2;
  middle.height = AVATAR_SIZE * 2;
  const middleContext = middle.getContext("2d");

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!middleContext || !context) {
    throw new PhotoError("写真を作れませんでした。もう一度お試しください。");
  }

  drawCrop(middleContext, photo, crop, middle.width);
  context.fillStyle = background;
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.imageSmoothingQuality = "high";
  context.drawImage(middle, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  for (const quality of JPEG_QUALITIES) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.startsWith(JPEG_PREFIX) && decodedBytes(url) <= AVATAR_MAX_BYTES) {
      return url;
    }
  }
  throw new PhotoError("写真を作れませんでした。別の写真を選んでください。");
}

// base64 の文字の長さから、元のバイト数を出す
function decodedBytes(dataUrl: string): number {
  const body = dataUrl.slice(JPEG_PREFIX.length);
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return (body.length / 4) * 3 - padding;
}
