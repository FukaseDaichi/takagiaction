import {
  audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_exhale, audio_sfx_hit, audio_sfx_lighter,
  audio_sfx_pickup, audio_sfx_shoot, audio_sfx_swing, audio_sfx_terminal,
} from './audio'
import {
  body_height, body_parts, body_stow_position, body_width, figure_view_box, figure_y_vh,
  gear_anchors, gear_card_x, gear_cards, organ_svg,
} from './body-figure'
import { canvas } from './dom'
import {
  death_message, ds_idle_descend, ds_idle_gear, ds_idle_record, ds_initial_state, ds_item_layer,
  ds_part_layer, ds_reduce, format_run_time, is_new_record,
} from './death-screen-model'
import type { ds_state_t, run_result_t } from './death-screen-model'
import { gear_grade, gear_grades, gear_name, gear_slot_labels, gear_slots } from './equipment'
import { gear_icons } from './gear-icons'
import {
  key_down, key_left, key_right, key_shoot, key_spare, key_swap, key_up, keys,
} from './input'
import { meta, meta_buy, meta_max_level, meta_upgrade_price } from './meta'
import type { meta_upgrade_id_t } from './meta'
import { terminal_cancel, terminal_clear, terminal_hide } from './terminal'
import { upgrade_rows } from './upgrade-rows'
import './death-screen.css'

import hero_url from '../m/ui/hero.webp'
import body_url from '../m/ui/body.webp'
import cig_url from '../m/ui/icon-cig.webp'
import door_url from '../m/ui/door.webp'
import stat_depth_url from '../m/ui/icon-stat-depth.webp'
import stat_time_url from '../m/ui/icon-stat-time.webp'
import stat_kills_url from '../m/ui/icon-stat-kills.webp'
import stat_smoke_url from '../m/ui/icon-stat-smoke.webp'
import stat_dummy_url from '../m/ui/icon-stat-dummy.webp'

// 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。
// result = null は初回起動モード。
//
// この画面は DOM を 1 度だけ組み、以降はノードを作り直さない。作り直すと
// CSS アニメーションが破棄されて位相が 0 に戻り、段階開示の演出が成立しない
// （docs/architecture.md「全画面 DOM UI の作り方」）。

// 表示していないあいだの値。death_screen_show() が毎回組み直す
let state: ds_state_t = ds_initial_state(false, false)
let current: run_result_t | null = null
let on_descend_cb = (): void => {}
let root: HTMLDivElement | null = null
// 入場シーケンスの解除タイマー。表示のたびに張り直すので id を控える
let entry_timer: ReturnType<typeof setTimeout> = 0

// upgrade_rows は表示定義の順、body_parts は解剖順。行を id で引くための索引
const row_of = new Map(upgrade_rows.map((row) => [row.id, row]))

// 詳細パネルのフォーカス交代アニメーション（.swap、spec ③）を「強化モードへの
// 初回突入」と区別して起動するための、直近描画の記録
let detail_last_open = false
let detail_last_focus = -1

export function death_screen_show(
  result: run_result_t | null, on_start: () => void,
): void {
  current = result
  on_descend_cb = on_start
  // 記録確認・装備確認は読むものが無ければ項目ごと出さない（設計書 ⑤ ⑥）。
  // 出さない項目には矢印でフォーカスを乗せてもいけないので、表示の有無と
  // 巡回の可否を 1 か所で決めて状態へ載せる。ds_reduce は実行時 import を
  // 持たない葉なので、meta も current も自分では読めない
  const has_record = result !== null || meta.best_depth > 0
  const has_gear = gear_slots.some((slot) => meta.gear[slot] > 0)
  state = ds_initial_state(has_record, has_gear)
  if (!root) { root = build() }
  canvas.style.opacity = '0.3'
  // 死亡画面はターミナルを使わない。表示中の通知チェーンや起動時の文字が
  // 裏で動いたまま・映ったまま残らないよう、ここで止めて隠す
  terminal_cancel()
  terminal_clear()
  terminal_hide()
  fill_static()
  apply()
  root.style.display = 'block'
  // 入場シーケンスをやり直させる。class を外して強制リフローを挟まないと、
  // 同じ class を付け直しても animation が再生されない
  root.classList.remove('entering')
  void root.offsetWidth
  root.classList.add('entering')
  clearTimeout(entry_timer)
  entry_timer = setTimeout(() => {
    state = { ...state, busy: false }
    apply()
  }, 1400)
  count_yani()
  document.addEventListener('keydown', on_key)
}

