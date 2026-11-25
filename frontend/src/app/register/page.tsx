import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { inviteTokenFromLoginPath } from "@/features/auth/nextPath";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { fromPath, pathWithFrom, withFrom } from "@/lib/backPath";

export default async function RegisterPage(props: PageProps<"/register">) {
  const searchParams = await props.searchParams;
  // 共通2：SC-02・SC-16から来たときはその画面へ、それ以外はSC-01へ戻る（利用者の指示）
  const back = fromPath(searchParams.from, ["/login", "/privacy"]);
  // SC-02・SC-14・SC-16から戻ったときも、「←」の戻り先を保つ
  const currentPath = pathWithFrom("/register", back);
  // D-121：招待リンク（SC-19）→ ログイン（SC-02）→ この画面、と進んだ人は、登録と一緒に招待を覚えてもらい、
  // メール認証の後に招待の画面へ進める
  const inviteToken = inviteTokenFromLoginPath(back);
  // ログイン（SC-02）から来たときは、ログイン後の行き先（招待の画面など）を保ったまま戻す
  const loginHref = back?.startsWith("/login")
    ? back
    : withFrom("/login", currentPath);

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={back ?? "/"} />
      <h1 className="text-2xl font-medium">新規会員登録</h1>

      <p className="text-sm">
        <Link
          href={withFrom("/privacy", currentPath)}
          prefetch={false}
          className="text-link tap-target"
        >
          プライバシーポリシー・お問い合わせ
        </Link>
        で、預かる情報と利用目的をご確認いただけます。
      </p>

      {inviteToken && (
        <p role="status">
          登録してメール認証が済むと、招待されたリストへ進みます。
        </p>
      )}

      <RegisterForm
        currentPath={currentPath}
        loginHref={loginHref}
        inviteToken={inviteToken}
      />

      <Link href={loginHref} className="self-start text-link tap-target">
        ログイン
      </Link>
    </main>
  );
}
