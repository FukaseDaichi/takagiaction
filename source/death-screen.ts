import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { canvas } from './dom'
import {
  condition_texts, death_message, format_run_time,
} from './death-screen-model'
import type { run_result_t } from './death-screen-model'
import {
  meta, meta_buy, meta_drain_factor, meta_max_level, meta_nicotine_max,
  meta_power_factor, meta_sniff_distance, meta_sniff_threshold,
  meta_spare_count, meta_speed_factor, meta_upgrade_price,
} from './meta'
import type { meta_upgrade_id_t } from './meta'
import { nicotine_stage_normal, player_speed } from './nicotine'
import { terminal_cancel, terminal_clear, terminal_hide } from './terminal'
import './death-screen.css'

import hero_url from '../m/ui/hero.webp'
import body_url from '../m/ui/body.webp'
import door_url from '../m/ui/door.webp'
import icon_lung_url from '../m/ui/icon-lung.webp'
import icon_brain_url from '../m/ui/icon-brain.webp'
import icon_nose_url from '../m/ui/icon-nose.webp'
import icon_bullet_url from '../m/ui/icon-bullet.webp'
import icon_cig_url from '../m/ui/icon-cig.webp'
import icon_leg_url from '../m/ui/icon-leg.webp'
import stat_depth_url from '../m/ui/icon-stat-depth.webp'
import stat_time_url from '../m/ui/icon-stat-time.webp'
import stat_kills_url from '../m/ui/icon-stat-kills.webp'
import stat_smoke_url from '../m/ui/icon-stat-smoke.webp'
import stat_dummy_url from '../m/ui/icon-stat-dummy.webp'

// 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。
// result = null は初回起動モード（記録と状態パネルを隠す）。

interface upgrade_row_t {
  id: meta_upgrade_id_t
  name: string
  icon: string
  color: string
  flavor: string // 種別の一言。名前の隣に小さく出す
  stat: string // 効果のラベル。「現在値 → 次の段の値」の前に置く
  // 任意の段での効果値。現在値と次段プレビューの両方をこれで出す。
  // 式は meta.ts の getter（段数引数）から引き、画面側に書き写さない
  value: (level: number) => string
}

// 係数の百分率は Math.round を通す（耐性 Lv8 は 1 - meta_drain_factor() が
// 浮動小数の丸め誤差を持ち、100 倍すると 32.00000000000001 になってしまう）
const upgrade_rows: upgrade_row_t[] = [
  {
    id: 'lung', name: '肺活量', icon: icon_lung_url, color: '#3ac6f0',
    flavor: '吸い方の訓練', stat: '最大ゲージ',
    value: (level) => String(meta_nicotine_max(level)),
  },
  {
    id: 'tolerance', name: 'ニコチン耐性', icon: icon_brain_url, color: '#a86df0',
    flavor: '我慢の訓練', stat: '減少速度',
    value: (level) => '-' + Math.round((1 - meta_drain_factor(level)) * 100) + '%',
  },
  {
    id: 'sniff', name: '嗅覚', icon: icon_nose_url, color: '#3af08a',
    flavor: '利き煙草。ゲージ低下時に残り香の方向が分かる', stat: '発動',
    value: (level) => level === 0
      ? 'なし'
      : 'ゲージ' + Math.round(meta_sniff_threshold(level) * 100) + '%以下' +
        (meta_sniff_distance(level) ? '＋距離' : ''),
  },
  {
    id: 'leg', name: '脚力', icon: icon_leg_url, color: '#f0568c',
    // 百分率ではなく速度そのものを出す（肺活量の「最大ゲージ 130」と同じ流儀）。
    // 基礎値 128 を書き写さないため player_speed() から引く
    flavor: '逃げ足の訓練', stat: '移動速度',
    value: (level) =>
      String(Math.round(player_speed(nicotine_stage_normal, meta_speed_factor(level)))),
  },
  {
    id: 'power', name: '火力', icon: icon_bullet_url, color: '#f0932a',
    flavor: '闇サイトから届く物資', stat: '射撃間隔',
    value: (level) => '-' + Math.round((1 - meta_power_factor(level)) * 100) + '%',
  },
  {
    id: 'spare', name: '予備の一本', icon: icon_cig_url, color: '#f0c93a',
    flavor: '闇サイトから届く物資。浅く吸える [E]', stat: '所持数',
    value: (level) => meta_spare_count(level) + '本',
  },
]

