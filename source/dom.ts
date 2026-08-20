// index.html の要素 ID による暗黙グローバル（c / m / a / n / nf）の置き換え。
// いずれも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。

export const canvas = document.getElementById('c') as HTMLCanvasElement
export const minimap_canvas = document.getElementById('m') as HTMLCanvasElement
export const terminal_el = document.getElementById('a') as HTMLElement
export const nicotine_bar = document.getElementById('n') as HTMLElement
export const nicotine_fill = document.getElementById('nf') as HTMLElement
export const hero_el = document.getElementById('h') as HTMLElement
