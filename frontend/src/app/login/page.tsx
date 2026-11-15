import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { LoginForm } from "@/features/auth/LoginForm";
import { safeNextPath } from "@/features/auth/nextPath";
import { fromPath, withFrom } from "@/lib/backPath";

// SC-10・SC-11（ログインせずに見られる公開画面）のパス
const PUBLIC_PAGE = /^\/public\/lists(\/[1-9][0-9]*)?(\?|$)/;

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);
  const from = fromPath(searchParams.from, ["/register"]);
  // 共通2：SC-03から来たときはSC-03へ、SC-11の「自分用にコピー」から来たときはその公開リストへ戻る。
  // それ以外（期限切れで来たときなど、ログインしないと開けない画面）はSC-01へ（利用者の指示）
  const back = from ?? (next && PUBLIC_PAGE.test(next) ? next : "/");
  // SC-03・SC-14から戻ったときも、ログイン後の行き先と「←」の戻り先を保つ。期限切れなどの案内は付けない
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  if (from) query.set("from", from);
  const currentPath = `/login${query.size ? `?${query}` : ""}`;

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={back} />
      <h1 className="text-2xl font-bold">ログイン</h1>

      {/* 02_画面配置 共通7：ログインが必要な画面で401になったとき */}
      {searchParams.expired === "1" && (
        <p role="status">
          ログインの期限が切れました。もう一度ログインしてください。
        </p>
      )}

      {/* 02_画面配置 SC-15-4：新しいパスワードを設定した後 */}
      {searchParams.reset === "1" && (
        <p role="status">パスワードを設定しました。ログインしてください。</p>
      )}

      <LoginForm next={next} />

      {/* SC-02-6 */}
      <Link
        href={withFrom("/forgot-password", currentPath)}
        className="self-start underline tap-target"
      >
        パスワードを忘れた方
      </Link>

      <Link
        href={withFrom("/register", currentPath)}
        className="self-start underline tap-target"
      >
        新規会員登録
      </Link>
    </main>
  );
}
