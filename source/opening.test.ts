import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// OP のタイムライン（カット送り・字幕・スキップ・全音停止）を、jsdom を足さず
// 最小の document で配線ごと動かして固定する
const harness = vi.hoisted(() => {
  type listener_t = (ev: unknown) => void
  const motion = { reduced: false }
  const play_calls: string[] = []
  interface el_t {
    tag: string
    classes: Set<string>
    children: el_t[]
    className: string
    textContent: string
    innerHTML: string
    id: string
    muted: boolean
    playsInline: boolean
    preload: string
    src: string
    currentTime: number
    style: Record<string, string>
    classList: { add(n: string): void; remove(n: string): void; toggle(n: string, force: boolean): void }
    appendChild(c: el_t): void
    play(): Promise<void>
    pause(): void
  }
  const make_el = (tag: string): el_t => {
    const classes = new Set<string>()
    const children: el_t[] = []
    const el: el_t = {
      tag, classes, children, className: '', textContent: '',
      // opening.ts は innerHTML を字幕コンテナのクリア（= ''）にだけ使う。
      // 本物と同じく子を消さないと、カットを跨いだ字幕が積もったままになり
      // 「切り替わりで字幕が消える」ことを検証できない
      get innerHTML() { return '' },
      set innerHTML(_value: string) { children.length = 0 },
      id: '', muted: false, playsInline: false, preload: '', src: '', currentTime: 0,
      style: {},
      classList: {
        add: (n) => { classes.add(n) },
        remove: (n) => { classes.delete(n) },
        toggle: (n, force) => { if (force) { classes.add(n) } else { classes.delete(n) } },
      },
      appendChild: (c) => { el.children.push(c) },
      play: () => { play_calls.push(tag); return Promise.resolve() },
      pause: () => {},
    }
    return el
  }
  const created: el_t[] = []
  const listeners: Record<string, listener_t[]> = { click: [], keydown: [] }
  const doc = {
    body: { appendChild: () => {} },
    createElement: (tag: string) => { const el = make_el(tag); created.push(el); return el },
    addEventListener: (type: string, fn: listener_t) => { listeners[type]?.push(fn) },
    removeEventListener: (type: string, fn: listener_t) => {
      const arr = listeners[type]
      const i = arr ? arr.indexOf(fn) : -1
      if (arr && i >= 0) { arr.splice(i, 1) }
    },
  }
  ;(globalThis as Record<string, unknown>).document = doc
  ;(globalThis as Record<string, unknown>).matchMedia = () => ({ matches: motion.reduced })
  // opening.ts はポスターの先読みに new Image() を使う（#op が display:none の
  // 間は background-image が取得されないため）。Node に Image は無いので最小限を置く
  ;(globalThis as Record<string, unknown>).Image = class { src = '' }
  return { created, listeners, motion, play_calls }
})

const audio = vi.hoisted(() => {
  const plays: Array<{ rate: number; loop: boolean; stopped: boolean }> = []
  return { plays }
})

vi.mock('./audio', () => ({
  audio_play_op: (_b: unknown, rate: number, _gain?: number, loop = false) => {
    const rec = { rate, loop, stopped: false }
    audio.plays.push(rec)
    return () => { rec.stopped = true }
  },
  audio_sfx_beep: {},
  audio_sfx_exhale: {},
  audio_sfx_explode: {},
  audio_sfx_hit: {},
  audio_sfx_lighter: {},
}))

import { opening_preload, opening_show } from './opening'
import { op_black_lead, op_cut_at, op_total } from './opening-model'

const cuts = (): typeof harness.created =>
  harness.created.filter((el) => el.className === 'op-cut')
const subs = (): typeof harness.created[number] =>
  harness.created.find((el) => el.className === 'op-sub')!
const root_el = (): typeof harness.created[number] =>
  harness.created.find((el) => el.id === 'op')!
const on_cut = (): number[] =>
  cuts().flatMap((el, i) => (el.classes.has('on') ? [i] : []))

