// index.html の要素 ID による暗黙グローバル（c / m / a / h / sn / b / wf / sl / bf）の置き換え。
// いずれも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。
// HUD のパネル（ニコチンゲージ・HP・所持ヤニ・下部ステータス）は hud.ts が
// 自前で組むので、ここには現れない。

export const canvas = document.getElementById('c') as HTMLCanvasElement
export const minimap_canvas = document.getElementById('m') as HTMLCanvasElement
export const terminal_el = document.getElementById('a') as HTMLElement
export const hero_el = document.getElementById('h') as HTMLElement
export const start_el = document.getElementById('st') as HTMLElement
export const sniff_el = document.getElementById('sn') as HTMLElement
export const bubble_el = document.getElementById('b') as HTMLElement
export const fade_el = document.getElementById('wf') as HTMLElement
export const slash_el = document.getElementById('sl') as HTMLElement
export const flash_el = document.getElementById('bf') as HTMLElement
