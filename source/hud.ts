import { format_run_time } from './death-screen-model'
import { minimap_canvas, sniff_el } from './dom'
import { hud_objective, hud_yani_progress } from './hud-model'
import { meta } from './meta'
import { stage_color } from './nicotine'
import { player_hp_max, state } from './state'
import './hud.css'

import icon_cig_url from '../m/ui/icon-cig.webp'
import stat_depth_url from '../m/ui/icon-stat-depth.webp'
import stat_kills_url from '../m/ui/icon-stat-kills.webp'
import stat_smoke_url from '../m/ui/icon-stat-smoke.webp'
import stat_time_url from '../m/ui/icon-stat-time.webp'

// ゲーム中の HUD。DOM オーバーレイで描く理由は docs/gameplay.md「HUD が DOM
// である理由」。構造はこのモジュールが起動時に 1 度だけ組み、hud_update() は
// 値ノードの textContent と width / color しか触らない（毎フレーム
// innerHTML を組み直すと、パネル 8 枚ぶんのパースとレイアウトが 60fps で走る）。

// 非常口だけ線画アイコンの持ち合わせがないためインライン SVG で描く。
// 他の 5 つ（m/ui/icon-stat-*.webp）と同じオレンジの線画に合わせている
const icon_exit_svg =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14 3H5v18h9"/><path d="M12 12h9"/><path d="M18 8.5 21.5 12 18 15.5"/></svg>'

function stat_icon(url: string): string {
  return '<img src="' + url + '" alt="">'
}

function stat_cell(icon: string, label: string, value_class = ''): string {
  return '<div class="hud-stat">' + icon +
    '<div><div class="hud-stat-label">' + label + '</div>' +
    '<div class="hud-stat-value ' + value_class + '"></div></div></div>'
}

const root = document.createElement('div')
root.id = 'hud'
root.innerHTML =
  '<div class="hud-left">' +
    '<div class="hud-panel hud-nico">' +
      '<div class="hud-label">ニコチンゲージ</div>' +
      '<div class="hud-gauge"><i></i><b><span></span><small>%</small></b></div>' +
    '</div>' +
    '<div class="hud-panel hud-hp">' +
      '<div class="hud-row"><span class="hud-heart">♥</span>' +
      '<span class="hud-hp-name">HP</span><b></b></div>' +
      '<div class="hud-blocks"></div>' +
    '</div>' +
    '<div class="hud-panel hud-yani">' +
      '<div class="hud-row"><img src="' + icon_cig_url + '" alt="">' +
      '<span class="hud-label">所持ヤニ</span></div>' +
      '<div class="hud-yani-amount"></div>' +
      '<div class="hud-note"></div>' +
      '<div class="hud-track"><i></i></div>' +
    '</div>' +
  '</div>' +
  '<div class="hud-panel hud-map">' +
    '<div class="hud-legend">' +
      '<div><i class="explored"></i>探索済み</div>' +
      '<div><i class="area"></i>喫煙所</div>' +
    '</div>' +
  '</div>' +
  '<div class="hud-bottom">' +
    '<div class="hud-panel hud-stats">' +
      stat_cell(stat_icon(stat_depth_url), '深度', 'depth') +
      stat_cell(stat_icon(stat_time_url), '経過時間') +
      stat_cell(stat_icon(stat_kills_url), '撃破数') +
      stat_cell(stat_icon(stat_smoke_url), '一服中') +
      stat_cell(icon_exit_svg, '非常口') +
      stat_cell(stat_icon(icon_cig_url), '予備 [E]') +
    '</div>' +
    '<div class="hud-panel hud-objective">' +
      '<div class="hud-objective-title">次にやること</div>' +
      '<div class="hud-objective-main"><span></span></div>' +
      '<div class="hud-note"></div>' +
    '</div>' +
  '</div>'
document.body.appendChild(root)

