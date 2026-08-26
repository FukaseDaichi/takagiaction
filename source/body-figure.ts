// 人体模型のジオメトリ。DOM を触らず、Node（Vitest）でモックなしに評価できる
// ことが条件（death-screen-model.ts と同じ扱い）。
//
// 座標系は下地 m/ui/body.webp（256×512）そのもの。実測した線の bbox は
// x 48〜208 / y 14〜491 で、内訳は 頭 y14〜78・胸 y96〜176・手 y262（x56 と
// x200）・腰 y248・脚 y304〜491。アンカーはこの実測から採っている。
//
// 器官は手描きのパスではなく ellipse と polyline だけで組む。実測アンカーから
// ずれたときに直しやすく、医療図の模式図という狙いにも合う。

import type { gear_slot_t } from './equipment'
import type { meta_upgrade_id_t } from './meta'

export const body_width = 256
export const body_height = 512

// アイコンを身体の外へ置くため、viewBox は下地より広い。左は -80、右は
// 336 まで取り、アイコン（半径 22）の発光がはみ出さない余白を含む
export const figure_view_box = '-80 -10 416 532'

export interface body_part_t {
  id: meta_upgrade_id_t
  label: string // 部位名。アイコンの alt と器官 <g> の識別に使う
  ax: number // 身体側のアンカー
  ay: number
  ix: number // 強化モードでのアイコン定位置
  iy: number
}

// 解剖順（上から下）。矢印キーはこの順で巡回する。
// アイコンの左右は接続線が互いに交差しない組み合わせを選んだ結果で、
// 右＝脳・肺・腰、左＝鼻・手・脚 になる
export const body_parts: body_part_t[] = [
  { id: 'tolerance', label: '脳', ax: 128, ay: 40, ix: 290, iy: 30 },
  { id: 'sniff', label: '鼻', ax: 128, ay: 58, ix: -34, iy: 70 },
  { id: 'lung', label: '肺', ax: 128, ay: 135, ix: 290, iy: 140 },
  { id: 'power', label: '手', ax: 56, ay: 262, ix: -34, iy: 240 },
  { id: 'spare', label: '腰', ax: 160, ay: 248, ix: 290, iy: 300 },
  { id: 'leg', label: '脚', ax: 128, ay: 360, ix: -34, iy: 370 },
]

// 初期状態のアイコンは身体のすぐ脇に寄り、強化モードで外側の定位置へ飛び出す。
// 2 組の座標を持たず、この比率 1 つから導出する
export const body_stow_ratio = 0.3

export function body_stow_position(part: body_part_t): { x: number, y: number } {
  return {
    x: part.ax + (part.ix - part.ax) * body_stow_ratio,
    y: part.ay + (part.iy - part.ay) * body_stow_ratio,
  }
}

// 装備カードを引き出す 3 点。刃物は右手、ソールは右足、パッチは胸。
// いずれもカードが右へ展開するので、線が身体を横切らない側を選んでいる
export const gear_anchors: Record<gear_slot_t, { x: number, y: number }> = {
  blade: { x: 200, y: 262 },
  sole: { x: 155, y: 478 },
  patch: { x: 128, y: 150 },
}

// 器官の中身。既定は不可視で、フォーカスと強化演出のときだけ光る。
// class は death-screen.css が受ける（ds-o-* は演出で個別に動かす部品）
export const organ_svg: Record<meta_upgrade_id_t, string> = {
  // 脳と、脊椎から四肢へ降りる神経ライン。ニコチン耐性のパルスがここを流れる
  tolerance:
    '<ellipse class="ds-o-brain" cx="128" cy="42" rx="17" ry="13"/>' +
    '<polyline class="ds-o-nerve" points="128,58 128,96 128,212"/>' +
    '<polyline class="ds-o-nerve" points="128,110 96,150 62,250"/>' +
    '<polyline class="ds-o-nerve" points="128,110 160,150 194,250"/>' +
    '<polyline class="ds-o-nerve" points="128,212 110,330 100,470"/>' +
    '<polyline class="ds-o-nerve" points="128,212 146,330 156,470"/>',
  // 鼻と、外から吸い込まれてくる煙の軌跡 6 本
  sniff:
    '<path class="ds-o-nose" d="M122 50l6 14h-6"/>' +
    '<polyline class="ds-o-smoke" points="60,20 96,42 124,56"/>' +
    '<polyline class="ds-o-smoke" points="56,64 92,60 124,58"/>' +
    '<polyline class="ds-o-smoke" points="66,108 98,80 124,62"/>' +
    '<polyline class="ds-o-smoke" points="196,20 160,42 132,56"/>' +
    '<polyline class="ds-o-smoke" points="200,64 164,60 132,58"/>' +
    '<polyline class="ds-o-smoke" points="190,108 158,80 132,62"/>',
  // 左右の肺と気管。膨張はこの 2 つの ellipse を scale する
  lung:
    '<ellipse class="ds-o-lung ds-o-lung-l" cx="106" cy="136" rx="21" ry="31"/>' +
    '<ellipse class="ds-o-lung ds-o-lung-r" cx="150" cy="136" rx="21" ry="31"/>' +
    '<polyline class="ds-o-trachea" points="128,88 128,116 106,132"/>' +
    '<polyline class="ds-o-trachea" points="128,116 150,132"/>',
  // 肩から手へ降りる腕のラインと、両手の輪。反動はこの <g> ごと動かす
  power:
    '<polyline class="ds-o-arm" points="88,104 70,180 56,254"/>' +
    '<polyline class="ds-o-arm" points="168,104 186,180 200,254"/>' +
    '<circle class="ds-o-hand" cx="56" cy="264" r="10"/>' +
    '<circle class="ds-o-hand" cx="200" cy="264" r="10"/>',
  // 腰のポケットと、そこへ収まる煙草 1 本
  spare:
    '<rect class="ds-o-pocket" x="146" y="238" width="26" height="22" rx="3"/>' +
    '<line class="ds-o-cig" x1="152" y1="242" x2="166" y2="242"/>',
  // 骨盤から足へ降りる脚のラインと、足元の接地点
  leg:
    '<polyline class="ds-o-leg" points="118,230 110,318 104,404 100,470"/>' +
    '<polyline class="ds-o-leg" points="138,230 146,318 152,404 156,470"/>' +
    '<ellipse class="ds-o-ground" cx="128" cy="488" rx="46" ry="8"/>',
}
