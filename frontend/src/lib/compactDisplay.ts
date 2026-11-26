// D-126：持ち物の行と文字を詰める「コンパクト表示」。選んだことは、この端末のブラウザに覚える（サーバーには保存しない）。
// オンの間は <html> に data-compact を付け、見た目は globals.css の dense: で変える。
// このファイルはサーバーでも読む（layout.tsx）ので、ブラウザの機能を使う処理は置かない。
export const COMPACT_DISPLAY_KEY = "mochikore:compact-display";
export const COMPACT_DISPLAY_ON = "1";
export const COMPACT_DISPLAY_ATTRIBUTE = "data-compact";

/**
 * ページの最初（<head>）で動かす文。React が動く前に覚えた値を読んで印を付け、開いたときから詰めた表示で描く
 * （後から付けると、読み込みのたびに行の高さが変わって見える）。
 * この時点では lib/deviceMemory.ts を使えないので、ここだけ localStorage を直接読む。読めないときは何もしない。
 */
export const COMPACT_DISPLAY_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(COMPACT_DISPLAY_KEY)})===${JSON.stringify(COMPACT_DISPLAY_ON)})document.documentElement.setAttribute(${JSON.stringify(COMPACT_DISPLAY_ATTRIBUTE)},"")}catch(e){}})()`;
