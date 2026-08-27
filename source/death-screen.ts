import {
  audio_play, audio_sfx_beep, audio_sfx_exhale, audio_sfx_hit, audio_sfx_lighter,
  audio_sfx_shoot, audio_sfx_swing, audio_sfx_terminal,
} from './audio'
import {
  body_height, body_parts, body_stow_position, body_width, figure_view_box, organ_svg,
} from './body-figure'
import { canvas } from './dom'
import {
  death_message, ds_initial_state, ds_item_layer, ds_part_layer, ds_reduce,
} from './death-screen-model'
import type { ds_state_t, run_result_t } from './death-screen-model'
import { meta, meta_buy, meta_max_level, meta_upgrade_price } from './meta'
import type { meta_upgrade_id_t } from './meta'
import { terminal_cancel, terminal_clear, terminal_hide } from './terminal'
import { upgrade_rows } from './upgrade-rows'
import './death-screen.css'

import hero_url from '../m/ui/hero.webp'
import body_url from '../m/ui/body.webp'
import cig_url from '../m/ui/icon-cig.webp'

// 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。
// result = null は初回起動モード。
//
// この画面は DOM を 1 度だけ組み、以降はノードを作り直さない。作り直すと
// CSS アニメーションが破棄されて位相が 0 に戻り、段階開示の演出が成立しない
// （docs/superpowers/specs/2026-08-26-death-screen-redesign-design.md）。

let state: ds_state_t = ds_initial_state()
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
  state = ds_initial_state()
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
  document.addEventListener('keydown', on_key)
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
  for (let i = 0; i < body_parts.length; i++) {
    const part = body_parts[i]
    const row = row_of.get(part.id)!
    const stow = body_stow_position(part)
    wires += '<line class="ds-wire" data-part="' + part.id + '" style="--i:' + i +
      ';--c:' + row.color + '" x1="' + part.ax + '" y1="' + part.ay +
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
    '<div class="ds-yani">' +
    '<img class="ds-yani-icon" src="' + cig_url + '" alt="">' +
    '<span class="ds-yani-label">ヤニ</span>' +
    '<b class="ds-yani-value">0</b>' +
    '<div class="ds-yani-warn">警告: ストレージ利用不可。' +
    '強化はこのセッション限りで消える</div>' +
    '</div>' +
    '<div class="ds-menu">' +
    '<button class="ds-item" data-item="0">記録確認</button>' +
    '<button class="ds-item" data-item="1">装備確認</button>' +
    '</div>' +
    '<div class="ds-figure">' +
    '<svg class="ds-svg" viewBox="' + figure_view_box + '">' +
    '<g class="ds-wires">' + wires + '</g>' +
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
    '<div class="ds-hint">' +
    '<span>[Tab] 強化</span><span>[Enter] 決定</span>' +
    '<span>[Esc] 地下へ戻る</span></div>'

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
  return el
}

// 表示のたびに 1 度だけ書き込む、その回のあいだ変わらない値
function fill_static(): void {
  const dead = current !== null
  root!.classList.toggle('boot', !dead)
  text('.ds-title', dead ? death_message(current!.death_cause) : '自席の端末。')
  text('.ds-sub', dead
    ? '救護ドローンが君を回収して、自席へ戻した。'
    : '闇サイトに接続した。')
  root!.querySelector<HTMLElement>('.ds-yani-warn')!.style.display =
    meta.persistent ? 'none' : 'block'
}

function text(selector: string, value: string): void {
  root!.querySelector<HTMLElement>(selector)!.textContent = value
}

// 状態を DOM へ写す。ノードは作らず、class とテキストだけを触る
function apply(): void {
  const el = root!
  el.classList.toggle('mode-upgrade', state.mode === 'upgrade')
  el.classList.toggle('mode-idle', state.mode === 'idle')
  el.classList.toggle('panel-record', state.panel === 'record')
  el.classList.toggle('panel-gear', state.panel === 'gear')
  el.classList.toggle('panel-none', state.panel === 'none')
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

  el.querySelectorAll<HTMLElement>('.ds-item').forEach((item, index) => {
    set_layer(item, ds_item_layer(state, index))
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

// 演出の長さ。いちばん長い肺（膨張 → 気管の光 → 戻る → 口元の煙 3 粒）に
// 合わせて一律にする。部位ごとに変えると、連続で買ったときのテンポが項目に
// よってばらつく。この値は design.md §④が定める Enter 後の busy ロック窓
// （0.9〜1.2s）に収める必要がある。肺は膨張・戻り .65s（頂点は仕様どおり
// 0.35s）→ 煙 3 粒が --step（80ms）刻みで立ち、最後の 1 粒が 1.16s で
// 消えるので、そこに 40ms の余白を足した値
// （死亡画面レビュー Finding 3: 煙を足して 1.6s まで伸びていた尺が
// ロック窓を超えていたため、肺の膨張・戻りを圧縮して仕様の上限に収めた）
const upgrade_duration = 1200

let upgrade_timer: ReturnType<typeof setTimeout> = 0

function buy(): void {
  const id = body_parts[state.focus].id
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
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  clearTimeout(entry_timer)
  clearTimeout(upgrade_timer)
  root!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend_cb()
}
