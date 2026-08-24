import { audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_pickup } from './audio'
import {
  gear_grade, gear_grades, gear_max_tier, gear_name, gear_recommend_keep,
  gear_scrap_value, gear_slot_labels, gear_stats, gear_verdict, gear_verdict_labels,
} from './equipment'
import type { gear_slot_t, gear_verdict_t } from './equipment'
import { key_spare, key_swap, keys } from './input'
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

// 等級ごとの解錠のため（秒）。ためている間は等級を伏せるので、
// ための長さそのものが等級のヒントになり、待たされている間に期待が育つ
const grade_delay = [0.4, 0.7, 1.0, 1.3, 1.6]

let root: HTMLElement | null = null
let slot: gear_slot_t = 'blade'
let tier = 1
let revealed = false
// 三幕目（開封）の最初の描画かどうか。枠のフラッシュとポップインは開封の
// 瞬間だけの演出なので、←→ による再描画（on_key）ではこのフラグを立てない
let just_revealed = false
let selected = 0 // 0 = 手元に残す、1 = 転売する
let reveal_id: ReturnType<typeof setTimeout> = 0

export function equip_screen_show(next_slot: gear_slot_t, next_tier: number): void {
  slot = next_slot
  tier = next_tier
  revealed = false
  just_revealed = false
  // 既定のカーソルは推奨に置く。上位互換の全順序なので推奨は常に正解になるが、
  // 下位を敢えて選ぶ余地は残す（同じ段への入れ替えなら転売額は変わらないが、
  // 違う段では損得が生じる。それでも選べないことを説明するほうが複雑になる）。
  // 推奨のない同格（gear_recommend_keep が null）は転売に置く — どちらを選んでも
  // 装備も転売額も一致するので、置き場所そのものに損得がない
  selected = gear_recommend_keep(gear_verdict(meta.gear[next_slot], tier)) ? 0 : 1
  state.paused = 1

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
  just_revealed = true
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
  state.paused = 0
  // ポーズ中も input.ts のハンドラは生きているが _update() は飛ぶので、
  // エッジ検出のフラグ（E・Tab）だけが取り残される。ここで戻さないと、
  // ポーズ中に押した E/Tab がダイアログを閉じた直後の 1 フレームで消費される
  keys[key_spare] = 0
  keys[key_swap] = 0

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

// 段メーター。両方が持つ段（min）までを地の色で塗り、そこから上の差分だけを
// 判定色で塗る。塗り分けの境目が現在の装備の位置そのものになるので、目盛りを
// 別に描かなくても「どこから先が増えるのか／足りないのか」が 1 目盛りで読める。
// 差分セルは currentColor で、色は .eq-verdict が判定ごとに 1 回だけ置く
function ladder_html(owned: number): string {
  const base = Math.min(owned, tier)
  const top = Math.max(owned, tier)
  let cells = ''
  for (let i = 1; i <= gear_max_tier; i++) {
    cells += '<span class="' + (i <= base ? 'b' : i <= top ? 'd' : '') + '"></span>'
  }
  return '<div class="eq-ladder">' + cells + '</div>'
}

// 判定。等級（レア度＝転売額）とは別の軸なので、等級色ではなく差分行と同じ
// 固定の緑と赤で出す。段が全順序なので、この 1 行が差分行の結論そのものになる
function verdict_html(verdict: gear_verdict_t, owned: number, flash: string): string {
  return '<div class="eq-verdict ' + verdict + flash + '">' +
    '<b>' + gear_verdict_labels[verdict] + '</b>' +
    ladder_html(owned) +
    '<i>段 ' + (owned > 0 ? owned + ' → ' : '') + tier + '</i>' +
    '</div>'
}

// 選択肢の添え書き。決めたあとの結末を 2 つ並べる — 何を装備していて、ヤニが
// いくら増えるか。両方のカードを同じ形にすることで、見比べる先が揃う。
//
// 装備の段を額より先に置く。格下では「入れ替える」のほうがヤニは多くなる
// （高い旧品のほうが化けるため。段 8 → 3 なら 320 対 45）ので、額だけを出すと
// 推奨が逆に見える。gear_scrap_value(0) は 0 なので、未所持も同じ式で通る
function choice_note(equipped: number, yani: number): string {
  return '装備 ' + (equipped > 0 ? '段' + equipped : 'なし') + '　ヤニ +' + yani
}

// カードの上辺に貼る札。既定のカーソル位置（.on の橙）と重なることが多いので、
// 「どちらが得か」と「いまどちらを指しているか」が混ざらないよう見せ方を分ける
// — カーソルは枠と地、札は上辺
const tag_rec = '<span class="eq-rec">推奨</span>'
// 同格はどちらのカードにも同じ札を出す。推奨が無いことは、札が無いことでは
// 伝わらない。緑にしないのは、どちらでも同じことが良くも悪くもないから
const tag_even = '<span class="eq-rec even">どちらでも</span>'

function choice_html(index: number, verb: string, note: string, tag: string): string {
  return '<div class="eq-choice' + (selected === index ? ' on' : '') + '">' +
    tag + '<b>' + verb + '</b><i>' + note + '</i></div>'
}

function render(): void {
  const grade = gear_grade(tier)
  const color = revealed ? gear_grades[grade].color : '#8a8a8a'
  const owned = meta.gear[slot]
  // 三幕目の最初の描画だけ演出クラスを付ける。新しく作られた要素でも
  // アニメーションは走る（トランジションと違って開始値を必要としない）ので、
  // このクラスの有無だけで「開封の瞬間だけ演出する」を実現できる
  const flash = just_revealed ? ' just-revealed' : ''
  just_revealed = false

  let html = '<div class="eq-box' + flash + '" style="border-color:' + color +
    ';box-shadow:0 0 2vw ' + color + '44">' +
    '<div class="eq-head">押収品コンテナ</div>'

  if (!revealed) {
    root!.innerHTML = html + '<div class="eq-wait">解錠中<b>...</b></div></div>'
    return
  }

  const verdict = gear_verdict(owned, tier)
  const keep_recommended = gear_recommend_keep(verdict)

  html += '<div class="eq-grade" style="color:' + color + '">' +
      gear_grades[grade].name + '</div>' +
    '<div class="eq-item' + flash + '">' +
      '<img src="' + gear_icons[slot][tier - 1] +
        '" alt="" style="filter:drop-shadow(0 0 0.8vw ' + color + ')">' +
      '<div class="eq-name" style="color:' + color + '">' +
        gear_name(slot, tier) + '</div>' +
      '<div class="eq-slot">' + gear_slot_labels[slot] + '</div>' +
    '</div>' +
    verdict_html(verdict, owned, flash) +
    '<div class="eq-stats">' +
      // 見出し行。2 つの値の列がどちらの装備のものか、以前は矢印の向きから
      // 推し量るしかなかった
      '<div class="eq-stat eq-cols"><span></span>' +
        '<i>' + (owned > 0 ? '現在' : '') + '</i><em></em><b>この品</b></div>'

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

  const even = keep_recommended === null // 同格。どちらを選んでも結末が一致する
  html += '</div><div class="eq-choices">' +
      choice_html(0, owned > 0 ? '入れ替える' : '装備する',
        choice_note(tier, gear_scrap_value(owned)),
        even ? tag_even : keep_recommended ? tag_rec : '') +
      choice_html(1, '転売する', choice_note(owned, gear_scrap_value(tier)),
        even ? tag_even : keep_recommended ? '' : tag_rec) +
    '</div>' +
    '<div class="eq-keys">[←→] 選ぶ　[Enter] 決定</div>' +
    '</div>'

  root!.innerHTML = html
}
