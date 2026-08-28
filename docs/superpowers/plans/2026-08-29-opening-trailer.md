# OP 予告編化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初回アクセスの OP を、予告編話法の 5 カット + タイトルドロップ（約 26.6 秒・常時スキップ可・クリック先行で全編音付き）に置き換える。

**Architecture:** 新設 `opening-model.ts`（進行表の純ロジック）+ `opening.ts`/`opening.css`（DOM とタイムライン制御）。main.ts をクリック先行に再構成し、terminal.ts のログ式イントロは削除する。動画 2 本は 1 回再生して終端 pause。スキップと全音停止は単一の `opening_finish()` / `stop_sounds()` に集約する。

**Tech Stack:** TypeScript + Vite、Vitest（jsdom なし・最小 document モック）、Web Audio（既存 sfx のレート変更流用）、HTML5 video。

**Spec:** `docs/superpowers/specs/2026-08-28-opening-design.md`（スクリプト正本は `docs/story.md`「オープニング」）

## Global Constraints

- 画面の文言は日本語。ただし固有名詞（`UNDERRUN` / `DOMINIC SZABLEWSKI // PHOBOSLAB.ORG` / `ANDREAS LÖSCH // NO-FATE.NET` / `TAKAGI ACTION`）は日本語化しない（docs/story.md）
- 後方互換を維持しない。置き換えた実装（ログ式イントロ）は同じ作業内で削除する
- 現在の要件を満たす最もシンプルな実装を選ぶ。新しい sonantx instrument は作らない
- OP の音・動画の再生開始はすべて最初のクリック後（自動再生ポリシー）
- 動画はループさせない（実測でループ継ぎ目が目視できるため）。1 回再生し終端で pause
- テストは既存規約に従う: 葉ロジックは素の Vitest、DOM 依存は `vi.hoisted` の最小 document + `vi.mock`（jsdom を追加しない）
- 各タスクの最後に `npm run typecheck` と `npm test` を通してからコミットする
- docs/ の更新は対応する実装と同じコミット群で行う

## 検証コマンド

```bash
npm run typecheck
npm test
npx vitest run source/opening-model.test.ts   # 対象を絞る場合
```

---

### Task 1: opening-model.ts（進行表の純ロジック）

**Files:**
- Create: `source/opening-model.ts`
- Test: `source/opening-model.test.ts`

**Interfaces:**
- Produces: `op_cut_t`, `op_cuts: op_cut_t[]`, `op_black_lead: number`, `op_sting_delay: number`, `op_line_at(cut, index): number`, `op_cut_at(index): number`, `op_total(): number`（Task 3 の opening.ts が使う）

- [ ] **Step 1: Write the failing test**

`source/opening-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  op_black_lead, op_cut_at, op_cuts, op_line_at, op_total,
} from './opening-model'

describe('OP の進行表', () => {
  it('スクリプトは docs/story.md の 5 枚 + タイトルドロップ', () => {
    expect(op_cuts.map((cut) => cut.lines)).toEqual([
      ['西暦2718年。やつらは違法となった。'],
      ['地上から、すべてのやつらが消えた。'],
      ['しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。'],
      ['失われた人類の遺産。', '禁じられた聖域。', '最後の安息の地。'],
      ['喫煙所だ。'],
      [],
    ])
    // 「喫煙所だ。」だけが高木の声。動画はカット 5・6（0 始まりで 4・5）
    expect(op_cuts.map((cut) => !!cut.takagi)).toEqual(
      [false, false, false, false, true, false])
    expect(op_cuts.map((cut) => !!cut.video)).toEqual(
      [false, false, false, false, true, true])
  })

  it('カットの開始時刻はカット 5 の黒 1 拍を含んで累積する', () => {
    expect(op_cut_at(0)).toBe(0)
    expect(op_cut_at(1)).toBe(4000)
    expect(op_cut_at(2)).toBe(8000)
    expect(op_cut_at(3)).toBe(13000)
    // カット 5 の頭に黒 1 拍（全音停止）が挟まる
    expect(op_cut_at(4)).toBe(18000 + op_black_lead)
    expect(op_cut_at(5)).toBe(22000 + op_black_lead)
    // 尺は仕様の約 26 秒（= 26000 + 黒 1 拍）
    expect(op_total()).toBe(26000 + op_black_lead)
  })

  it('三連呼はカットの尺を行数で等分した刻みで出る', () => {
    const cut4 = op_cuts[3]
    expect(op_line_at(cut4, 0)).toBe(0)
    expect(op_line_at(cut4, 1)).toBe(1667)
    expect(op_line_at(cut4, 2)).toBe(3333)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run source/opening-model.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: Write the implementation**

`source/opening-model.ts`:

```ts
// OP（予告編話法の 5 カット + タイトルドロップ）の進行表。DOM もタイマーも
// 持たない葉モジュール。スクリプトの正本は docs/story.md「オープニング」
export type op_cut_t = {
  dur: number     // カットの表示時間（ミリ秒）
  lines: string[] // 字幕。複数行は dur を行数で等分した刻みで 1 行ずつ出す
  takagi?: boolean // true なら高木の声（語りと別スタイル）
  video?: boolean  // true なら絵は動画。1 回再生して終端で pause（ループ禁止:
                   // 継ぎ目のフレーム差が隣接フレームの約 10 倍あり目視できる）
}

