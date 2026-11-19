// D-115：アプリのアイコン（ホーム画面・ブラウザのタブ）。深い緑の地に、白いチェック欄と線を3行。
// 一番上だけチェック済みにして「リストをチェックして使う」アプリだと伝える。
// next/og（ImageResponse）で描くので、色は globals.css の名前ではなく値で書く（brand・background と同じ値）
const BRAND = "#2f6652";
const WHITE = "#fffdf8";

// 線の長さを行ごとに変えて、手書きのリストらしく見せる
const ROWS = [
  { y: 32, lineEnd: 76, checked: true },
  { y: 50, lineEnd: 68, checked: false },
  { y: 68, lineEnd: 72, checked: false },
] as const;

/**
 * 100×100 の座標で描く。絵はすべて中心から半径40の円の中に収め、
 * Android の丸いアイコン（maskable）で切り抜かれても欠けないようにする。
 * tab はブラウザのタブ用（32px）。角を丸め、小さくてもつぶれないよう絵を大きく・線を太くする。
 * ホーム画面用は四角のまま渡し、角は端末が丸める。
 */
export function AppIconArt({ tab = false }: { tab?: boolean }) {
  const weight = tab ? 1.3 : 1;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100">
        <rect width="100" height="100" rx={tab ? 22 : 0} fill={BRAND} />
        <g
          transform={
            tab ? "translate(50 50) scale(1.25) translate(-50 -50)" : undefined
          }
        >
          {ROWS.map(({ y, lineEnd, checked }) => (
            <g key={y}>
              <rect
                x="24"
                y={y - 6}
                width="12"
                height="12"
                rx="3"
                fill={checked ? WHITE : "none"}
                stroke={WHITE}
                strokeWidth={2.6 * weight}
              />
              {checked && (
                <path
                  d={`M26.8 ${y + 0.2} l2.5 2.5 l4.6 -5.2`}
                  fill="none"
                  stroke={BRAND}
                  strokeWidth={2.6 * weight}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <line
                x1="44"
                y1={y}
                x2={lineEnd}
                y2={y}
                stroke={WHITE}
                strokeWidth={4.6 * weight}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