// stroke-dasharray / stroke-dashoffset に載せる線の実長。共通の固定値にすると、
// 実長を超えるぶんの travel は「もう描き切っている」区間に消える。400 を
// 当てていた 6 本（実長 92〜162）では、340ms の transition のうち線が伸びて
// 見えるのは頭の 35ms だけで、仕様 ② が名指しした stroke-dashoffset の演出が
// 知覚できなかった
function wire_length(x1: number, y1: number, x2: number, y2: number): number {
  return Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10
}

function build(): HTMLDivElement {
  const el = document.createElement('div')
  el.id = 'ds'

  // meta_max_level は 5 か 10 のどちらかなので 10 個作れば全部位を覆える。
  // fill_detail() はこの固定ノードの class/display を切り替えるだけで、
  // キー入力のたびに作り直さない（Task 6 レビュー Finding 4）
  const pips = '<i></i>'.repeat(10)
  let icons = ''
  let wires = ''
  let organs = ''
  let gear_wires = ''
  for (const card of gear_cards) {
    const a = gear_anchors[card.slot]
    // カードは右へ展開するので、線はアンカーから右外へ抜けてカード帯の左端で
    // 止まる。終端の y はカードの縦位置そのもの（body-figure.ts の gear_cards）
    gear_wires += '<line class="ds-gear-wire" data-slot="' + card.slot +
      '" style="--l:' + wire_length(a.x, a.y, gear_card_x, card.y) +
      '" x1="' + a.x + '" y1="' + a.y +
      '" x2="' + gear_card_x + '" y2="' + card.y + '"/>'
  }
  for (let i = 0; i < body_parts.length; i++) {
    const part = body_parts[i]
    const row = row_of.get(part.id)!
    const stow = body_stow_position(part)
    wires += '<line class="ds-wire" data-part="' + part.id + '" style="--i:' + i +
      ';--c:' + row.color + ';--l:' + wire_length(part.ax, part.ay, part.ix, part.iy) +
      '" x1="' + part.ax + '" y1="' + part.ay +
      '" x2="' + part.ix + '" y2="' + part.iy + '"/>'
    organs += '<g class="ds-organ" data-part="' + part.id +
      '" style="--c:' + row.color + '">' + organ_svg[part.id] + '</g>'
    // --sx/--sy が収納位置、--ix/--iy が定位置。強化モードの class で
    // どちらへ translate するかを CSS が選ぶ
    icons += '<g class="ds-part" data-part="' + part.id + '" style="--i:' + i +
      ';--c:' + row.color +
      ';--sx:' + stow.x + ';--sy:' + stow.y +
      ';--ix:' + part.ix + ';--iy:' + part.iy + '">' +
      '<circle class="ds-arc-bg" r="21"/>' +
      '<circle class="ds-arc" r="21"/>' +
      '<image class="ds-part-icon" href="' + row.icon + '" x="-13" y="-13" ' +
      'width="26" height="26"/>' +
      '<path class="ds-check" d="M-6 0l4 5 8-10"/>' +
      '</g>'
  }

  el.innerHTML =
    '<div class="ds-bg" style="background-image:url(' + hero_url + ')"></div>' +
    '<div class="ds-scrim"></div>' +
    '<div class="ds-well"></div>' +
    '<div class="ds-terminal-glow"></div>' +
    '<div class="ds-yani-beam"></div>' +
    '<div class="ds-dim"></div>' +
    '<h1 class="ds-title"></h1>' +
    '<p class="ds-sub"></p>' +
    // .ds-yani-inner は拒否演出の震え専用のラッパ。震えを .ds-yani 自身へ
    // 掛けると入場の ds-in-up と animation プロパティを取り合う
    // （death-screen.css の #ds .ds-yani.reject .ds-yani-inner を参照）
    '<div class="ds-yani"><div class="ds-yani-inner">' +
    '<img class="ds-yani-icon" src="' + cig_url + '" alt="">' +
    '<span class="ds-yani-label">ヤニ</span>' +
    '<b class="ds-yani-value">0</b>' +
    '<div class="ds-yani-warn">警告: ストレージ利用不可。' +
    '強化はこのセッション限りで消える</div>' +
    '</div></div>' +
    '<div class="ds-menu">' +
    '<button class="ds-item" data-item="0">記録確認</button>' +
    '<button class="ds-item" data-item="1">装備確認</button>' +
    '</div>' +
    '<div class="ds-figure">' +
    '<svg class="ds-svg" viewBox="' + figure_view_box + '">' +
    // 重ね順は文書順で 接続線 → 下地 → 器官 → アイコン（設計書「人体模型の
    // SVG」）。装備の接続線も強化の接続線と同じく下地より先に置く ―
    // 後に置くと胸や脚を横切る線が模型の表面へ乗り、奥行きが消える
    '<g class="ds-wires">' + wires + '</g>' +
    '<g class="ds-gear-wires">' + gear_wires + '</g>' +
    '<image class="ds-body" href="' + body_url + '" x="0" y="0" ' +
    'width="' + body_width + '" height="' + body_height + '"/>' +
    '<g class="ds-organs">' + organs + '</g>' +
    '<g class="ds-icons">' + icons + '</g>' +
    '</svg>' +
    '</div>' +
    '<div class="ds-detail">' +
    '<div class="ds-detail-name"></div>' +
    '<div class="ds-detail-flavor"></div>' +
    '<div class="ds-detail-stat">' +
    '<span class="ds-detail-lbl"></span>' +
    '<b class="ds-detail-cur"></b>' +
    '<i class="ds-detail-arw">→</i>' +
    '<b class="ds-detail-nxt"></b>' +
    '</div>' +
    '<div class="ds-detail-level">Lv. <b class="ds-detail-lv"></b>' +
    ' / <b class="ds-detail-mx"></b><span class="ds-detail-pips">' + pips + '</span></div>' +
    '<div class="ds-detail-cost">所持 <b class="ds-detail-own"></b>' +
    '<span class="ds-detail-need-wrap">必要 <b class="ds-detail-need"></b></span></div>' +
    '</div>' +
    '<button class="ds-descend" data-item="' + ds_idle_descend + '">' +
    '<img src="' + door_url + '" alt="">' +
    '<span class="ds-descend-label">地下へ戻る</span>' +
    '<small class="ds-descend-depth"></small>' +
    '</button>' +
    '<div class="ds-hint">' +
    '<span>[Tab] 強化</span><span>[Enter] 決定</span>' +
    '<span class="ds-hint-descend">[Esc] 地下へ戻る</span></div>' +
    '<div class="ds-record">' +
    '<div class="ds-record-scan"></div>' +
    '<div class="ds-record-title">今回の記録</div>' +
    '<div class="ds-record-rows"></div>' +
    '<div class="ds-record-close">[Esc] 閉じる</div>' +
    '</div>' +
    '<div class="ds-nr">' +
    '<div class="ds-nr-title">NEW RECORD</div>' +
    '<div class="ds-nr-sub"></div>' +
    '</div>' +
    '<div class="ds-gearpanel"></div>' +
    '<div class="ds-split"><i></i><i></i></div>'

  document.body.appendChild(el)

  // busy 中とパネル表示中はキーボードと同じくクリックも拒否する。先に state を
  // 書き換えてから dispatch() の changed 判定に持ち込むと、ds_reduce が Enter を
  // 却下したとき（ヤニ不足の購入・busy 中・パネル表示中）でも state だけが
  // 動いて apply() が走らず、DOM と state が食い違ったまま残ってしまうため
  el.querySelectorAll<HTMLButtonElement>('.ds-item').forEach((button) => {
    button.onclick = () => {
      if (state.busy || state.panel !== 'none') { return }
      state = { ...state, mode: 'idle', focus: Number(button.dataset.item) }
      apply()
      dispatch('Enter')
    }
  })
  el.querySelectorAll<SVGGElement>('.ds-part').forEach((g, index) => {
    g.onclick = () => {
      if (state.busy || state.panel !== 'none') { return }
      state = { ...state, mode: 'upgrade', focus: index }
      apply()
      dispatch('Enter')
    }
  })
  // .ds-item / .ds-part と同じガードを持つ。パネル表示中に押せてしまうと、
  // 「Esc は 1 段戻る」の階段（パネル → 強化モード → 降下）を迂回して
  // 一足飛びに降下する、状態機械の外の経路になる（R37）。
  // クリックが state を直接書くのは「キーでは表せない対象の名指し」までで、
  // そこから先の遷移は dispatch('Enter') が ds_reduce に渡す
  el.querySelector<HTMLButtonElement>('.ds-descend')!.onclick = () => {
    if (state.busy || state.panel !== 'none') { return }
    state = { ...state, mode: 'idle', focus: ds_idle_descend }
    apply()
    dispatch('Enter')
  }
  return el
}

