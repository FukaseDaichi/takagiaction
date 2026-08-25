import { flash_el } from './dom'

// ボスのフェーズ移行の合図。画面全体を赤く 1 度光らせる。
//
// screen-slash.ts（一撃必殺の決め）は使えない。あちらの実体は
// rotate(-19deg) の斜めの閃光帯で「斬った」という意味を持つ絵なので、
// 流用すると意味が濁る。
//
// CSS の層は画面の実解像度で描かれる（canvas は 320×180 を 6 倍に引き伸ばして
// いる）。画面全体のフラッシュは「別の層であるべき演出」なので、実解像度で
// 鋭いほうが正しい。#wf の白フェードと同じ位置づけ。
export function screen_flash(): void {
  flash_el.classList.remove('on')
  // 外してすぐ付け直すだけでは同じアニメーションが再生されない。レイアウトを
  // 読んでリフローを起こし、外れた状態を確定させる（screen-slash.ts と同じ）
  void flash_el.offsetWidth
  flash_el.classList.add('on')
}
