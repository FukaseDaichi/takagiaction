// index.html の要素 ID による暗黙グローバル（c / m / a / h / sn / b）の置き換え。
// いずれも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。
// HUD のパネル（ニコチンゲージ・HP・所持ヤニ・下部ステータス）は hud.ts が
// 自前で組むので、ここには現れない。

export const canvas = document.getElementById('c') as HTMLCanvasElement
export const minimap_canvas = document.getElementById('m') as HTMLCanvasElement
export const terminal_el = document.getElementById('a') as HTMLElement
export const hero_el = document.getElementById('h') as HTMLElement
export const sniff_el = document.getElementById('sn') as HTMLElement
export const bubble_el = document.getElementById('b') as HTMLElement