// 表示のたびに 1 度だけ書き込む、その回のあいだ変わらない値
function fill_static(): void {
  const dead = current !== null
  text('.ds-title', dead ? death_message(current!.death_cause) : '自席の端末。')
  text('.ds-sub', dead
    ? '救護ドローンが君を回収して、自席へ戻した。'
    : '闇サイトに接続した。')
  root!.querySelector<HTMLElement>('.ds-yani-warn')!.style.display =
    meta.persistent ? 'none' : 'block'

  // 表示の有無は state が持つ（death_screen_show が計算する）。項目を出すか
  // どうかと、矢印がそこへ止まれるかどうかを 2 か所で判断させない。
  // data-item はレイアウト順で決め打ちにせず、状態機械が定義する idle の
  // フォーカス添字（ds_idle_record / ds_idle_gear）から選択子を組む（R4）
  root!.querySelector<HTMLElement>('.ds-item[data-item="' + ds_idle_record + '"]')!.style.display =
    state.has_record ? '' : 'none'
  fill_record()

  root!.querySelector<HTMLElement>('.ds-item[data-item="' + ds_idle_gear + '"]')!.style.display =
    state.has_gear ? '' : 'none'
  fill_gear()

  // meta.best_depth は未プレイ時 0 のため、1 で底上げして「0F+」を避ける
  text('.ds-descend-depth', Math.max(meta.best_depth, 1) + 'F-')
  text('.ds-descend-label', current !== null ? '地下へ戻る' : '地下へ潜る')
  // キーヒントの 3 つ目の <span> も、初回起動では「地下へ潜る」に揃える（R5）
  text('.ds-hint-descend', '[Esc] ' + (current !== null ? '地下へ戻る' : '地下へ潜る'))

  const banner = root!.querySelector<HTMLElement>('.ds-nr')!
  const record = current !== null && is_new_record(current.depth, current.best_depth_before)
  banner.style.display = record ? 'block' : 'none'
  if (record) {
    text('.ds-nr-sub', '自己ベスト更新！ 深度 ' + current!.depth + 'F')
    audio_play(audio_sfx_pickup)
  }
}

