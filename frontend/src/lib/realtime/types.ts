// F-35・D-119：ブラウザが WebSocket をつなぐ先（Laravel Reverb、または同じ方式の外部サービス）。
// key は公開してよい値だが、NEXT_PUBLIC_ は付けず、画面を開くときに Server Component から渡す
export type RealtimeConfig = {
  key: string;
  host: string;
  port: number;
  // https のサイトでは wss でつなぐ
  tls: boolean;
};
