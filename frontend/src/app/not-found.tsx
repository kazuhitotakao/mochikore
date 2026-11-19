import Link from "next/link";
import { Icon } from "@/components/Icon";
import { optionalUser } from "@/features/auth/optionalUser";

// 02_画面配置 共通9：存在しないURLと、読み込みで404になったときの表示。
// 止めたリンク（D-114）や削除・非公開のリストから来た人も、次に行ける所へ進めるようにする
export default async function NotFound() {
  // D-80：ログイン前の人は本人情報を読まない。ログイン中なら自分のリストへ戻れるようにする
  const user = await optionalUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon name="missing" className="size-10" />
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium">ページが見つかりません</h1>
        <p className="text-muted">
          リストが削除・非公開になったか、リンクが止められた可能性があります。
          {/* 理由と、利用者が確かめることを分けて読めるよう、文ごとに改行する（利用者の指示） */}
          <br />
          URLが正しいかも確かめてください。
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {user ? (
          <Link href="/lists" prefetch={false} className="btn-primary">
            自分のリストへ
          </Link>
        ) : (
          <Link href="/" prefetch={false} className="btn-primary">
            トップへ
          </Link>
        )}
        <Link href="/public/lists" prefetch={false} className="btn-outline">
          公開リストを見る
        </Link>
      </div>
    </main>
  );
}