function text(selector: string, value: string): void {
  root!.querySelector<HTMLElement>(selector)!.textContent = value
}

// 入場シーケンス 1.10s の「ヤニ残高がカウントアップ」（設計書）。桁そのものが
// 変わる演出は CSS では表せないので、ここだけ JS が値を刻む ― 階梯（順序）は
// CSS が持ったままで、これは 1 本の値の補間である。
// 残高は 1.10s まで opacity 0 なので、0 から刻み始めても「見えていた数字が
// 0 に戻る」ようには見えない。刻み終わりは入力が開く 1.40s に揃えてあり、
// そのとき busy を解く apply() が最終値を書くので、途中で止めても残高が
// 欠けたまま残ることはない
const yani_count_delay = 1100
const yani_count_steps = 10
const yani_count_step = 30
let yani_timer: ReturnType<typeof setTimeout> = 0

function count_yani(step = 0): void {
  clearTimeout(yani_timer)
  if (step > 0) {
    text('.ds-yani-value', String(step >= yani_count_steps
      ? meta.yani
      : Math.round(meta.yani * step / yani_count_steps)))
  }
  if (step >= yani_count_steps) { return }
  yani_timer = setTimeout(
    () => { count_yani(step + 1) },
    step === 0 ? yani_count_delay : yani_count_step,
  )
}

