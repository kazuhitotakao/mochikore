// 02_画面配置 共通9：存在しないURLと、読み込みで404になったときの表示
export default function NotFound() {
  return (
    <main className="flex flex-col gap-4 py-8">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
    </main>
  );
}
