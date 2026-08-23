import { slash_el } from './dom'

// 一撃必殺の決め。画面全体を横切る閃光を CSS で出す。
//
// CSS の層は画面の実解像度で描かれる（canvas は 320×180 を 6 倍に引き伸ばして
// いる）ので、ワールドの中の物をここで描くと 6 倍細かく浮いて見える。逆に
// 画面全体の閃光は「別の層であるべき演出」なので、実解像度で鋭いほうが正しい。
// #wf の白フェードと同じ位置づけ。
//
// 蜘蛛の一撃では出さない — 全段が蜘蛛を一撃で落とすので（docs/equipment.md）、
// 雑魚で出すと常時光り続けて「決め」が意味を失う
export function screen_slash(color: string): void {
  slash_el.style.setProperty('--c', color)
  slash_el.classList.remove('on')
  // 外してすぐ付け直すだけでは同じアニメーションが再生されない。レイアウトを
  // 読んでリフローを起こし、外れた状態を確定させる
  void slash_el.offsetWidth
  slash_el.classList.add('on')
}
