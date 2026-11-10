type Props = {
  id: string;
  message: string | undefined;
};

// 02_画面配置 共通6・C-04：入力欄の下に、項目ごとに1文だけ出す
export function FieldError({ id, message }: Props) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}
