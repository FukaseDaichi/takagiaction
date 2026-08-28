import {
  audio_play_op, audio_sfx_beep, audio_sfx_exhale, audio_sfx_explode, audio_sfx_hit,
  audio_sfx_lighter,
} from './audio'
import {
  op_black_lead, op_cut_at, op_cuts, op_line_at, op_sting_delay, op_total,
} from './opening-model'
import './opening.css'

import op1_url from '../m/op1.webp'
import op2_url from '../m/op2.webp'
import op3_url from '../m/op3.webp'
import op4_url from '../m/op4.webp'
import op5_poster_url from '../m/op5.webp'
import op5_video_url from '../m/op5.mp4'
import title_poster_url from '../m/title.webp'
import title_video_url from '../m/title.mp4'

// OP（予告編話法の 5 カット + タイトルドロップ）。進行表は opening-model.ts、
// スクリプトの正本は docs/story.md「オープニング」。
//
// DOM は 1 度だけ組む（docs/architecture.md「全画面 DOM UI の作り方」）。
// スキップ・完走・全音停止は opening_finish() / stop_sounds() に集約し、
// タイマーと再生中の音は必ずここのリストを通す ― 直接 setTimeout /
// audio_play_op を呼ぶと、スキップで止まらない演出が残る

const posters = [op1_url, op2_url, op3_url, op4_url, op5_poster_url, title_poster_url]
const video_urls: Record<number, string> = { 4: op5_video_url, 5: title_video_url }

let root: HTMLDivElement | null = null
let cut_els: HTMLElement[] = []
let sub_el: HTMLElement | null = null
const video_els: Record<number, HTMLVideoElement> = {}
let timers: Array<ReturnType<typeof setTimeout>> = []
let stops: Array<() => void> = []
let on_done_cb = (): void => {}
let running = false

