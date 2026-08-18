// index.html の要素 ID による暗黙グローバル（c / m / a）の置き換え。
// 3 要素とも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。

export const canvas = document.getElementById('c') as HTMLCanvasElement
export const minimap_canvas = document.getElementById('m') as HTMLCanvasElement
export const terminal_el = document.getElementById('a') as HTMLElement
