import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { fromPath, pathWithFrom, withFrom } from "@/lib/backPath";

export default async function RegisterPage(props: PageProps<"/register">) {
  const searchParams = await props.searchParams;
  // 共通2：SC-02・SC-16から来たときはその画面へ、それ以外はSC-01へ戻る（利用者の指示）
  const back = fromPath(searchParams.from, ["/login", "/privacy"]);
  // SC-02・SC-14・SC-16から戻ったときも、「←」の戻り先を保つ
  const currentPath = pathWithFrom("/register", back);

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={back ?? "/"} />
      <h1 className="text-2xl font-bold">新規会員登録</h1>

      <p className="text-sm">
        <Link
          href={withFrom("/privacy", currentPath)}
          prefetch={false}
          className="underline tap-target"
        >
          プライバシーポリシー・お問い合わせ
        </Link>
        で、預かる情報と利用目的をご確認いただけます。
      </p>

      <RegisterForm currentPath={currentPath} />

      <Link
        href={withFrom("/login", currentPath)}
        className="self-start underline tap-target"
      >
        ログイン
      </Link>
    </main>
  );
}
