import { ImageResponse } from "next/og";
import { AppIconArt } from "./appIconArt";

export const contentType = "image/png";

// D-115：ブラウザのタブ用（32）と、ホーム画面に追加したときのアイコン（192・512、manifest.ts）。
// ビルドのときに作って配る
const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType,
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);

  return new ImageResponse(<AppIconArt tab={size === 32} />, {
    width: size,
    height: size,
  });
}