// 選択位置。0 〜 upgrade_rows.length-1 = 強化行、upgrade_rows.length = 地下へ戻る
let selected = 0
let current: run_result_t | null = null
let on_descend = (): void => {}
let root: HTMLDivElement | null = null

export function death_screen_show(
  result: run_result_t | null, on_start: () => void,
): void {
  current = result
  on_descend = on_start
  selected = 0
  if (!root) {
    root = document.createElement('div')
    root.id = 'ds'
    document.body.appendChild(root)
  }
  canvas.style.opacity = '0.3'
  // 死亡画面はターミナルを使わない。表示中の通知チェーンや起動時の文字が
  // 裏で動いたまま・映ったまま残らないよう、ここで止めて隠す
  terminal_cancel()
  terminal_clear()
  terminal_hide()
  render()
  root.style.display = 'grid'
  document.addEventListener('keydown', on_key)
}

function descend(): void {
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend()
}

function buy(id: meta_upgrade_id_t): void {
  if (meta_buy(id)) {
    audio_play(audio_sfx_pickup)
    render()
  }
}

function on_key(event: KeyboardEvent): void {
  const k = event.key
  const descend_index = upgrade_rows.length
  if (k === 'Tab') {
    event.preventDefault()
    selected = selected === descend_index ? 0 : descend_index
  } else if (k === 'ArrowUp' || k === 'ArrowLeft') {
    selected = selected === descend_index
      ? descend_index - 1 : (selected + descend_index - 1) % descend_index
  } else if (k === 'ArrowDown' || k === 'ArrowRight') {
    selected = selected === descend_index ? 0 : (selected + 1) % descend_index
  } else if (k === 'Enter') {
    if (selected === descend_index) { descend() } else { buy(upgrade_rows[selected].id) }
    return // buy() が再描画済み。下の再描画と二重にしない
  } else if (k === 'Escape') {
    descend()
    return
  } else {
    return
  }
  render()
}

function record_row(icon: string, label: string, value: string): string {
  return '<div class="ds-record-row"><img src="' + icon + '" alt="">' +
    label + '<b>' + value + '</b></div>'
}

function blocks(on: number, total: number): string {
  let html = '<span class="ds-blocks">'
  for (let i = 0; i < total; i++) {
    html += '<i class="' + (i < on ? '' : 'off') + '"></i>'
  }
  return html + '</span>'
}