export const op_cuts: op_cut_t[] = [
  { dur: 4000, lines: ['西暦2718年。やつらは違法となった。'] },
  { dur: 4000, lines: ['地上から、すべてのやつらが消えた。'] },
  { dur: 5000, lines: ['しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。'] },
  { dur: 5000, lines: ['失われた人類の遺産。', '禁じられた聖域。', '最後の安息の地。'] },
  { dur: 4000, lines: ['喫煙所だ。'], takagi: true, video: true },
  { dur: 4000, lines: [], video: true },
]

// カット 5 の直前に置く黒 1 拍（全音停止）。ミリ秒
export const op_black_lead = 600

// タイトル動画のロゴ着地（カット 6 開始からのミリ秒）。スティングを合わせる
export const op_sting_delay = 1500

// カット内で index 行目の字幕を出す時刻（カット開始からのミリ秒）
export function op_line_at(cut: op_cut_t, index: number): number {
  return Math.round(cut.dur / cut.lines.length * index)
}

// カットの開始時刻（OP 開始からのミリ秒）。カット 5 以降は黒 1 拍ぶんずれる
export function op_cut_at(index: number): number {
  let at = 0
  for (let i = 0; i < index; i++) { at += op_cuts[i].dur }
  return at + (index >= 4 ? op_black_lead : 0)
}