// 状態を DOM へ写す。ノードは作らず、class とテキストだけを触る
function apply(): void {
  const el = root!
  el.classList.toggle('mode-upgrade', state.mode === 'upgrade')
  el.classList.toggle('panel-record', state.panel === 'record')
  el.classList.toggle('panel-gear', state.panel === 'gear')
  el.classList.toggle('busy', state.busy)

  // .reject は「直前の操作が却下された」ことだけを示す一撃の演出フラグで、
  // ds_state_t には持たない。ここで毎回外さないと、一度でも購入に失敗した
  // 部位の赤みが .poor の判定と無関係にこの画面を閉じるまで居座ってしまう
  // （.ds-detail は全部位で使い回す 1 要素なので、フォーカスを移しても
  // class は自然には落ちない）。buy() の却下分岐は apply() を呼ばないので、
  // ここで消しても点灯直後の 1 フレームで消える心配はない
  el.querySelector<HTMLElement>('.ds-detail')!.classList.remove('reject')
  el.querySelector<HTMLElement>('.ds-yani')!.classList.remove('reject')

  text('.ds-yani-value', String(meta.yani))

  el.querySelectorAll<SVGGElement>('.ds-part').forEach((g, index) => {
    const part = body_parts[index]
    const level = meta.levels[part.id]
    const max = meta_max_level[part.id]
    const maxed = level >= max
    set_layer(g, ds_part_layer(state, index))
    const organ = el.querySelector<SVGGElement>('.ds-organ[data-part="' + part.id + '"]')!
    organ.classList.toggle('active', ds_part_layer(state, index) === 'active')
    g.classList.toggle('maxed', maxed)
    // 買えない項目は円弧とアイコンがわずかに赤みを帯びるだけにする。
    // 赤く巨大な警告は出さない
    g.classList.toggle('poor', !maxed && meta.yani < meta_upgrade_price(part.id, level))
    // 円弧は level / max。周長 2πr（r = 21）を段数で割って dasharray に載せる
    const arc = g.querySelector<SVGCircleElement>('.ds-arc')!
    const circumference = 2 * Math.PI * 21
    arc.style.strokeDasharray = String(circumference)
    arc.style.strokeDashoffset = String(circumference * (1 - level / max))
  })

  el.querySelectorAll<HTMLElement>('[data-item]').forEach((item) => {
    set_layer(item, ds_item_layer(state, Number(item.dataset.item)))
  })

  fill_detail()
}

// Level 2。強化モードで部位を選んでいるあいだだけ出る。効果の数値は
// upgrade_rows[].value(level) 経由で meta.ts の getter から引き、式を
// 画面側に書き写さない
function fill_detail(): void {
  if (state.mode !== 'upgrade') {
    detail_last_open = false
    // #ds を display:none で隠すと、次の display:block で子要素の animation が
    // 0% から再生し直される（entering と同じ仕組み）。.swap が残っていると
    // idle のはずの画面で前回のフォーカス内容がフェードして見えてしまうため、
    // ここで確実に剥がしておく
    root!.querySelector<HTMLElement>('.ds-detail')!.classList.remove('swap')
    return
  }
  const part = body_parts[state.focus]
  const row = row_of.get(part.id)!
  const level = meta.levels[part.id]
  const max = meta_max_level[part.id]
  const maxed = level >= max
  const detail = root!.querySelector<HTMLElement>('.ds-detail')!

  // フォーカスそのものが変わったときだけ .swap を焚く（spec ③）。強化モード
  // への初回突入（detail_last_open が false）はパネル自身の展開演出と二重に
  // なるため除外し、フォーカスを変えない Enter（購入）も除外する
  const focus_changed = detail_last_open && detail_last_focus !== state.focus
  detail_last_open = true
  detail_last_focus = state.focus
  if (focus_changed) {
    detail.classList.remove('swap')
    void detail.offsetWidth
    detail.classList.add('swap')
  }

  detail.style.setProperty('--c', row.color)
  detail.classList.toggle('maxed', maxed)
  text('.ds-detail-name', row.name)
  text('.ds-detail-flavor', row.flavor)
  text('.ds-detail-lbl', row.stat)
  text('.ds-detail-cur', row.value(level))
  text('.ds-detail-nxt', maxed ? '' : row.value(level + 1))
  text('.ds-detail-lv', String(level))
  text('.ds-detail-mx', String(max))
  text('.ds-detail-own', String(meta.yani))

  const cost = maxed ? 0 : meta_upgrade_price(part.id, level)
  text('.ds-detail-need', String(cost))
  detail.classList.toggle('poor', !maxed && meta.yani < cost)

  // pips は build() が 10 個ぶん作り切ったノードを使い回す。class と
  // display だけを切り替え、キー入力のたびに innerHTML で作り直さない
  // （不変条件：ノードは 1 度だけ組む。Task 6 レビュー Finding 4）
  root!.querySelectorAll<HTMLElement>('.ds-detail-pips i').forEach((pip, p) => {
    pip.classList.toggle('on', p < level)
    pip.style.display = p < max ? '' : 'none'
  })
}

