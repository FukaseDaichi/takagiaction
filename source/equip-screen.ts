import { audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_pickup } from './audio'
import {
  gear_grade, gear_grades, gear_name, gear_recommend_keep, gear_scrap_value,
  gear_slot_labels, gear_stats, gear_verdict,
} from './equipment'
import type { gear_slot_t, gear_verdict_t } from './equipment'
import { key_spare, key_swap, keys } from './input'
import { meta, meta_save } from './meta'
import { camera } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'
import './equip-screen.css'
import { gear_icons } from './gear-icons'

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
  // 違う段では損得が生じる。それでも選べないことを説明するほうが複雑になる）
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

// 等級ごとの光の強さ。並品はほぼ光らず、銘品は派手に光る。枠の外光・品名の
// 燐光・★の輝きをこの 1 本の尺度（--gb）から作るので、等級が上がったときに
// 強くなるのは光り方だけで、色の意味は増えない
const grade_glow = [
  { blur: 1.0, alpha: '22' },
  { blur: 1.6, alpha: '33' },
  { blur: 2.2, alpha: '44' },
  { blur: 2.8, alpha: '55' },
  { blur: 3.6, alpha: '77' },
]

// 等級の★。10 段を 2 段ずつ丸めた 5 等級（gear_grade）をそのまま 5 つの星に
// 写す。等級名（並品〜銘品）は覚えないと大小が分からないが、星は数で分かる。
// 開封の二拍目として左から順に点灯するので、遅延だけを要素ごとに置く
function stars_html(grade: number, flash: string): string {
  let cells = ''
  for (let i = 0; i < gear_grades.length; i++) {
    cells += '<span class="' + (i <= grade ? 'on' : '') +
      '" style="animation-delay:' + (0.2 + i * 0.08).toFixed(2) + 's">★</span>'
  }
  return '<div class="eq-stars' + flash + '">' + cells + '</div>'
}

// 入れ替える側の添え書き。額ではなく、決めたあとに能力がどう動くかを言う。
// 以前は両カードに「装備 段X　ヤニ +N」を並べていたが、同じ「ヤニ +N」が
// 入れ替え側では旧品・転売側では新品の額を指していて、同じ札が別のものを
// 数えていた。額は転売する側の 1 枚に寄せ、こちらは向きだけを持つ。
// クラスは判定語をそのまま流し、色（緑・赤・同格の本文色）は CSS が判定行と
// 同じ規則で置く
const ability_notes: Record<gear_verdict_t, string> = {
  new: '能力UP', up: '能力UP', same: '能力そのまま', down: '能力DOWN',
}

// カードの上辺に貼る札。既定のカーソル位置（.on の橙）と重なることが多いので、
// 「どちらが得か」と「いまどちらを指しているか」が混ざらないよう見せ方を分ける
// — カーソルは枠と地、札は上辺
const tag_rec = '<span class="eq-rec">推奨</span>'

function choice_html(index: number, verb: string, note: string, tag: string): string {
  return '<div class="eq-choice' + (selected === index ? ' on' : '') + '">' +
    tag + '<b>' + verb + '</b>' + note + '</div>'
}

function render(): void {
  const grade = gear_grade(tier)
  const color = revealed ? gear_grades[grade].color : '#8a8a8a'
  // 光の強さは等級色と一緒に --gc / --gb で流す。CSS 側（★・品名・開封の
  // フラッシュ）が同じ 2 つを読むので、等級ごとの分岐が CSS に散らない
  const glow = grade_glow[revealed ? grade : 0]
  const owned = meta.gear[slot]
  // 三幕目の最初の描画だけ演出クラスを付ける。新しく作られた要素でも
  // アニメーションは走る（トランジションと違って開始値を必要としない）ので、
  // このクラスの有無だけで「開封の瞬間だけ演出する」を実現できる
  const flash = just_revealed ? ' just-revealed' : ''
  just_revealed = false

  let html = '<div class="eq-box' + flash + '" style="--gc:' + color +
    ';--gb:' + glow.blur + 'vw;border-color:' + color +
    ';box-shadow:0 0 ' + glow.blur + 'vw ' + color + glow.alpha + '">' +
    '<div class="eq-head">押収品コンテナ</div>'

  if (!revealed) {
    root!.innerHTML = html + '<div class="eq-wait">解錠中<b>...</b></div></div>'
    return
  }

  const verdict = gear_verdict(owned, tier)
  const keep_recommended = gear_recommend_keep(verdict)

  html += '<div class="eq-grade">' + gear_grades[grade].name + '</div>' +
    stars_html(grade, flash) +
    '<div class="eq-item' + flash + '">' +
      // 放射光は芯（細く濃く）と暈（太く薄く）の 2 枚重ね。1 枚だと等級を
      // 上げてもぼやけるだけで、強くなった感じにならない
      '<img src="' + gear_icons[slot][tier - 1] +
        '" alt="" style="filter:drop-shadow(0 0 ' + (glow.blur * 0.25).toFixed(2) +
        'vw ' + color + ') drop-shadow(0 0 ' + (glow.blur * 0.55).toFixed(2) +
        'vw ' + color + glow.alpha + ')">' +
      '<div class="eq-name">' + gear_name(slot, tier) + '</div>' +
      '<div class="eq-slot">' + gear_slot_labels[slot] + '</div>' +
    '</div>' +
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

  html += '</div><div class="eq-choices">' +
      choice_html(0, owned > 0 ? '入れ替える' : '装備する',
        '<i class="' + verdict + '">' + ability_notes[verdict] + '</i>',
        keep_recommended ? tag_rec : '') +
      choice_html(1, '転売する', '<i>ヤニ +' + gear_scrap_value(tier) + '</i>',
        keep_recommended ? '' : tag_rec) +
    '</div>' +
    '<div class="eq-keys">[←→] 選ぶ　[Enter] 決定</div>' +
    '</div>'

  root!.innerHTML = html
}
