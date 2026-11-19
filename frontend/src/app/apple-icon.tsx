import { ImageResponse } from "next/og";
import { AppIconArt } from "./appIconArt";

// D-115：iPhone でホーム画面に追加したときのアイコン。角は端末が丸めるので四角のまま描く
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt />, size);
}