// Level 3。記録確認パネル。行の出現を 70ms ずつずらすための連番。
// fill_record() が 0 に戻す
let record_index = 0

function record_row(icon: string, label: string, value: string, cls = ''): string {
  return '<div class="ds-record-row' + (cls ? ' ' + cls : '') +
    '" style="--i:' + record_index++ + '">' +
    '<img src="' + icon + '" alt="">' + label + '<b>' + value + '</b></div>'
}

// パネルの中身は表示のたびに 1 度だけ組む。アニメーションは行が持つが、
// 開くのは Enter のときだけなので、ここで作り直しても位相は壊れない
function fill_record(): void {
  const rows = root!.querySelector<HTMLElement>('.ds-record-rows')!
  record_index = 0
  const r = current
  if (!r) {
    // 初回起動モード。今回の記録が無いので最高深度の 1 行だけに縮める
    rows.innerHTML = record_row(stat_depth_url, '最高深度', meta.best_depth + ' F')
    return
  }
  const record = is_new_record(r.depth, r.best_depth_before)
  const best = meta.best_depth + ' F' + (record
    ? '<span class="ds-record-prev">← ' + r.best_depth_before + ' F</span>' +
      '<span class="ds-record-new">NEW</span>'
    : '')
  rows.innerHTML =
    // 到達深度と同じ量なので、アイコンは stat_depth_url を流用する
    record_row(stat_depth_url, '到達深度', r.depth + ' F') +
    record_row(stat_depth_url, '最高深度', best, record ? 'record' : '') +
    record_row(stat_time_url, '生存時間', format_run_time(r.run_time)) +
    record_row(stat_kills_url, '撃破数', r.kills + ' 体') +
    record_row(stat_smoke_url, '喫煙回数', r.smoke_count + ' 回') +
    record_row(stat_dummy_url, 'ダミー踏み', r.dummy_count + ' ヶ所')
}

// Level 3。装備確認パネル。装備は買うものではないので、強化の動線とは別の
// 面に置く。カードは模型の装備部位から線で繋がっていて、閉じると模型側へ
// 吸い込まれる
function fill_gear(): void {
  const panel = root!.querySelector<HTMLElement>('.ds-gearpanel')!
  let html = ''
  let index = 0
  for (const card of gear_cards) {
    const slot = card.slot
    const tier = meta.gear[slot]
    const owned = tier > 0
    const grade = owned ? gear_grades[gear_grade(tier)] : null
    // top は接続線の終端そのもの。CSS の translateY(-50%) がこの高さを
    // カードの中心にする（線はカードの左端の中心に着く）
    html += '<div class="ds-card' + (owned ? '' : ' none') +
      '" style="--i:' + index++ + ';top:' + figure_y_vh(card.y).toFixed(2) + 'vh' +
      (grade ? ';--c:' + grade.color : '') + '">' +
      (owned
        ? '<img src="' + gear_icons[slot][tier - 1] + '" alt="">'
        : '<div class="ds-card-empty"></div>') +
      '<div><div class="ds-card-slot">' + gear_slot_labels[slot] + '</div>' +
      '<div class="ds-card-name">' +
      (owned ? gear_name(slot, tier) : '未所持') + '</div></div></div>'
  }
  panel.innerHTML = html
}

function set_layer(el: Element, layer: string): void {
  el.classList.remove('active', 'dim', 'inactive')
  el.classList.add(layer)
}

function dispatch(key: string): void {
  const result = ds_reduce(state, key)
  const changed = result.state !== state
  state = result.state
  if (result.action === 'descend') { descend(); return }
  if (result.action === 'buy') { buy(); return }
  if (changed) {
    audio_play(audio_sfx_beep)
    apply()
  }
}

function on_key(event: KeyboardEvent): void {
  // Tab はブラウザ既定のフォーカス移動を止めるため。Enter/Space は、クリックで
  // ネイティブフォーカスが残った <button>（.ds-item）がキー入力でも独自に
  // 活性化し、dispatch() と二重に反応するのを止めるため（.ds-part は SVG の
  // <g> でネイティブな活性化を持たないが、同じ条件式にまとめても実害はない。
  // この画面は Tab を横取りして独自のフォーカスモデルを持つので、
  // ボタンのネイティブな活性化には関与させない）
  if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
  }
  dispatch(event.key)
}

