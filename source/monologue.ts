import { death_cause_nicotine } from './death-screen-model'
import { death_line_delay } from './death-sequence-model'
import { bubble_el, canvas } from './dom'
import type { bubble_t } from './monologue-model'
import {
  bubble_active, bubble_advance, bubble_idle, bubble_start, bubble_visible_text,
  monologue_pick,
} from './monologue-model'
import { nicotine_stage_withdrawal } from './nicotine'
import { project } from './projection'
import { camera } from './renderer'
import { state } from './state'

// 高木の内心の声（docs/story.md「声の使い分け」）。事実と指示はターミナルが
// 担い、ここは目的・感情・切迫感だけを書く。世界の危機や陰謀をほのめかす
// 文言は書かないこと。

const lines_arrival = [
  'どこかに喫煙所があるはずだ……',
  '頼むぞ、この階にはあってくれよ……',
  '灰皿の匂いがする……気がする',
]
const lines_dummy = [
  'くそっ、灰皿が撤去されてやがる……',
  '跡地かよ……匂いだけ残しやがって……',
]
const lines_all_done = [
  'もうここには喫煙所はない……',
  '……この階はもう用済みだ',
]
const lines_complete = [
  '……最高の一服だぜ',
  'うまい……生き返るぜ……',
]
const lines_interrupt = [
  'げほっ……！',
  'ちっ、落ち着いて吸わせろ……！',
]
// 清掃ドローンの撃破。回収槽から吸い殻が出てきたことへの反応だけを書く
const lines_drone_kill = [
  'こんなに溜め込んでやがったのか……',
  '……全部いただくぜ',
  '返してもらうぞ、俺の分だ',
]
// ボス階の到達。世界の危機ではなく、灰皿の上に居座っている一点だけに反応する
const lines_boss_arrival = [
  'おい、灰皿の上に何か乗ってるぞ……',
  'でかいのが座り込んでやがる……',
  '……そこ、俺の席なんだが',
]
// ボスの撃破。世界の危機ではなく、席が空いたことだけに反応する。撃破の
// 瞬間のボスは座席を離れて周回している（座席に居るのはごく短い間だけ）ので、
// 「その場から追い払った」ではなく「もう邪魔が居ない」として言う
const lines_boss_kill = [
  'どけと言ったんだ',
  'ようやく座れる……',
  '灰皿の上に乗るんじゃねえ',
]
// 最期のひとこと。世界の危機ではなく、最期まで煙草のことしか考えていない
const lines_death_enemy = [
  'まだ……吸ってない……',
  '灰皿……どこだ……',
  'こんな……ところで……',
]
const lines_death_nicotine = [
  'いっぷく……いっぷくだけ……',
  'け……むり……',
  'ゆめに……みる……喫煙所……',
]
// 添字 = nicotine_stage_*（1 そわそわ / 2 離脱症状 / 3 限界）。0 は使わない
const lines_stage: string[][] = [
  [],
  ['そろそろ一服したいな……', '……口寂しくなってきた'],
  ['たばこ……たばこ……', '吸わせろ……吸わせろ……'],
  ['もう……限界だ……', 'た……ばこ……'],
]

// フロア到達はターミナルの深度ログと同時に出さない（読む場所が割れる）
const arrival_delay = 2
// ドローン撃破も同じ理由で遅らせる。事実（飛散した額）はターミナルが先に出す
const drone_kill_delay = 2
// ボス撃破も同じ理由で遅らせる。値はドローン撃破と同じ 2 秒だが、
// 灰皿撤去ユニット固有の理由ではないので drone_kill_delay とは別の定数に持つ
const boss_kill_delay = 2
// 離脱症状以降、何も表示していなければこの間隔で再つぶやきする
const whisper_interval = 10

let bubble: bubble_t = bubble_idle()
let last_line = ''
let stage_last = 0
let whisper_timer = 0

// アンビエント（段階のつぶやき）は表示中・予約中なら譲る。イベントは常に
// 上書きする。キューは持たない — 同フレームのイベント競合は呼び出し側の
// 分岐で解決している（entity-smoking-area の全回収分岐）。
// 戻り値は「実際に喋ったか」。譲ったかどうかで挙動を変えたい呼び出し側
// （monologue_boss_blocked）のために返す
function say(pool: string[], ambient: boolean, delay = 0): boolean {
  if (ambient && bubble_active(bubble)) { return false }
  const line = monologue_pick(pool, last_line, Math.random())
  last_line = line
  bubble = bubble_start(line, delay)
  return true
}

