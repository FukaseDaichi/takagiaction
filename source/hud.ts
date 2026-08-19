import { nicotine_bar, nicotine_fill } from './dom'
import { stage_color } from './nicotine'

// ニコチンゲージは push_sprite() ではなく DOM オーバーレイで描く。
// HP バーと同じ手で画面下部に置くと、傾いたビュー行列のぶん遠くなって
// スプライトが読めない大きさになり、直すには renderer.ts を触ることになる。

export function hud_show(): void {
  nicotine_bar.style.display = 'block'
}

export function hud_hide(): void {
  nicotine_bar.style.display = 'none'
}

export function hud_update(nicotine: number, nicotine_max: number, stage: number): void {
  nicotine_fill.style.width = (nicotine / nicotine_max) * 100 + '%'
  nicotine_fill.style.background = stage_color(stage)
}