// 強化ごとの音。docs/gameplay.md のとおりこの画面は無音なので、これが唯一
// 鳴る音になる。sound-effects.ts に instrument は増やさない。
// 値ではなく () => にするのは、audio_sfx_* が audio_init() 内の
// sonantxr_generate_sound コールバックで非同期に埋まる export let だから
// （source/audio.ts）。このテーブルを値のまま作ると生成前の undefined を
// 捉えたまま固定され、6 音とも一生鳴らなくなる
const upgrade_sfx: Record<meta_upgrade_id_t, () => AudioBuffer | undefined> = {
  lung: () => audio_sfx_exhale,
  tolerance: () => audio_sfx_hit,
  sniff: () => audio_sfx_terminal,
  leg: () => audio_sfx_swing,
  power: () => audio_sfx_shoot,
  spare: () => audio_sfx_lighter,
}

// 演出の長さ。いちばん長い肺（膨張 → 気管の光 → 数値 → 戻りながら口元の煙
// 3 粒）に合わせて一律にする。部位ごとに変えると、連続で買ったときのテンポが
// 項目によってばらつく。この値は design.md §④が定める Enter 後の busy ロック窓
// （0.9〜1.2s）に収める必要がある。肺の最後の 1 粒が消えるのが 1.19s なので、
// その上でロック窓の上限を採っている（段ごとの時刻は death-screen.css の
// #ds.up-lung .ds-o-lung のコメント）
const upgrade_duration = 1200

let upgrade_timer: ReturnType<typeof setTimeout> = 0

function buy(): void {
  const id = body_parts[state.focus].id
  // MAX の合図は静止（円弧が閉じてリングになり、中央にチェック）。ここで
  // 拒否演出まで出すと「ヤニが足りない」という誤った合図になる。
  // meta_buy() は MAX でもヤニ不足でも false を返すので返り値では区別できず、
  // 上限は呼ぶ前に見るしかない
  if (meta.levels[id] >= meta_max_level[id]) { return }
  if (!meta_buy(id)) {
    // ヤニ不足では音を鳴らさない。残高と必要ヤニが 1 回だけ赤く震える
    const detail = root!.querySelector<HTMLElement>('.ds-detail')!
    const yani = root!.querySelector<HTMLElement>('.ds-yani')!
    for (const el of [detail, yani]) {
      el.classList.remove('reject')
      void el.offsetWidth
      el.classList.add('reject')
    }
    return
  }
  audio_play(upgrade_sfx[id]())
  state = { ...state, busy: true }
  apply()
  // 演出用の class は部位名を持つ。CSS 側がどの器官を動かすかを選ぶ
  root!.classList.add('upgrading', 'up-' + id)
  // 背景の闇サイト端末が明滅し、右上のヤニ残高へ線が走る
  root!.classList.add('yani-spend')
  clearTimeout(upgrade_timer)
  upgrade_timer = setTimeout(() => {
    root!.classList.remove('upgrading', 'up-' + id, 'yani-spend')
    state = { ...state, busy: false }
    apply()
  }, upgrade_duration)
}

function descend(): void {
  audio_play(audio_sfx_door)
  document.removeEventListener('keydown', on_key)
  clearTimeout(entry_timer)
  clearTimeout(upgrade_timer)
  state = { ...state, busy: true }
  apply()
  // UI が模型へ収納 → 照明が落ちる → 光の裂け目が開く → 画面遷移
  root!.classList.add('exiting')
  setTimeout(() => {
    root!.classList.remove('exiting', 'entering')
    root!.style.display = 'none'
    canvas.style.opacity = '1'
    // 押しっぱなしのキーの後始末。input.ts のハンドラは死亡画面の裏でも生きて
    // いるので、押したまま地下へ戻ると keys に 1 が残り、次のランの 1 フレーム
    // 目から効いてしまう（死んだときのスペースを離していなければ、復活と同時に
    // 発砲する）。この画面が読まない Space / E も同じ keys に載る以上ここで
    // 落とす（boss-reward.ts / equip-screen.ts と同じく、画面が出口で戻す）
    keys[key_shoot] = 0
    keys[key_spare] = 0
    keys[key_swap] = 0
    keys[key_up] = 0
    keys[key_down] = 0
    keys[key_left] = 0
    keys[key_right] = 0
    on_descend_cb()
  }, 1000)
}
