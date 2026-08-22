import { minimap_canvas, sniff_el } from './dom'
import {
  hp_reveal_idle, hp_reveal_step, hud_percent_visible, hud_spare_urgent,
} from './hud-model'
import type { hp_reveal_t } from './hud-model'
import {
  nicotine_edgy_ratio, nicotine_stage_limit, nicotine_stage_withdrawal,
  nicotine_withdrawal_ratio,
} from './nicotine'
import { player_hp_max, state } from './state'
import './hud.css'

// ゲーム中の HUD。DOM オーバーレイで描く理由は docs/gameplay.md「HUD が DOM
// である理由」。常設の計器はタバコ（ニコチン残量 + 段階）とミニマップだけで、
// 何をいつ出すかは hud-model.ts が決める。
//
// 構造は起動時に 1 度だけ組み、hud_update() は値が変わったノードだけを書き換える
// （毎フレーム innerHTML を組み直すとパースとレイアウトが 60fps で走る）。

const root = document.createElement('div')
root.id = 'hud'
root.innerHTML =
  '<div class="hud-left">' +
    '<div class="cig-row">' +
      '<div class="cig">' +
        '<div class="cig-filter"></div>' +
        '<div class="cig-track">' +
          '<div class="cig-paper"><div class="cig-print">' +
            // 印字帯は段階の境界そのもの。火種が越えた＝段階が変わった、を
            // 色ではなく位置で読ませる（色覚特性があっても境界が分かる）
            '<i style="left:' + nicotine_edgy_ratio * 100 + '%"></i>' +
            '<i style="left:' + nicotine_withdrawal_ratio * 100 + '%"></i>' +
          '</div></div>' +
          '<div class="cig-ember"></div>' +
        '</div>' +
      '</div>' +
      '<div class="cig-percent num"></div>' +
    '</div>' +
    '<div class="meter-row">' +
      '<div class="hp"></div>' +
      '<div class="spare"></div>' +
    '</div>' +
  '</div>' +
  '<div class="hud-map"><div class="hud-map-frame">' +
    '<div class="map-depth num"></div>' +
  '</div></div>'
document.body.appendChild(root)

// ミニマップの canvas と残り香は index.html の静的要素（minimap.ts が id で
// 掴んでいる）。生成をこちらに移すと dom.ts の静的な取得が成り立たないため、
// 出来合いの要素を組み上がった枠へ移してくる
const map_frame = root.querySelector<HTMLElement>('.hud-map-frame')!
map_frame.prepend(minimap_canvas)
root.querySelector<HTMLElement>('.hud-map')!.appendChild(sniff_el)

function pick<T extends HTMLElement>(selector: string): T {
  return root.querySelector<T>(selector)!
}

const cig = pick('.cig')
const cig_paper = pick('.cig-paper')
const cig_ember = pick('.cig-ember')
const cig_percent = pick('.cig-percent')
const meter_row = pick('.meter-row')
const hp_row = pick('.hp')
const spare_row = pick('.spare')
const map_depth = pick('.map-depth')

// ♥ は最大 HP ぶん作り置きし、点灯／消灯はクラスで切り替える
const hp_marks: HTMLElement[] = []
for (let i = 0; i < player_hp_max; i++) {
  const mark = document.createElement('i')
  mark.textContent = '♥'
  hp_row.appendChild(mark)
  hp_marks.push(mark)
}

// 予備の一本のピップ。恒久強化の最大が 5 本なので上限ぶん作り置きする
const spare_max = 5
const spare_pips: HTMLElement[] = []
for (let i = 0; i < spare_max; i++) {
  const pip = document.createElement('i')
  spare_row.appendChild(pip)
  spare_pips.push(pip)
}
const spare_key = document.createElement('b')
spare_key.textContent = 'E'
spare_row.appendChild(spare_key)

let hp_reveal: hp_reveal_t = hp_reveal_idle()

// 毎フレーム同じ値を書き戻さない。同じ文字列・同じクラス名でもスタイル計算を
// 汚すため、HUD のノード分がまとめて毎フレーム走る
function set_text(el: HTMLElement, text: string): void {
  if (el.textContent !== text) { el.textContent = text }
}

function set_style(
  el: HTMLElement, key: 'width' | 'left' | 'display', value: string,
): void {
  if (el.style[key] !== value) { el.style[key] = value }
}

function set_class(el: HTMLElement, name: string): void {
  if (el.className !== name) { el.className = name }
}

export function hud_show(): void {
  // HP はフロアに入るたび満タンに戻るので、猶予タイマーも持ち越さない
  hp_reveal = hp_reveal_idle()
  root.style.display = 'block'
}

export function hud_hide(): void {
  root.style.display = 'none'
}

export function hud_update(stage: number): void {
  const ratio = state.nicotine / state.nicotine_max
  const percent = ratio * 100

  set_style(cig_paper, 'width', percent + '%')
  set_style(cig_ember, 'left', percent + '%')
  set_class(cig, 'cig s' + stage + (state.smoking ? ' smoking' : ''))

  if (hud_percent_visible(stage, state.smoking)) {
    set_text(cig_percent, Math.round(percent) + '%')
    set_class(
      cig_percent,
      'cig-percent num' + (stage >= nicotine_stage_withdrawal ? ' warn' : ''),
    )
  } else {
    set_text(cig_percent, '')
  }

  const hp = Math.max(0, state.entity_player!.h)
  hp_reveal = hp_reveal_step(hp_reveal, hp, player_hp_max, stage, state.time_elapsed)
  set_style(hp_row, 'display', hp_reveal.visible ? 'flex' : 'none')
  if (hp_reveal.visible) {
    set_class(hp_row, 'hp' + (stage === nicotine_stage_limit ? ' blink' : ''))
    for (let i = 0; i < hp_marks.length; i++) {
      set_class(hp_marks[i], i < hp ? '' : 'lost')
    }
  }

  const spares = state.spares_left
  set_style(spare_row, 'display', spares > 0 ? 'flex' : 'none')
  if (spares > 0) {
    set_class(spare_row, 'spare' + (hud_spare_urgent(stage) ? ' urgent' : ''))
    for (let i = 0; i < spare_pips.length; i++) {
      set_style(spare_pips[i], 'display', i < spares ? 'block' : 'none')
    }
  }

  // 両方消えたら行を畳む。左上がタバコ 1 本だけの状態に戻る
  set_style(meter_row, 'display', hp_reveal.visible || spares > 0 ? 'flex' : 'none')

  set_text(map_depth, 'B' + state.depth)
}
