import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー・お問い合わせ | もちこれ",
  description:
    "もちこれで預かる情報と利用目的、利用するサービス、データの削除方法、お問い合わせ先をご案内します。",
};

// F-16・SC-16・D-45：ログインせず読める案内として、本人情報を取得せずに表示する
export default function PrivacyPage() {
  return (
    <main className="flex flex-col gap-10 py-8 text-base leading-8 sm:py-12">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          もちこれ
        </p>
        <h1 className="text-2xl leading-snug font-bold text-balance">
          プライバシーポリシー・お問い合わせ
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          最終更新日：<time dateTime="2026-11-13">2026年11月13日</time>
        </p>
        <p>もちこれでお預かりする情報と、その使い道・削除方法を案内します。</p>
      </header>

      <nav
        aria-labelledby="contents-heading"
        className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="contents-heading" className="text-sm font-bold">
          このページの内容
        </h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>
            <a
              href="#information-heading"
              className="underline underline-offset-4"
            >
              お預かりする情報と利用目的
            </a>
          </li>
          <li>
            <a href="#sharing-heading" className="underline underline-offset-4">
              リストの公開とコピー
            </a>
          </li>
          <li>
            <a href="#cookie-heading" className="underline underline-offset-4">
              Cookieについて
            </a>
          </li>
          <li>
            <a
              href="#services-heading"
              className="underline underline-offset-4"
            >
              利用するサービス
            </a>
          </li>
          <li>
            <a
              href="#deletion-heading"
              className="underline underline-offset-4"
            >
              情報の削除・確認・訂正
            </a>
          </li>
          <li>
            <a href="#contact-heading" className="underline underline-offset-4">
              お問い合わせ
            </a>
          </li>
        </ol>
      </nav>

      <section
        aria-labelledby="information-heading"
        className="flex flex-col gap-5"
      >
        <h2
          id="information-heading"
          className="scroll-mt-6 border-b border-zinc-200 pb-3 text-lg font-bold dark:border-zinc-800"
        >
          1. お預かりする情報と利用目的
        </h2>
        <dl className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <dt className="font-bold">アカウントの情報</dt>
            <dd className="flex flex-col gap-2">
              <p>
                メールアドレス、パスワード、メール認証の状態などを、会員登録・ログイン・本人確認や、登録確認・パスワード再設定のメール送信に使います。
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                パスワードは、元の文字列に戻せない形に変換して保存します。
              </p>
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-bold">リストと保存した項目</dt>
            <dd>
              リスト名・説明・カテゴリー、持ち物名・チェック状態・並び順・グループ、よく使う項目・よく使うグループを保存し、リストの表示・編集・公開・コピーや再利用に使います。
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-bold">ログインと安全な利用のための情報</dt>
            <dd>
              ログイン情報、ログイン日時・最終操作日時、IPアドレス、エラーに関する情報を、本人確認、不正利用の防止、障害の調査・対応に使います。
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-bold">通報とお問い合わせ</dt>
            <dd className="flex flex-col gap-2">
              <p>
                通報の対象リスト・理由・受付日時は、公開内容の確認と対応に使います。
              </p>
              <p>
                お問い合わせで受け取ったメールアドレスや本文は、ご連絡への返信と問題の確認・対応に使います。
              </p>
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="sharing-heading"
        className="flex flex-col gap-5"
      >
        <h2
          id="sharing-heading"
          className="scroll-mt-6 border-b border-zinc-200 pb-3 text-lg font-bold dark:border-zinc-800"
        >
          2. リストの公開とコピー
        </h2>
        <p>公開にしたリストは、ログインしていない人も見ることができます。</p>
        <dl className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <dt className="font-bold">公開される情報</dt>
            <dd>リスト名・説明・カテゴリー・持ち物・グループ名と並び順</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-bold">公開リストに表示しない情報</dt>
            <dd>作成者のメールアドレス・チェック状態</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-5 dark:bg-zinc-900">
          <h3 className="font-bold">ほかの人のコピーは残ります</h3>
          <p>
            ほかの人が自分用にコピーしたリストは、独立したデータとして保存されます。元のリストを非公開にしたり削除したり、退会したりしても、ほかの人のコピーは残ります。
          </p>
        </div>
      </section>

      <section aria-labelledby="cookie-heading" className="flex flex-col gap-5">
        <h2
          id="cookie-heading"
          className="scroll-mt-6 border-b border-zinc-200 pb-3 text-lg font-bold dark:border-zinc-800"
        >
          3. Cookieについて
        </h2>
        <p>
          ログイン状態を保つために、Cookie（ブラウザに情報を保存する仕組み）を使います。
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>有効期間は、ログインから最大1年です。</li>
          <li>ログアウト・退会時には削除します。</li>
        </ul>
      </section>

      <section
        aria-labelledby="services-heading"
        className="flex flex-col gap-5"
      >
        <h2
          id="services-heading"
          className="scroll-mt-6 border-b border-zinc-200 pb-3 text-lg font-bold dark:border-zinc-800"
        >
          4. 利用するサービス
        </h2>
        <p>本サービスの公開・運用には、次のサービスの利用を予定しています。</p>
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 px-5 dark:divide-zinc-800 dark:border-zinc-800">
          <li className="flex flex-col gap-1 py-4">
            <h3 className="font-bold">Vercel</h3>
            <p>画面の配信</p>
          </li>
          <li className="flex flex-col gap-1 py-4">
            <h3 className="font-bold">Railway</h3>
            <p>サーバーの運用とデータの保存</p>
          </li>
          <li className="flex flex-col gap-1 py-4">
            <h3 className="font-bold">Brevo</h3>
            <p>登録確認・パスワード再設定などのメール送信</p>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="deletion-heading"
        className="flex flex-col gap-5"
      >
        <h2
          id="deletion-heading"
          className="scroll-mt-6 border-b border-zinc-200 pb-3 text-lg font-bold dark:border-zinc-800"
        >
          5. 情報の削除・確認・訂正
        </h2>
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">退会の方法</h3>
          <p>
            <Link
              href="/account"
              prefetch={false}
              className="underline underline-offset-4"
            >
              アカウント設定
            </Link>
            の「アカウントを削除」から、現在のパスワードを確認して退会できます。メール認証が済んでいなくても退会できます。
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">退会すると削除される情報</h3>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>本人のリスト（コピーして保存したものを含む）</li>
            <li>持ち物・チェック状態・グループ</li>
            <li>よく使う項目・よく使うグループ</li>
            <li>ログイン情報・パスワード再設定の情報</li>
          </ul>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ほかの人が自分用にコピーしたリストは残ります。
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">ログインできない場合・情報の確認や訂正</h3>
          <p>
            ログインできない場合や、情報の確認・訂正・削除を希望する場合は、下記のお問い合わせ先へご連絡ください。ご本人確認をお願いする場合があります。
          </p>
        </div>
      </section>

      <section
        aria-labelledby="contact-heading"
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="contact-heading" className="scroll-mt-6 text-lg font-bold">
          6. お問い合わせ
        </h2>
        <p>もちこれへのお問い合わせは、メールで受け付けています。</p>
        <a
          href="mailto:simasyam@gmail.com"
          className="self-start break-all font-medium underline underline-offset-4"
        >
          simasyam@gmail.com
        </a>
      </section>

      <nav
        aria-label="ページ移動"
        className="flex flex-wrap gap-x-6 gap-y-3 border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800"
      >
        <Link href="/" prefetch={false} className="underline">
          トップへ戻る
        </Link>
        <Link href="/register" prefetch={false} className="underline">
          新規会員登録
        </Link>
      </nav>
    </main>
  );
}