export function op_total(): number {
  return op_cut_at(op_cuts.length - 1) + op_cuts[op_cuts.length - 1].dur
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run source/opening-model.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + 全テスト + Commit**

```bash
npm run typecheck && npm test
git add source/opening-model.ts source/opening-model.test.ts
git commit -m "OP の進行表を純ロジックの opening-model として追加する"
```

---

### Task 2: audio.ts に OP 用の再生口 audio_play_op を足す

**Files:**
- Modify: `source/audio.ts`（`audio_play` の直前に追加）
- Test: `source/audio.test.ts`（既存ファイル末尾に describe を追加）

**Interfaces:**
- Consumes: audio.ts 内部の `audio_ctx` / `audio_gain` / `audio_unlocked`
- Produces: `audio_play_op(buffer: AudioBuffer | undefined, rate: number, gain?: number, loop?: boolean): () => void` — 返り値は stop 関数。未解錠・未生成では no-op の関数を返す

- [ ] **Step 1: Write the failing test**

`source/audio.test.ts` の既存 describe 群の末尾（ファイル末尾）に追加。既存の `fake` ハーネス（`fake.started` / `fake.gains` / `fake.ctx`）をそのまま使う。既存テストが `audio_unlock()` を呼ぶ流儀と、`beforeEach` の初期化を確認してから同じ形で書くこと:

```ts
describe('OP 用の再生口', () => {
  it('解錠前は何も鳴らさず no-op の stop を返す', async () => {
    const { audio_play_op } = await import('./audio')
    const before = fake.started.length
    const stop = audio_play_op({} as AudioBuffer, 0.4)
    expect(fake.started.length).toBe(before)
    stop() // 投げないこと
  })

  it('レート・音量・ループを指定して鳴らし、stop で止められる', async () => {
    const { audio_play_op, audio_unlock } = await import('./audio')
    audio_unlock()
    const before = fake.started.length
    const stop = audio_play_op({} as AudioBuffer, 0.25, 0.4, true)
    expect(fake.started.length).toBe(before + 1)
    const started = fake.started[fake.started.length - 1]
    expect(started.loop).toBe(true)
    expect(started.playbackRate.value).toBe(0.25)
    // 専用 GainNode を作って音量を載せている
    const gain = fake.gains[fake.gains.length - 1]
    expect(gain.gain.value).toBe(0.4)
    stop()
    stop() // 二重 stop も投げないこと
  })
})
```

注意: 既存テストのモジュール取得方法（トップレベル import か動的 import か、
`vi.resetModules` の有無）は既存ファイルの流儀に合わせる。audio.ts の
`audio_unlocked` はモジュール状態なので、先行する describe が audio_unlock()
済みならフレッシュなモジュールでないと「解錠前」は検証できない ― 既存の
リセット手段が無ければ「解錠前」ケースは落とし、解錠後の 2 ケース目だけ残す。既存の source mock の
`stop` は no-op なので「stop が呼ばれた」ことの検証には `started` へ stop 記録を
足す必要があるが、二重 stop で投げない実装（try/catch）の確認は素の呼び出しで足りる。
既存 mock の `createBufferSource().playbackRate` は `make_param(1)` なので
`playbackRate.value = 0.25` の代入が `value` に残ることを確認する。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run source/audio.test.ts`
Expected: FAIL（audio_play_op が存在しない）

- [ ] **Step 3: Write the implementation**

`source/audio.ts` の `audio_play` の直前に追加:

```ts
// OP 専用の再生口。新しい instrument は作らず、既存 sfx をレート変更で流用する
// （低レート = 低く長い音。ブーム・ドローン・スティングを賄う）。OP のスキップと
// カット 5 の全音停止のため、呼び出し側が止められる stop 関数を返す。
// 音量は source ごとの GainNode で載せ、audio_gain（ミュートトグル系）へ通す
export function audio_play_op(
  buffer: AudioBuffer | undefined, rate: number, gain = 1, loop = false,
): () => void {
  if (!audio_unlocked || !buffer) { return () => {} }
  const source = audio_ctx.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  source.playbackRate.value = rate
  const g = audio_ctx.createGain()
  g.gain.value = gain
  source.connect(g)
  g.connect(audio_gain)
  source.start()
  // 再生が終わった source への stop() は InvalidStateError を投げうるので握る。
  // OP は一発音も stop リストへ積んで一括停止するため、この経路は正常系
  return () => { try { source.stop() } catch { /* 終了済みは無視 */ } }
}
```

型エラーが出る場合: 既存 mock の `createGain` の返り値に `connect` があること、
`createBufferSource` の mock に `playbackRate` があることを確認（どちらも既存）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run source/audio.test.ts`
Expected: PASS（既存テスト含め全緑）

- [ ] **Step 5: Typecheck + 全テスト + Commit**

```bash
npm run typecheck && npm test
git add source/audio.ts source/audio.test.ts
git commit -m "既存 sfx をレート変更で流用する OP 用の再生口を audio へ足す"
```

---

### Task 3: opening.ts + opening.css（DOM とタイムライン制御）

**Files:**
- Create: `source/opening.ts`
- Create: `source/opening.css`
- Test: `source/opening.test.ts`

**Interfaces:**
- Consumes: Task 1 の `op_cuts` / `op_black_lead` / `op_sting_delay` / `op_line_at` / `op_cut_at` / `op_total`、Task 2 の `audio_play_op`、audio.ts の `audio_sfx_beep` / `audio_sfx_exhale` / `audio_sfx_explode` / `audio_sfx_hit` / `audio_sfx_lighter`
- Produces: `opening_preload(): void`（DOM 構築 + 素材先読み。冪等）、`opening_show(on_done: () => void): void`（Task 4 の main.ts が使う）

- [ ] **Step 1: Write the failing test**

`source/opening.test.ts`。death-screen.test.ts と同じく jsdom を足さず、
`vi.hoisted` で最小 document を置く:

```ts
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
      id: '', muted: false, playsInline: false, preload: '', src: '',
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

import { opening_show } from './opening'
import { op_black_lead, op_cut_at, op_total } from './opening-model'

const cuts = (): typeof harness.created =>
  harness.created.filter((el) => el.className === 'op-cut')
const subs = (): typeof harness.created[number] =>
  harness.created.find((el) => el.className === 'op-sub')!
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

    // カット 1 が点いて 1 行目の字幕が出る
    vi.advanceTimersByTime(0)
    expect(on_cut()).toEqual([0])
    expect(subs().children.length).toBe(1)
    expect(subs().children[0].textContent).toBe('西暦2718年。やつらは違法となった。')

    // カット 4 の三連呼: 開始で 1 行、1667ms・3333ms で 1 行ずつ増える
    vi.advanceTimersByTime(op_cut_at(3) + 1667)
    expect(subs().children.length).toBe(2)
    vi.advanceTimersByTime(3333 - 1667)
    expect(subs().children.length).toBe(3)

    // 黒 1 拍: 全カット消灯 + それまでの音が全部止まる
    vi.advanceTimersByTime(op_cut_at(4) - op_black_lead - (op_cut_at(3) + 3333))
    expect(on_cut()).toEqual([])
    expect(audio.plays.length).toBeGreaterThan(0)
    expect(audio.plays.every((p) => p.stopped)).toBe(true)

    // カット 5: 高木の行（tk クラス）と動画再生
    vi.advanceTimersByTime(op_black_lead)
    expect(on_cut()).toEqual([4])
    expect(subs().children[0].className).toBe('op-line tk')
    expect(harness.play_calls).toEqual(['video'])

    // 完走で on_done が 1 回だけ呼ばれ、以後タイマーが残っていない
    vi.advanceTimersByTime(op_total() - op_cut_at(4))
    expect(done).toBe(1)
    vi.advanceTimersByTime(60000)
    expect(done).toBe(1)
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
})
```

注意: opening.ts はモジュール変数で DOM を 1 度だけ組む（death-screen と同じ
不変条件）。テストは同一モジュールインスタンスを共有するので、opening_show は
再入可能（finish 後にもう一度 show できる）に実装すること。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run source/opening.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: Write the implementation**

`source/opening.ts`:

```ts
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

// OP の音の予定表。新しい instrument は作らず既存 sfx のレート変更で賄う。
// buffer を () => で遅延参照するのは death-screen.ts の upgrade_sfx と同じ理由
//（audio_sfx_* は export let で、値で捉えると生成前の undefined に固定される）
type op_sound_t = {
  at: number
  sfx: () => AudioBuffer | undefined
  rate: number
  gain: number
  loop?: boolean
}

function op_sounds(): op_sound_t[] {
  const boom = (): AudioBuffer | undefined => audio_sfx_explode
  const list: op_sound_t[] = [
    // カット 1: ブーム一発 + 低いドローン（黒 1 拍まで鳴りっぱなし）
    { at: op_cut_at(0), sfx: boom, rate: 0.4, gain: 0.8 },
    { at: op_cut_at(0), sfx: () => audio_sfx_exhale, rate: 0.25, gain: 0.4, loop: true },
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
      stops.push(audio_play_op(sound.sfx(), sound.rate, sound.gain, sound.loop))
    }, sound.at)
  }
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
```

`source/opening.css`:

```css
/* OP（予告編）。index.html の <style> と独立。z-index は死亡画面 (#ds=10) より
   上、全画面フラッシュ (#bf=18) より下。寸法は vw / vh（death-screen と同じ前提） */
#op {
  position: fixed;
  inset: 0;
  display: none;
  background: #000;
  z-index: 15;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}
/* カットのレイヤー。背景画像は静止画カットの絵兼、動画カットのポスター */
#op .op-cut {
  position: absolute;
  inset: 0;
  background: #000 center / cover no-repeat;
  opacity: 0;
  transition: opacity 0.8s ease;
}
#op .op-cut.on {
  opacity: 1;
  animation: op-kb 6s ease-out forwards;
}
@keyframes op-kb { to { transform: scale(1.05); } }
/* 動画は再生が始まるまで透明のまま（ポスターが見える）。.playing は
   video.play() の成功時に opening.ts が付ける */
#op .op-cut video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
}
#op .op-cut video.playing { opacity: 1; }
/* 字幕。語り（.op-line）はセリフ体で画面中央 ― ターミナルの等幅アンバーと
   別の声であることを字面で示す（docs/story.md「声の使い分け」） */
#op .op-sub {
  position: absolute;
  left: 8vw;
  right: 8vw;
  top: 50%;
  transform: translateY(-50%);
  text-align: center;
}
#op .op-line {
  color: #e8e2d0;
  font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'BIZ UDMincho', serif;
  font-size: 2.4vw;
  letter-spacing: 0.18em;
  line-height: 2;
  text-shadow: 0 0 12px #000, 0 0 4px #000;
  animation: op-line-in 0.9s ease-out both;
}
/* 高木の声。吹き出し (#b) と同じアンバーのゴシックで「中の人」と分かる形にする */
#op .op-line.tk {
  color: #e90;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
  font-weight: bold;
  font-size: 3.2vw;
  text-shadow: 0 0 14px #f70;
}
@keyframes op-line-in { from { opacity: 0; } to { opacity: 1; } }
#op .op-skip {
  position: absolute;
  right: 2vw;
  bottom: 3vh;
  color: #b9dcc4;
  opacity: 0.5;
  font-size: 1.1vw;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
}
@media (prefers-reduced-motion: reduce) {
  /* カットは静止画の即時切替のみ。動画を再生しない側は opening.ts が畳む */
  #op .op-cut { transition: none; }
  #op .op-cut.on { animation: none; }
  #op .op-line { animation: none; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run source/opening.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + 全テスト + Commit**

```bash
npm run typecheck && npm test
git add source/opening.ts source/opening.css source/opening.test.ts
git commit -m "OP の DOM とタイムライン制御を opening として実装する"
```

---

### Task 4: 起動画面とクリック先行の main.ts

**Files:**
- Modify: `index.html`（#h の中にクレジット #cr と起動プロンプト #st、style 追加）
- Modify: `source/dom.ts`（start_el を追加）
- Modify: `source/main.ts`（全面書き換え）

**Interfaces:**
- Consumes: Task 3 の `opening_preload` / `opening_show`
- Produces: なし（エントリポイント）。この変更で `terminal_run_intro` の呼び出し元が消える（削除は Task 5）

このタスクはエントリポイントの配線なのでユニットテストを足さず、ブラウザで検証する。

- [ ] **Step 1: index.html に起動画面の要素とスタイルを足す**

`<div id="h"></div>` を次に置き換える:

```html
	<div id="h">
		<div id="cr">原作: UNDERRUN — DOMINIC SZABLEWSKI // PHOBOSLAB.ORG<br>音楽: ANDREAS LÖSCH // NO-FATE.NET</div>
		<div id="st">クリックで起動</div>
	</div>
```

`<style>` 内の `#h::after{...}` の直後に追加（`@keyframes r` の明滅を流用する。
z-index:1 は #h::after のグラデーションより手前に出すため）:

```css
		#cr{position:absolute;left:2vw;bottom:2.5vh;z-index:1;color:#8fae97;font-size:1.1vw;line-height:1.8;font-family:monospace;}
		#st{display:none;position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);z-index:1;color:#e90;font-weight:bold;font-size:2.2vw;text-shadow:0 0 7px #f70;font-family:monospace;animation:r 1s infinite;}
```

- [ ] **Step 2: dom.ts に start_el を追加**

`hero_el` の行の直後に:

```ts
export const start_el = document.getElementById('st') as HTMLElement
```

- [ ] **Step 3: main.ts を書き換える**

全文を次に置き換える:

```ts
import atlas_url from '../m/q2.png'
import { audio_init, audio_unlock } from './audio'
import { death_screen_show } from './death-screen'
import { run_start } from './game'
import { hero_el, start_el } from './dom'
import { input_init } from './input'
import { meta_load } from './meta'
import { opening_preload, opening_show } from './opening'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_clear, terminal_hide, terminal_write_line } from './terminal'

input_init()
meta_load()

terminal_write_line('起動中...')
// クリック待ちのあいだに OP の DOM 構築と素材（画像・動画）の先読みを済ませる
opening_preload()

// 音はブラウザの自動再生ポリシーで最初のクリック後にしか鳴らせないため、
// クリックを OP より先に置き、OP 全編を音付きで流す（docs/story.md「オープニング」）
audio_init(() => {
  start_el.style.display = 'block'
  document.onclick = () => {
    document.onclick = null
    // 自動再生ポリシー対策。AudioContext の resume() はユーザー操作の
    // ハンドラ内で呼ぶ必要がある（audio.ts 参照）
    audio_unlock()
    start_el.style.display = 'none'
    terminal_cancel()
    terminal_clear()
    terminal_hide()
    hero_el.style.opacity = '0'
    setTimeout(() => {
      hero_el.style.display = 'none'
    }, 1000)

    // OP とレンダラ初期化を並走させ、両方揃ってから自席の端末へ。
    // OP は完走 26.6 秒だがスキップは一瞬なので、アトラス側も待ち合わせる
    let op_done = false
    let atlas_ready = false
    const try_start = (): void => {
      if (op_done && atlas_ready) {
        // 初回も死亡画面（自席の端末）を経由する。前セッションの残高が
        // あれば降下前に使えるし、初回プレイでも操作の予告になる
        death_screen_show(null, run_start)
      }
    }
    renderer_init()
    const atlas = new Image()
    atlas.src = atlas_url
    atlas.onload = () => {
      renderer_bind_image(atlas)
      atlas_ready = true
      try_start()
    }
    opening_show(() => {
      op_done = true
      try_start()
    })
  }
})
```

- [ ] **Step 4: Typecheck + 全テスト**

```bash
npm run typecheck && npm test
```
Expected: PASS（terminal_run_intro はまだ存在するが未使用になっただけ）

- [ ] **Step 5: ブラウザで検証する**

`preview_start`（launch.json の takagiaction）でプレビューを開き、次を確認:

1. 起動画面: hero + 左下クレジット + 中央下「クリックで起動」の明滅（音声生成完了後に出る）。タイトルロゴが出ていないこと
2. **タブを前面にしてから**クリック（背面タブでは音なし動画の play() が省電力停止され、setTimeout も絞られる。`tabs_select` で前面化する）
3. カット 1〜4 が字幕付きで送られること（screenshot を数回）
4. 黒 1 拍 → 喫煙所の動画 + アンバーの「喫煙所だ。」 → タイトル動画 → 自席の端末
5. リロードして今度は OP 中にクリック → 即・自席の端末（スキップ）
6. コンソールにエラーが無いこと（read_console_messages）

rAF が絞られて screenshot が黒い場合は LEARNINGS.md の代替手段
（実 Chrome で開く / `import('/source/opening.ts')` の直呼びと DOM 状態の確認）を使う。

- [ ] **Step 6: Commit**

```bash
git add index.html source/dom.ts source/main.ts
git commit -m "起動をクリック先行にして OP を音付きで流す"
```

---

### Task 5: terminal.ts からログ式イントロを削除する

**Files:**
- Modify: `source/terminal.ts`
- Modify: `source/terminal.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: terminal.ts の公開 API は `terminal_hide` / `terminal_cancel` / `terminal_clear` / `terminal_write_line` / `terminal_show_notice` になる（`terminal_run_intro` が消える）

- [ ] **Step 1: テストを先に更新する（RED）**

`source/terminal.test.ts`:
- import から `terminal_run_intro` を外す
- 2 つ目のテスト「ノイズ表示中にイントロを打ち切っても…」を丸ごと削除（対象機能が消える）
- 3 つ目のテスト「ゲーム中の通知は画面上中央のクラスを付け、イントロは付けない」を削除し、1 つ目のテストの先頭 expect 群に `expect(mocks.classes.has('nt')).toBe(true)` を追加する

Run: `npx vitest run source/terminal.test.ts`
Expected: PASS（この時点では実装が残っていても通る。次の削除の安全網として先に整える）

- [ ] **Step 2: terminal.ts から削除する**

削除するもの:
- `terminal_text_title` / `terminal_text_garbage`（`+=` の行も） / `terminal_text_story`
- `terminal_style_garbage`
- `terminal_run_intro` / `terminal_run_garbage` / `terminal_run_story`
- `terminal_style_t` 定義の上のコメント（52〜58 行目の「ノイズ表示…」の段落）を
  次に書き換える:

```ts
// 1 行あたりの待ち（ミリ秒）と `> ` プレフィックスの有無。通知チェーンの設定
```

残すもの（通知系が使う）: `terminal_text_ident` / `terminal_style_normal` /
`terminal_prepare_text` / `terminal_write_text` / `terminal_write_line` /
`terminal_show_notice` / `terminal_show` / `terminal_hide` / `terminal_cancel` /
`terminal_clear`

- [ ] **Step 3: 参照が残っていないことを確認**

```bash
grep -rn "terminal_run_intro\|terminal_text_title\|terminal_text_garbage\|terminal_text_story\|terminal_run_garbage\|terminal_run_story" source/
```
Expected: ヒットなし

- [ ] **Step 4: Typecheck + 全テスト**

```bash
npm run typecheck && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add source/terminal.ts source/terminal.test.ts
git commit -m "ログ式イントロを terminal から削除する"
```

---

### Task 6: 自席の端末に操作説明を常設する

**Files:**
- Modify: `source/death-screen.ts`（build() の `.ds-hint` の直後に 1 要素追加）
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: なし（静的 HTML + CSS のみ。状態に依存しない）
- Produces: なし

- [ ] **Step 1: build() に要素を足す**

`source/death-screen.ts` の build() 内、`'<div class="ds-hint">' ... '</div>' +` の
直後に追加:

```ts
    // 地下での操作の常設表示。OP から外した操作説明の置き場（docs/story.md）。
    // 左下はこの画面自身のキーヒント、右下は降下ボタンが占めるので下中央に置く
    '<div class="ds-controls">' +
    '<span>[W A S D / 矢印] 移動</span><span>[Space] 射撃</span><span>[M] 音声</span>' +
    '</div>' +
```

- [ ] **Step 2: death-screen.css にスタイルを足す**

`#ds .ds-hint { ... }` ブロック群の直後に追加（.ds-hint と同じ書体・入退場）:

```css
/* 地下での操作の常設表示。.ds-hint（画面操作）と別置き ― 混ぜると
   「この画面のキー」と「地下のキー」の区別がつかない */
#ds .ds-controls {
  position: absolute;
  left: 50%;
  bottom: 4%;
  transform: translateX(-50%);
  display: flex;
  gap: 2vw;
  font-size: .85vw;
  color: #7fe0a8;
  opacity: .5;
  white-space: nowrap;
}
#ds.entering .ds-controls { animation: ds-in-up .5s var(--ease-in) 1.4s backwards; }
#ds.exiting .ds-controls { animation: ds-suck-in .3s var(--ease-out) .16s forwards; }
```

注意: `.ds-controls` は `transform: translateX(-50%)` を持つため、`ds-in-up` /
`ds-suck-in` の keyframes が transform を上書きする場合は横位置がずれる。
ブラウザ確認（Step 4）でずれたら、`left: 50%; transform: translateX(-50%)` を
やめて `left: 30%; right: 30%; justify-content: center` の固定幅センタリングに
差し替える。

- [ ] **Step 3: Typecheck + 全テスト**

```bash
npm run typecheck && npm test
```
Expected: PASS（death-screen.test.ts は innerHTML の中身を検証しないので影響なし）

- [ ] **Step 4: ブラウザで検証**

プレビューで OP をスキップして自席の端末を出し、screenshot で確認:
- 下中央に操作説明が出ている
- 左下のキーヒント・右下の降下ボタンと重なっていない
- 入場演出（entering）でヒント類と同じタイミングでフェードインする

- [ ] **Step 5: Commit**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "自席の端末に地下での操作説明を常設する"
```

---

### Task 7: docs の蒸留と作業ドキュメントの削除・最終検証

**Files:**
- Modify: `docs/architecture.md`
- Delete: `docs/superpowers/specs/2026-08-28-opening-design.md`
- Delete: `docs/superpowers/specs/2026-08-28-opening-images.md`
- Delete: `docs/superpowers/plans/2026-08-29-opening-trailer.md`（このファイル。実装完了後）

- [ ] **Step 1: architecture.md を現状に合わせる**

対象は「起動時の hero レイヤー」（197 行付近）と「音声の初回解錠」（229 行付近）。
両セクションを読み、旧イントロ（terminal_run_intro）前提の記述を次の内容へ
書き換える（見出しや周辺の構成は既存に合わせて調整してよい）:

```markdown
## 起動画面と OP

起動画面は hero レイヤー（#h）+ 原作クレジット（#cr）+「クリックで起動」（#st、
audio_init 完了後に表示）で、タイトルロゴは出さない（タイトルドロップまで温存。
docs/story.md「オープニング」）。クリック待ちのあいだに opening_preload() が
OP の DOM 構築と素材先読みを済ませる。

OP（source/opening.ts）は予告編話法の 5 カット + タイトルドロップ。進行表は
opening-model.ts（葉モジュール）が持つ。音は最初のクリック後にしか鳴らせない
ため、OP 本編は必ずクリックの後に置く。スキップ（クリック / M 以外のキー）と
完走は単一の opening_finish() に集約し、タイマー・音・動画をまとめて止める。
OP の音は新しい instrument を作らず、既存 sfx のレート変更（audio_play_op）で
賄う。動画（op5 / title）はループさせず 1 回再生して終端 pause ― ループは
継ぎ目のフレーム差が隣接フレームの約 10 倍あり目視できる。動画に音声トラックは
無く、背面タブでは play() が省電力停止されるため、自動検証はシークとデコードで
行う。

OP を抜けると初回も死亡画面（自席の端末）を経由する。操作説明（移動・射撃・
音声）は OP に置かず、この画面の下中央に常設する。
```

「音声の初回解錠」セクションは、クリックハンドラの所在が main.ts のゲーム開始
クリックのままなら変更不要。文中でイントロやストーリー表示に言及していれば
その部分だけ削る。

- [ ] **Step 2: 作業ドキュメントを削除する**

```bash
git rm docs/superpowers/specs/2026-08-28-opening-design.md docs/superpowers/specs/2026-08-28-opening-images.md docs/superpowers/plans/2026-08-29-opening-trailer.md
```

（設計の結論は docs/story.md「オープニング」と docs/architecture.md に蒸留済み）

- [ ] **Step 3: 最終検証**

```bash
npm run typecheck && npm test
npm run build
```
Expected: すべて成功。build 出力に op1〜op5 / title のアセットが含まれること
（`ls dist/assets | grep -E "op|title"`）

ブラウザで通し確認（タブを前面にして）:
1. 起動画面 → クリック → OP 完走 → 自席の端末 → 降下 → ゲーム開始
2. ゲーム中の通知（深度到達）が従来どおり画面上中央に出る
3. リロード → OP 即スキップ → 自席の端末

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "OP を予告編構成に置き換えた設計を docs へ蒸留する"
```

---

## Self-Review 済みの注意点

- opening.ts はテスト容易性のため innerHTML 一括生成でなく createElement で組む
  （テストの最小 document が querySelector 群を模す必要がなくなる）
- audio_sfx_* は `() =>` で遅延参照する（export let のため。death-screen.ts の
  upgrade_sfx と同じ落とし穴）
- localhost では音声が既定ミュート（audio.ts）なので、開発中に OP が無音なのは
  仕様。音の確認は M でトグルするか本番相当のホスト名で行う
- 開始クリックがそのままスキップに化けないのは、dispatch 中に同一ノードへ
  addEventListener したリスナーがその event では呼ばれないため（DOM 仕様）。
  もし実機で開始クリック直後にスキップされる挙動を見たら、リスナー登録を
  `sched(() => { ... }, 0)` に包んで 1 tick 遅らせる
