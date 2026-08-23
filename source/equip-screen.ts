import { audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_pickup } from './audio'
import {
  gear_grade, gear_grades, gear_name, gear_scrap_value, gear_stats,
} from './equipment'
import type { gear_slot_t } from './equipment'
import { meta, meta_save } from './meta'
import { camera } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'
import './equip-screen.css'

import blade_01 from '../m/ui/gear-blade-01.webp'
import blade_02 from '../m/ui/gear-blade-02.webp'
import blade_03 from '../m/ui/gear-blade-03.webp'
import blade_04 from '../m/ui/gear-blade-04.webp'
import blade_05 from '../m/ui/gear-blade-05.webp'
import blade_06 from '../m/ui/gear-blade-06.webp'
import blade_07 from '../m/ui/gear-blade-07.webp'
import blade_08 from '../m/ui/gear-blade-08.webp'
import blade_09 from '../m/ui/gear-blade-09.webp'
import blade_10 from '../m/ui/gear-blade-10.webp'
import patch_01 from '../m/ui/gear-patch-01.webp'
import patch_02 from '../m/ui/gear-patch-02.webp'
import patch_03 from '../m/ui/gear-patch-03.webp'
import patch_04 from '../m/ui/gear-patch-04.webp'
import patch_05 from '../m/ui/gear-patch-05.webp'
import patch_06 from '../m/ui/gear-patch-06.webp'
import patch_07 from '../m/ui/gear-patch-07.webp'
import patch_08 from '../m/ui/gear-patch-08.webp'
import patch_09 from '../m/ui/gear-patch-09.webp'
import patch_10 from '../m/ui/gear-patch-10.webp'
import sole_01 from '../m/ui/gear-sole-01.webp'
import sole_02 from '../m/ui/gear-sole-02.webp'
import sole_03 from '../m/ui/gear-sole-03.webp'
import sole_04 from '../m/ui/gear-sole-04.webp'
import sole_05 from '../m/ui/gear-sole-05.webp'
import sole_06 from '../m/ui/gear-sole-06.webp'
import sole_07 from '../m/ui/gear-sole-07.webp'
import sole_08 from '../m/ui/gear-sole-08.webp'
import sole_09 from '../m/ui/gear-sole-09.webp'
import sole_10 from '../m/ui/gear-sole-10.webp'

// 押収品コンテナの開封ダイアログ。数値と品名は equipment.ts が持ち、ここは
// DOM だけを持つ（death-screen-model.ts / death-screen.ts と同じ分け方）。
//
// 画像は静的 import しか使えない。'../m/ui/gear-' + id + '.webp' のような
// 文字列連結は Vite が静的に検出できず、本番ビルドで 404 になる
// （docs/architecture.md）。だから 30 行を並べてテーブルに詰める。

const gear_icons: Record<gear_slot_t, string[]> = {
  blade: [
    blade_01, blade_02, blade_03, blade_04, blade_05,
    blade_06, blade_07, blade_08, blade_09, blade_10,
  ],
  sole: [
    sole_01, sole_02, sole_03, sole_04, sole_05,
    sole_06, sole_07, sole_08, sole_09, sole_10,
  ],
  patch: [
    patch_01, patch_02, patch_03, patch_04, patch_05,
    patch_06, patch_07, patch_08, patch_09, patch_10,
  ],
}

const slot_labels: Record<gear_slot_t, string> = {
  blade: '刃物', sole: 'ソール', patch: 'パッチ',
}

// 等級ごとの解錠のため（秒）。ためている間は等級を伏せるので、
// ための長さそのものが等級のヒントになり、待たされている間に期待が育つ
const grade_delay = [0.4, 0.7, 1.0, 1.3, 1.6]

let root: HTMLElement | null = null
let slot: gear_slot_t = 'blade'
let tier = 1
let revealed = false
let selected = 0 // 0 = 手元に残す、1 = 転売する
let reveal_id: ReturnType<typeof setTimeout> = 0

export function equip_screen_show(next_slot: gear_slot_t, next_tier: number): void {
  slot = next_slot
  tier = next_tier
  revealed = false
  // 既定は「良いほうを残す」に置く。上位互換の全順序なので既定が常に正解に
  // なるが、下位を敢えて選ぶ余地は残す（転売額は段で決まるため意味は無いが、
  // 選べないことを説明するほうが複雑になる）
  selected = tier > meta.gear[next_slot] ? 0 : 1
  state.equipping = 1

  if (!root) {
    root = document.createElement('div')
    root.id = 'eq'
    document.body.appendChild(root)
  }
  render()
  root.style.display = 'grid'
  document.addEventListener('keydown', on_key)
  audio_play(audio_sfx_door) // 封印が外れる駆動音

  // ゲームが止まっている間の演出なので、setTimeout で構わない。一服の時間割が
  // フレーム駆動なのは、ラン進行（game_running / dying）と競合しうるため
  // （docs/gameplay.md「一服」）で、ここには競合する相手がいない
  reveal_id = setTimeout(reveal, grade_delay[gear_grade(tier)] * 1000)
}

