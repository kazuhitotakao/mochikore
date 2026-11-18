type Props = {
  rows?: number;
  withSelection?: boolean;
};

// D-73（利用者の指示）：短い待ち時間の文字の点滅を避け、候補と同じ高さで場所を保つ。
export function LoadingRows({ rows = 3, withSelection = false }: Props) {
  return (
    <div role="status">
      <span className="sr-only">候補を準備しています。</span>
      <div aria-hidden="true" className="loading-rows">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex h-11 items-center gap-3 border-b border-line-soft"
          >
            {withSelection && (
              <span className="size-6 shrink-0 rounded-full border-2 border-line-soft" />
            )}
            <span
              className={`h-3 rounded bg-sunken ${index % 2 === 0 ? "w-2/5" : "w-3/5"}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