function reduced_motion(): boolean {
  return typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 起動画面（クリック待ち）のあいだに呼び、DOM 構築と画像・動画の先読みを
// 済ませる。クリック後の OP 開始を待ちゼロにするため（設計書「技術制約」）
export function opening_preload(): void {
  if (root) { return }
  root = document.createElement('div')
  root.id = 'op'
  for (let i = 0; i < op_cuts.length; i++) {
    const cut = document.createElement('div')
    cut.className = 'op-cut'
    // background-image は静止画カットの絵そのもの兼、動画カットのポスター
    //（reduced-motion と再生失敗のフォールバック）
    cut.style.backgroundImage = 'url(' + posters[i] + ')'
    if (i in video_urls) {
      const video = document.createElement('video')
      // muted は属性でなくプロパティで立てる（自動再生判定に効く）
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.src = video_urls[i]
      cut.appendChild(video)
      video_els[i] = video
    }
    root.appendChild(cut)
    cut_els.push(cut)
  }
  sub_el = document.createElement('div')
  sub_el.className = 'op-sub'
  root.appendChild(sub_el)
  const skip = document.createElement('div')
  skip.className = 'op-skip'
  skip.textContent = 'クリックでスキップ'
  root.appendChild(skip)
  document.body.appendChild(root)
}

function sched(fn: () => void, at: number): void {
  timers.push(setTimeout(fn, at))
}

// index = -1 で全消灯（カット 5 直前の黒 1 拍）。カットの切り替わりで字幕は消す
function show_cut(index: number): void {
  // 黒 1 拍だけはクロスフェードせず即座に落とす（opening.css の #op.op-black）
  root!.classList.toggle('op-black', index === -1)
  sub_el!.innerHTML = ''
  for (let i = 0; i < cut_els.length; i++) {
    cut_els[i].classList.toggle('on', i === index)
  }
  const video = video_els[index]
  if (video && !reduced_motion()) {
    // 再生できなければ .playing が付かず、ポスター（レイヤーの背景画像）の
    // まま進む。動画はループしない ― 終端に着いたらそのフレームで止まる
    video.play().then(() => { video.classList.add('playing') }).catch(() => {})
  }
}

function add_line(text: string, takagi: boolean): void {
  const line = document.createElement('div')
  line.className = takagi ? 'op-line tk' : 'op-line'
  line.textContent = text
  sub_el!.appendChild(line)
}

// カット 1 で始まる低いドローン。カット 2 で半音上げて緊張を一段上げる
//（設計書のカット 2「ドローンが半音上がる」）。同時に 2 本鳴らすと和音に
// なるので、上げるときは前の 1 本を止めてから鳴らし直す。
// 半音 = 2^(1/12) 倍
const op_drone_rate = 0.25
const op_drone_rate_up = 0.2648
let drone_stop = (): void => {}

function drone_set(rate: number): void {
  drone_stop()
  drone_stop = audio_play_op(audio_sfx_exhale, rate, 0.4, true)
}

// OP の音の予定表。新しい instrument は作らず既存 sfx のレート変更で賄う。
// buffer を () => で遅延参照するのは death-screen.ts の upgrade_sfx と同じ理由
//（audio_sfx_* は export let で、値で捉えると生成前の undefined に固定される）
type op_sound_t = {
  at: number
  sfx: () => AudioBuffer | undefined
  rate: number
  gain: number
}

function op_sounds(): op_sound_t[] {
  const boom = (): AudioBuffer | undefined => audio_sfx_explode
  const list: op_sound_t[] = [
    // カット 1: ブーム一発（ドローンは drone_set が別枠で持つ）
    { at: op_cut_at(0), sfx: boom, rate: 0.4, gain: 0.8 },
    // カット 2: ブーム二発目
    { at: op_cut_at(1), sfx: boom, rate: 0.36, gain: 0.85 },
  ]
  // カット 3: 鼓動のようなパルス
  for (let p = 0; p < 5; p++) {
    list.push({ at: op_cut_at(2) + p * 900, sfx: () => audio_sfx_hit, rate: 0.5, gain: 0.5 })
  }
  // カット 4: 三連呼の頭ごとにブームを強くする
  const cut4 = op_cuts[3]
  for (let line = 0; line < cut4.lines.length; line++) {
    list.push({
      at: op_cut_at(3) + op_line_at(cut4, line),
      sfx: boom, rate: 0.34 - line * 0.02, gain: 0.8 + line * 0.1,
    })
  }
  // カット 5: 静寂のなかの安っぽい点灯音
  list.push({ at: op_cut_at(4), sfx: () => audio_sfx_beep, rate: 0.7, gain: 0.6 })
  // カット 6: ロゴ着地のスティング（ブーム + ライター）
  list.push({ at: op_cut_at(5) + op_sting_delay, sfx: boom, rate: 0.22, gain: 1 })
  list.push({ at: op_cut_at(5) + op_sting_delay, sfx: () => audio_sfx_lighter, rate: 1, gain: 0.8 })
  return list
}

function stop_sounds(): void {
  drone_stop()
  drone_stop = () => {}
  for (const stop of stops) { stop() }
  stops = []
}

export function opening_show(on_done: () => void): void {
  opening_preload()
  on_done_cb = on_done
  running = true
  root!.style.display = 'block'
  // この関数はゲーム開始クリックのハンドラ内から呼ばれるが、dispatch 中の
  // ノードへ addEventListener した listener はその event では呼ばれない（DOM の
  // 仕様でリスナー一覧は dispatch 開始時に複製される）ので、開始クリック自身が
  // スキップに化けることはない
  document.addEventListener('click', opening_skip)
  document.addEventListener('keydown', on_key)

  for (let i = 0; i < op_cuts.length; i++) {
    const cut = op_cuts[i]
    const at = op_cut_at(i)
    if (i === 4) {
      // 黒 1 拍: 全消灯 + 全音停止。点灯（show_cut(4)）は黒のあと
      sched(() => {
        show_cut(-1)
        stop_sounds()
      }, at - op_black_lead)
    }
    sched(() => { show_cut(i) }, at)
    for (let line = 0; line < cut.lines.length; line++) {
      const text = cut.lines[line]
      const takagi = !!cut.takagi
      sched(() => { add_line(text, takagi) }, at + op_line_at(cut, line))
    }
  }
  for (const sound of op_sounds()) {
    sched(() => {
      stops.push(audio_play_op(sound.sfx(), sound.rate, sound.gain))
    }, sound.at)
  }
  // ドローンは 1 本を鳴らし替える形で持つので、汎用の予定表とは別に予約する
  sched(() => { drone_set(op_drone_rate) }, op_cut_at(0))
  sched(() => { drone_set(op_drone_rate_up) }, op_cut_at(1))
  sched(opening_finish, op_total())
}

function on_key(ev: KeyboardEvent): void {
  if (ev.keyCode === 77) { return } // M は音声トグル（input.ts）に譲る
  opening_finish()
}

function opening_skip(): void {
  opening_finish()
}

function opening_finish(): void {
  if (!running) { return }
  running = false
  document.removeEventListener('click', opening_skip)
  document.removeEventListener('keydown', on_key)
  for (const timer of timers) { clearTimeout(timer) }
  timers = []
  stop_sounds()
  for (const index in video_els) { video_els[index].pause() }
  root!.style.display = 'none'
  on_done_cb()
}