// ミニマップの canvas と残り香は index.html の静的要素（minimap.ts が id で
// 掴んでいる）。生成をこちらに移すと dom.ts の静的な取得が成り立たないため、
// 出来合いの要素をパネルへ移してくる
const map_panel = root.querySelector<HTMLElement>('.hud-map')!
map_panel.prepend(minimap_canvas)
map_panel.appendChild(sniff_el)

function pick<T extends HTMLElement>(selector: string): T {
  return root.querySelector<T>(selector)!
}

const nico_gauge = pick('.hud-gauge')
const nico_fill = pick<HTMLElement>('.hud-gauge i')
const nico_percent = pick('.hud-gauge span')
const hp_value = pick('.hud-hp b')
const hp_blocks: HTMLElement[] = []
const yani_amount = pick('.hud-yani-amount')
const yani_note = pick('.hud-yani .hud-note')
const yani_fill = pick<HTMLElement>('.hud-track i')
const stat_values = root.querySelectorAll<HTMLElement>('.hud-stat-value')
const objective_main = pick('.hud-objective-main span')
const objective_note = pick('.hud-objective .hud-note')

const blocks_el = pick('.hud-blocks')
for (let i = 0; i < player_hp_max; i++) {
  const block = document.createElement('i')
  blocks_el.appendChild(block)
  hp_blocks.push(block)
}

// 毎フレーム同じ値を書き戻さない。textContent への代入は同じ文字列でも
// スタイル計算を汚すため、HUD の 12 ノード分がまとめて毎フレーム走る
function set_text(el: HTMLElement, text: string): void {
  if (el.textContent !== text) { el.textContent = text }
}

function set_style(
  el: HTMLElement, key: 'width' | 'background' | 'borderColor', value: string,
): void {
  if (el.style[key] !== value) { el.style[key] = value }
}

function set_class(el: HTMLElement, name: string): void {
  if (el.className !== name) { el.className = name }
}

export function hud_show(): void {
  root.style.display = 'block'
}

export function hud_hide(): void {
  root.style.display = 'none'
}

export function hud_update(stage: number): void {
  const ratio = state.nicotine / state.nicotine_max
  const color = stage_color(stage)
  set_style(nico_fill, 'width', ratio * 100 + '%')
  set_style(nico_fill, 'background', color)
  // 枠線も段階色にする。枠だけオレンジで固定すると限界帯の赤い塗りと喧嘩する
  set_style(nico_gauge, 'borderColor', color)
  set_text(nico_percent, String(Math.round(ratio * 100)))

  const hp = Math.max(0, state.entity_player!.h)
  set_text(hp_value, hp + ' / ' + player_hp_max)
  for (let i = 0; i < hp_blocks.length; i++) {
    set_class(hp_blocks[i], i < hp ? '' : 'off')
  }

  // 持ち帰り見込み。ヤニは run_end() が meta へ合算するため、ラン中の残高は
  // 「いま死んでも使える額」= 恒久残高 + このランで拾った分になる
  const yani = meta.yani + state.yani_run
  const progress = hud_yani_progress(yani, meta.levels)
  set_text(yani_amount, String(yani))
  set_text(
    yani_note,
    progress.cost === 0
      ? '全ての強化を取得済み'
      : progress.remain === 0
        ? '強化できる（最安 ' + progress.cost + '）'
        : '次の強化まで：' + progress.remain,
  )
  set_style(yani_fill, 'width', progress.ratio * 100 + '%')

  set_text(stat_values[0], String(state.depth))
  set_text(stat_values[1], format_run_time(state.run_time))
  set_text(stat_values[2], String(state.kills))
  set_text(stat_values[3], state.smoking ? '吸引中' : '—')
  set_text(stat_values[4], state.exit_open ? '開通' : '未開通')
  set_class(stat_values[4], 'hud-stat-value ' + (state.exit_open ? 'ok' : 'warn'))
  set_text(stat_values[5], '×' + state.spares_left)

  const objective = hud_objective(state.smoking, state.exit_open)
  set_text(objective_main, objective.title)
  set_text(objective_note, objective.note)
}