function reveal(): void {
  revealed = true
  audio_play(audio_sfx_pickup)
  // 銘品だけカメラシェイクを足す。序列は 蜘蛛 1 < セントリー 3 < 銘品 4 <
  // 自機の死 5 < 清掃ドローン 6 で、docs/enemies.md の 1 本の尺度に載せる
  if (gear_grade(tier) === 4) { camera.shake = 4 }
  render()
}

function close(keep: boolean): void {
  clearTimeout(reveal_id)
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'

  // 手元に残さなかったほうがヤニに化ける。どちらを選んでも手ぶらにならないので、
  // 開封に「無駄だった」という結果が存在しない
  const scrapped = keep ? meta.gear[slot] : tier
  // 「初めて刃物を持った」に専用の保存フラグは持たせない。meta.gear.blade は
  // 一度上がると 0 に戻らないので、上書き前の旧値（keep 時の scrapped と同じ値）
  // が 0 だったことだけで「初回」が成立する
  const first_blade = keep && slot === 'blade' && scrapped === 0
  if (keep) {
    meta.gear[slot] = tier
    meta_save()
  }
  // ヤニは state.yani_run に積む。meta.yani への合算は run_end() が行う
  if (scrapped > 0) { state.yani_run += gear_scrap_value(scrapped) }

  audio_play(audio_sfx_beep)
  state.equipping = 0

  // 操作の指示はターミナルが担い、吹き出しは高木の感情専用（docs/story.md
  // 「声の使い分け」）。ポーズが解けた後に出すことで、表示チェーンが通常の
  // 実行状態で走る
  if (first_blade) {
    terminal_show_notice('刃物の携行を検知___[Tab] で銃と持ち替え')
  }
}

function on_key(event: KeyboardEvent): void {
  if (!revealed) { return } // ため中は入力を受けない（早送りさせない）
  const k = event.key
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    selected = selected ? 0 : 1
    render()
  } else if (k === 'Enter') {
    close(selected === 0)
  } else if (k === 'Escape') {
    close(false)
  }
}

function render(): void {
  const grade = gear_grade(tier)
  const color = revealed ? gear_grades[grade].color : '#8a8a8a'
  const owned = meta.gear[slot]

  let html = '<div class="eq-box" style="border-color:' + color +
    ';box-shadow:0 0 2vw ' + color + '44">' +
    '<div class="eq-head">押収品コンテナ</div>'

  if (!revealed) {
    root!.innerHTML = html + '<div class="eq-wait">解錠中<b>...</b></div></div>'
    return
  }

  html += '<div class="eq-grade" style="color:' + color + '">' +
      gear_grades[grade].name + '</div>' +
    '<div class="eq-item">' +
      '<img src="' + gear_icons[slot][tier - 1] +
        '" alt="" style="filter:drop-shadow(0 0 0.8vw ' + color + ')">' +
      '<div class="eq-name" style="color:' + color + '">' +
        gear_name(slot, tier) + '</div>' +
      '<div class="eq-slot">' + slot_labels[slot] + '</div>' +
    '</div>' +
    '<div class="eq-stats">'

  const next = gear_stats(slot, tier)
  const prev = owned > 0 ? gear_stats(slot, owned) : null
  for (let i = 0; i < next.length; i++) {
    const n = next[i]
    const p = prev ? prev[i] : null
    const cls = !p ? '' : n.rank > p.rank ? 'up' : n.rank < p.rank ? 'down' : ''
    html += '<div class="eq-stat"><span>' + n.label + '</span>' +
      '<i>' + (p ? p.text : '') + '</i>' +
      '<em>' + (p ? '→' : '') + '</em>' +
      '<b class="' + cls + '">' + n.text + '</b></div>'
  }

  html += '</div><div class="eq-choices">' +
      '<div class="eq-choice' + (selected === 0 ? ' on' : '') + '">' +
        '<b>' + (owned > 0 ? '入れ替える' : '装備する') + '</b>' +
        '<i>' + (owned > 0 ? '旧品 → ヤニ ' + gear_scrap_value(owned) : '') + '</i>' +
      '</div>' +
      '<div class="eq-choice' + (selected === 1 ? ' on' : '') + '">' +
        '<b>転売する</b><i>ヤニ ' + gear_scrap_value(tier) + '</i>' +
      '</div>' +
    '</div>' +
    '<div class="eq-keys">[←→] 選ぶ　[Enter] 決定</div>' +
    '</div>'

  root!.innerHTML = html
}