export function monologue_arrival(): void { say(lines_arrival, false, arrival_delay) }
// 死亡シーケンスの最期のひとこと。倒れた「間」を置いてから口にする
export function monologue_death(cause: number): void {
  say(
    cause === death_cause_nicotine ? lines_death_nicotine : lines_death_enemy,
    false, death_line_delay,
  )
}
export function monologue_dummy(): void { say(lines_dummy, false) }
export function monologue_all_done(): void { say(lines_all_done, false) }
export function monologue_complete(): void { say(lines_complete, false) }
export function monologue_interrupt(): void { say(lines_interrupt, false) }
export function monologue_drone_kill(): void {
  say(lines_drone_kill, false, drone_kill_delay)
}
export function monologue_boss_arrival(): void {
  say(lines_boss_arrival, false, arrival_delay)
}
// 事実（ユニットの停止）はターミナルが先に出す。読む場所が割れないよう遅らせる
export function monologue_boss_kill(): void {
  say(lines_boss_kill, false, boss_kill_delay)
}

// ボスの激昂。世界の危機ではなく、まだ席を明け渡さないことだけに反応する
const lines_boss_rage = [
  'まだどく気はねえのか……',
  'そんなに座りたいのかよ……',
  'うるせえ、俺の番だ',
]
// フェーズ移行も同じ理由で遅らせる。値はボス撃破と同じ 2 秒だが、
// 固有の理由ではないので別の定数に持つ
const boss_rage_delay = 2

export function monologue_boss_rage(): void {
  say(lines_boss_rage, false, boss_rage_delay)
}

// ボスが生きている間に灰皿へ触れたとき。ボスが灰皿を離れて動くように
// なったので、触れても無反応だと「なぜ吸えないのか」が画面のどこにも
// 出ない。事実ではなく高木の都合として言う（docs/story.md「声の使い分け」）
const lines_boss_blocked = [
  'あいつをどけねえと座れねえ',
  'まだ吸わせてもらえねえのか……',
  '先にあれを片付けるか……',
]
// 灰皿への接触は毎フレーム続くので、アンビエント扱い（表示中なら譲る）に
// これを重ねる。8 秒は、状況を忘れさせない頻度と、同じセリフの繰り返しが
// うるさく感じない頻度の両方に収まる間隔（whisper_interval と同じ流儀）
const boss_blocked_interval = 8

let boss_blocked_timer = 0

export function monologue_boss_blocked(): void {
  if (boss_blocked_timer > 0) { return }
  // 譲ったときはクールダウンを立てない。先に立てると、何も喋らないまま
  // 8 秒黙ることになる — ボス階に着いた直後は到達つぶやきが 2 秒遅延で
  // 予約済みなので、そのまま灰皿へ突っ込む導線がちょうどこれを踏む。
  // 「触れても理由が画面に出ない」を埋めるのが目的の機能なので、
  // 喋れたときだけ間隔を数える
  if (say(lines_boss_blocked, true)) { boss_blocked_timer = boss_blocked_interval }
}

// 段階遷移は悪化方向のみ発話する。改善方向（一服による回復）で黙るので、
// ラン開始（満タン）やフロア持ち越しでも誤発話しない。
export function monologue_notify_stage(stage: number): void {
  if (stage > stage_last) {
    whisper_timer = 0
    say(lines_stage[stage], true)
  }
  stage_last = stage
  if (stage >= nicotine_stage_withdrawal) {
    whisper_timer += state.time_elapsed
    if (whisper_timer >= whisper_interval) {
      whisper_timer = 0
      say(lines_stage[stage], true)
    }
  } else {
    whisper_timer = 0
  }
  bubble_el.classList.toggle('tr', stage >= nicotine_stage_withdrawal)
}

export function monologue_reset(): void {
  bubble = bubble_idle()
  boss_blocked_timer = 0
  bubble_el.style.opacity = '0'
  bubble_el.classList.remove('tr')
}

export function monologue_update(px: number, pz: number): void {
  if (boss_blocked_timer > 0) { boss_blocked_timer -= state.time_elapsed }
  bubble_advance(bubble, state.time_elapsed)
  const text = bubble_visible_text(bubble)
  // 位置はフェードアウト中も追従させる（止めると消えかけの吹き出しがその場に
  // 取り残され、フロア遷移では新しい階の無関係な位置で消えることになる）。
  // clientWidth の読みは style 書き込みより先に済ませる（同フレームの再レイアウト回避）
  const w = canvas.clientWidth
  // 自機頭上（中心 x+3、高さ 8）を投影して吹き出しの下端中央を合わせる
  const p = project(px + 3, 8, pz, camera.x, camera.y, camera.z, w, canvas.clientHeight)
  if (p) {
    // カメラの追従が p.x を幅の 44〜56% 付近に留めるため、今のところこの
    // clamp が実際に効くことはない。将来カメラやアスペクト比が変わった
    // ときの安全網として残す。箱の中心だけを clamp しており端は見ていない
    // ので、これ単独では横に長い行のクリッピングは防げない。
    const x = Math.max(w * 0.08, Math.min(w * 0.92, p.x))
    bubble_el.style.transform =
      'translate(' + x + 'px,' + (p.y - 2) + 'px) translate(-50%,-100%)'
  }
  // textContent は消さない（空にすると枠と尾だけの箱がフェードアウトして見える）
  if (text) { bubble_el.textContent = text }
  bubble_el.style.opacity = text && p ? '1' : '0'
}
