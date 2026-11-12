import Link from "next/link";
import type { User } from "@/types/api";

export function PublicHeader({
  user,
  listIndex = false,
}: {
  user: User | null;
  listIndex?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <Link href={user ? "/lists" : "/"} prefetch={false} className="font-bold">
        もちこれ
      </Link>
      <nav aria-label="メインメニュー" className="flex gap-3 text-sm">
        <Link
          href="/public/lists"
          prefetch={false}
          aria-current={listIndex ? "page" : undefined}
          className="underline"
        >
          公開リスト
        </Link>
        <Link
          href={user ? "/account" : "/login"}
          prefetch={false}
          className="underline"
        >
          {user ? "アカウント" : "ログイン"}
        </Link>
      </nav>
    </header>
  );
}
