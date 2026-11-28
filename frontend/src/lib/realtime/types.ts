// F-35・D-119：ブラウザが WebSocket をつなぐ先（開発は Laravel Reverb、公開先は同じ方式の Pusher）。
// key は公開してよい値だが、NEXT_PUBLIC_ は付けず、画面を開くときに Server Component から渡す
export type RealtimeConfig = {
  key: string;
  host: string;
  port: number;
  // https のサイトでは wss でつなぐ
  tls: boolean;
};