describe('OP のタイムライン', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    harness.play_calls.length = 0
    audio.plays.length = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('カット送り・字幕・黒 1 拍・全音停止・完了の順で進む', () => {
    let done = 0
    opening_show(() => { done++ })

    // 絶対時刻で進める。チェックポイントを増減しても後続のズレを手計算し
    // 直す必要がなく、途中に固定漏れが混じらない
    let now = 0
    const advance_to = (at: number): void => { vi.advanceTimersByTime(at - now); now = at }

    // カット 1 が点いて 1 行目の字幕が出る
    advance_to(0)
    expect(on_cut()).toEqual([0])
    expect(subs().children.length).toBe(1)
    expect(subs().children[0].textContent).toBe('西暦2718年。やつらは違法となった。')

    // カット 2: ドローンが半音上がる。前の 1 本を止めてから鳴らし直すので
    // 和音にならない（設計書のカット 2「ドローンが半音上がる」）
    advance_to(op_cut_at(1))
    const drones = audio.plays.filter((p) => p.loop)
    expect(drones.length).toBe(2)
    expect(drones[0].stopped).toBe(true)
    expect(drones[1].stopped).toBe(false)
    expect(drones[1].rate).toBeGreaterThan(drones[0].rate)

    // カット 4 の三連呼: 開始で 1 行、1667ms・3333ms で 1 行ずつ増える
    advance_to(op_cut_at(3) + 1667)
    expect(subs().children.length).toBe(2)
    advance_to(op_cut_at(3) + 3333)
    expect(subs().children.length).toBe(3)

    // 黒 1 拍: 全カット消灯 + それまでの音が全部止まる
    advance_to(op_cut_at(4) - op_black_lead)
    expect(on_cut()).toEqual([])
    expect(root_el().classes.has('op-black')).toBe(true)
    expect(audio.plays.length).toBeGreaterThan(0)
    expect(audio.plays.every((p) => p.stopped)).toBe(true)

    // カット 5: 高木の行（tk クラス）と動画再生
    advance_to(op_cut_at(4))
    expect(on_cut()).toEqual([4])
    expect(root_el().classes.has('op-black')).toBe(false)
    expect(subs().children[0].className).toBe('op-line tk')
    expect(harness.play_calls).toEqual(['video'])

    // 完走で on_done が 1 回だけ呼ばれ、以後タイマーが残っていない
    advance_to(op_total())
    expect(done).toBe(1)
    vi.advanceTimersByTime(60000)
    expect(done).toBe(1)
  })

  it('動画カット（5・6）にだけ op-video が付き Ken Burns の対象から外れる', () => {
    // op-video は opening_preload（DOM 構築時）に 1 度だけ付く。opening_show を
    // 呼ぶとタイマー・リスナーが張られたまま残り後続テストを汚すので、
    // ここでは DOM 構築だけを呼ぶ（preload は冪等 ― 既に組んであれば何もしない）
    opening_preload()
    const video_indices = new Set([4, 5])
    cuts().forEach((el, i) => {
      expect(el.classes.has('op-video')).toBe(video_indices.has(i))
    })
  })

  it('スキップは即 on_done を呼び、音を止め、二重発火しない', () => {
    let done = 0
    opening_show(() => { done++ })
    vi.advanceTimersByTime(5000)

    // クリックのスキップ
    for (const fn of [...harness.listeners.click]) { fn({}) }
    expect(done).toBe(1)
    expect(audio.plays.every((p) => p.stopped)).toBe(true)

    // 残タイマーが発火しても何も起きない
    vi.advanceTimersByTime(60000)
    expect(done).toBe(1)
    expect(harness.listeners.click.length).toBe(0)
    expect(harness.listeners.keydown.length).toBe(0)
  })

  it('M キーはスキップにならない（音声トグルに譲る）', () => {
    let done = 0
    opening_show(() => { done++ })
    for (const fn of [...harness.listeners.keydown]) { fn({ keyCode: 77 }) }
    expect(done).toBe(0)
    for (const fn of [...harness.listeners.keydown]) { fn({ keyCode: 32 }) }
    expect(done).toBe(1)
  })

  it('reduced-motion では動画を再生しない（ポスターのまま進む）', () => {
    harness.motion.reduced = true
    let done = 0
    opening_show(() => { done++ })
    vi.advanceTimersByTime(op_total())
    expect(harness.play_calls).toEqual([])
    expect(done).toBe(1)
    harness.motion.reduced = false
  })

  it('finish 後の再表示は前回の表示状態を持ち越さない', () => {
    opening_show(() => {})
    vi.advanceTimersByTime(op_cut_at(5)) // タイトル動画まで進める
    for (const fn of [...harness.listeners.click]) { fn({}) } // 途中でスキップ

    // スキップは pause するだけで再生位置は残る。実機で途中再生になる条件を作る
    const videos = harness.created.filter((el) => el.tag === 'video')
    for (const video of videos) { video.currentTime = 2.5 }

    opening_show(() => {})

    expect(on_cut()).toEqual([])
    expect(root_el().classes.has('op-black')).toBe(false)
    expect(subs().children.length).toBe(0)
    for (const video of videos) {
      expect(video.currentTime).toBe(0)
      expect(video.classes.has('playing')).toBe(false)
    }
  })
})