function render(): void {
  const r = current
  const dead = r !== null

  let left = '<h1 class="ds-title">' +
    (dead ? '死亡したよ、高木。' : '自席の端末。') + '</h1>' +
    '<p class="ds-sub">' +
    (dead ? '救護ドローンが君を回収して、自席へ戻した。' : '闇サイトに接続した。') +
    '</p>'

  // 見本ではイラストが左半分の背景で、記録と状態パネルがその上に浮く。
  // ds-hero を絶対配置の背景にするため、この 3 つを 1 つの入れ物にまとめる
  left += '<div class="ds-left-body">' +
    '<div class="ds-hero" style="background-image:url(' + hero_url + ')"></div>'

  if (dead) {
    left += '<div class="ds-panel ds-record">' +
      '<div class="ds-panel-title">今回の記録</div>' +
      record_row(stat_depth_url, '到達深度', r.depth + ' F') +
      record_row(stat_time_url, '生存時間', format_run_time(r.run_time)) +
      record_row(stat_kills_url, '撃破数', r.kills + ' 体') +
      record_row(stat_smoke_url, '喫煙回数', r.smoke_count + ' 回') +
      record_row(stat_dummy_url, 'ダミー踏み', r.dummy_count + ' ヶ所') +
      '</div>'

    // 体調は死因の説明であって購入判断には効かない。HP やニコチン残量の数値は
    // 吸いたい気持ち（残量比の逆数）と同じ事実の言い換えなので出さない
    const message = death_message(r.death_cause)
    const condition = condition_texts(r.nicotine_ratio)
    const craving_percent = Math.round(condition.craving_ratio * 100)
    left += '<div class="ds-status">' +
      '<div class="ds-death-message">' + message[0] + '<br>' + message[1] + '</div>' +
      '<img src="' + body_url + '" alt="">' +
      '<div>' +
      '<div class="ds-cond-line">手の震え<b>' + condition.tremor + '</b>' +
      '集中力<b>' + condition.focus + '</b></div>' +
      '<div class="ds-gauge-row">吸いたい気持ち' +
      blocks(Math.round(condition.craving_ratio * 10), 10) +
      '<b>' + (craving_percent >= 100 ? 'MAX' : craving_percent + '%') + '</b></div>' +
      '</div>' +
      '</div>'
  }

  left += '</div>'

  let rows = ''
  for (let i = 0; i < upgrade_rows.length; i++) {
    const row = upgrade_rows[i]
    const level = meta.levels[row.id]
    const max = meta_max_level[row.id]
    const maxed = level >= max
    const cost = meta_upgrade_price(row.id, level)
    let pips = ''
    for (let p = 0; p < max; p++) {
      pips += '<i class="' + (p < level ? 'on' : '') + '"></i>'
    }
    // 効果行は「現在値 → 次の段の値」。次の値だけ行の色で光らせて、
    // 買うと何が変わるかをこの 1 行で読めるようにする。最大段は現在値のみ
    const stat = '<div class="ds-row-stat">' + row.stat +
      ' <b>' + row.value(level) + '</b>' +
      (maxed
        ? ''
        : '<span class="ds-arrow">→</span><b class="ds-next" style="color:' +
          row.color + '">' + row.value(level + 1) + '</b>') +
      '</div>'
    rows += '<div class="ds-row' + (selected === i ? ' selected' : '') + '">' +
      '<img src="' + row.icon + '" alt="">' +
      '<div><div class="ds-row-name" style="color:' + row.color + '">' +
      row.name + '<small>' + row.flavor + '</small></div>' +
      stat + '</div>' +
      '<div class="ds-row-right">' +
      '<div class="ds-row-level">Lv. ' + level + ' / ' + max +
      '<div class="ds-pips" style="color:' + row.color + '">' + pips + '</div></div>' +
      // ヤニと金額の改行は ds-cost の中で起こす。ds-buy は flex なので、
      // 直下に置いた <br> は要素として独立した flex 項目になり改行にならない
      (maxed
        ? '<button class="ds-buy" disabled>MAX</button>'
        : '<button class="ds-buy" data-buy="' + row.id + '"' +
          (meta.yani < cost ? ' disabled' : '') +
          '><span class="ds-cost">ヤニ<br>' + cost + '</span>' +
          '<span class="ds-plus">＋</span></button>') +
      '</div></div>'
  }

  // meta.best_depth は未プレイ時 0 のため、1 で底上げして「推奨深度: 0F+」を避ける
  const recommended = Math.max(meta.best_depth, 1)
  const descend_label = dead ? '地下へ戻る' : '地下へ潜る'
  const right = '<div class="ds-shop">' +
    '<div><div class="ds-shop-title">闇サイト</div>' +
    '<div class="ds-shop-sub">ヤニを送ると訓練と物資が届く。</div>' +
    (meta.persistent
      ? ''
      : '<div class="ds-warning">警告: ストレージ利用不可。強化はこのセッション限りで消える</div>') +
    '</div>' +
    '<div class="ds-shop-balance">ヤニ残高<b>' + meta.yani + '</b></div>' +
    '</div>' +
    rows +
    '<button class="ds-descend' + (selected === upgrade_rows.length ? ' selected' : '') + '">' +
    '<img src="' + door_url + '" alt="">' +
    '<span>' + descend_label +
    '<small>推奨深度 ' + recommended + 'F+ ・ また煙草を探しに行く</small></span>' +
    '</button>'

  root!.innerHTML =
    '<div class="ds-main"><div class="ds-left">' + left + '</div>' +
    '<div class="ds-right">' + right + '</div></div>' +
    '<div class="ds-footer"><span>◀ ▶ 強化選択</span><span>[Enter] 強化する</span>' +
    '<span>[Tab] 項目切替</span><span>[Esc] ' + descend_label + '</span></div>'

  root!.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
    button.onclick = () => buy(button.dataset.buy as meta_upgrade_id_t)
  })
  root!.querySelector<HTMLButtonElement>('.ds-descend')!.onclick = descend
}
