# 高木のモノローグ吹き出し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自機頭上に追従する吹き出しで高木の内心（つぶやき）を表示し、初心者への行動誘導をストーリーとして伝える。

**Architecture:** 純粋モジュール 2 つ（projection.ts = シェーダ行列の JS 再現、monologue-model.ts = 文字送り状態機械とプール選択）を Vitest でテストし、DOM 結合層（monologue.ts）がそれらを束ねる。game.ts と entity-smoking-area.ts がトリガーを呼ぶ。時間進行はすべて `state.time_elapsed` 駆動で setTimeout を使わない。

**Tech Stack:** TypeScript + Vite、Vitest、DOM オーバーレイ（CSS アニメーション）。renderer.ts は変更しない。

**Spec:** `docs/superpowers/specs/2026-08-21-monologue-design.md`

## Global Constraints

- 識別子は既存流儀の snake_case。エクスポート関数はモジュール名をプレフィックスにする（`monologue_say` など）
- 純粋モジュール（projection.ts / monologue-model.ts）は**実行時 import を持たない**こと。dom / renderer / audio / terminal を import すると Node（Vitest）でモックなしに評価できなくなる
- monologue.ts では setTimeout を使わない。時間進行はすべて `state.time_elapsed` 駆動（terminal_cancel がチェーンを潰す既知バグ類型・レビュー Finding 1 への構造的対策）
- renderer.ts は変更しない。シェーダ行列の定数（0.707 / 22.627 / 0.977 / 1.303、cam オフセット -10 / -30）を projection.ts に複製する
- 後方互換レイヤーを作らない。移管した terminal 通知は削除する
- 世界観: 吹き出しは高木の一人称。世界の危機や陰謀をほのめかす文言は書かない（docs/story.md）
- 各タスクの検証: `npm run typecheck` と `npm test`（コマンドはリポジトリルートで実行）

---

### Task 1: projection.ts — ワールド座標 → CSS ピクセル変換

**Files:**
- Create: `source/projection.ts`
- Test: `source/projection.test.ts`

**Interfaces:**
- Consumes: なし（葉モジュール）
- Produces: `project(x, y, z, cam_x, cam_y, cam_z, view_w, view_h): { x: number, y: number } | null` — ワールド座標とレンダラの `camera` の生の値、canvas の clientWidth/clientHeight を受け取り CSS ピクセル座標を返す。カメラ背後なら null。Task 3 の monologue.ts が使う。

- [ ] **Step 1: 失敗するテストを書く**

`source/projection.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { project } from './projection'

// カメラが自機に追従しきった定常状態は camera = (-px, 0, -pz)（game.ts の減衰追従の不動点）。
// 自機頭上の点 (px+3, 8, pz) は、自機がどこにいても同じスクリーン位置に来るはず。
describe('project', () => {
  it('定常状態の自機頭上は画面中央のやや右下に投影される', () => {
    const p = project(3, 8, 0, 0, 0, 0, 320, 180)!
    expect(p.x).toBeCloseTo(170.36, 1)
    expect(p.y).toBeCloseTo(97.34, 1)
  })

  it('自機の位置によらず定常状態では同じスクリーン位置になる', () => {
    const a = project(3, 8, 0, 0, 0, 0, 320, 180)!
    const b = project(103, 8, 200, -100, 0, -200, 320, 180)!
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)
  })

  it('ワールドで +x に動くとスクリーンでも右に動く', () => {
    const left = project(0, 8, 0, 0, 0, 0, 320, 180)!
    const right = project(10, 8, 0, 0, 0, 0, 320, 180)!
    expect(right.x).toBeGreaterThan(left.x)
  })

  it('カメラ背後の点は null を返す', () => {
    expect(project(0, 0, 100, 0, 0, 0, 320, 180)).toBeNull()
  })

  it('表示サイズに比例してスケールする', () => {
    const small = project(3, 8, 0, 0, 0, 0, 320, 180)!
    const large = project(3, 8, 0, 0, 0, 0, 640, 360)!
    expect(large.x).toBeCloseTo(small.x * 2, 6)
    expect(large.y).toBeCloseTo(small.y * 2, 6)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- --run projection`
Expected: FAIL（`./projection` が存在しない）

- [ ] **Step 3: 最小実装を書く**

`source/projection.ts` を新規作成:

```ts
// renderer.ts の頂点シェーダに定数として埋まっている view / projection 行列を
// JS で再現し、ワールド座標を CSS ピクセルへ変換する。シェーダ側の計算は
//   gl_Position = r * v * vec4(p + cam, 1)
// で、cam には renderer_end_frame() が (camera.x, camera.y - 10, camera.z - 30) を
// 渡している。GLSL の mat4 リテラルは列優先。renderer.ts 側の行列や cam の
// オフセットを変えるときは、ここも揃えて変えること。
//
// 実行時 import を持たない葉モジュール。Node（Vitest）でモックなしに評価できる。

export function project(
  x: number, y: number, z: number,
  cam_x: number, cam_y: number, cam_z: number,
  view_w: number, view_h: number,
): { x: number, y: number } | null {
  const qx = x + cam_x
  const qy = y + cam_y - 10
  const qz = z + cam_z - 30

  // view 行列 v: X 軸まわり 45° の傾き（0.707）と平行移動 -22.627
  const vy = 0.707 * (qy - qz) - 22.627
  const vz = 0.707 * (qy + qz) - 22.627

  // projection 行列 r: clip = (0.977*qx, 1.303*vy, -vz-2, -vz)
  const w = -vz
  if (w <= 0) { return null }

  return {
    x: (0.977 * qx / w + 1) / 2 * view_w,
    y: (1 - 1.303 * vy / w) / 2 * view_h,
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- --run projection`
Expected: PASS（5 件）

- [ ] **Step 5: 型チェックとコミット**

```bash
npm run typecheck
git add source/projection.ts source/projection.test.ts
git commit -m "feat: シェーダ行列を再現するワールド→スクリーン投影を追加"
```

---

### Task 2: monologue-model.ts — 文字送り状態機械とプール選択

**Files:**
- Create: `source/monologue-model.ts`
- Test: `source/monologue-model.test.ts`

**Interfaces:**
- Consumes: なし（葉モジュール）
- Produces（Task 3 の monologue.ts が使う）:
  - `bubble_char_interval = 0.05`（1 文字あたり秒）、`bubble_linger = 3`（全文表示後の余韻秒）
  - `interface bubble_t { text: string, delay: number, age: number }`
  - `bubble_idle(): bubble_t` / `bubble_start(text: string, delay: number): bubble_t`
  - `bubble_advance(b: bubble_t, dt: number): void` — 時間を進める（破壊的更新）
  - `bubble_visible_text(b: bubble_t): string` — 今フレーム見えている文字列（'' = 非表示）
  - `bubble_active(b: bubble_t): boolean` — 表示中または遅延予約中か
  - `monologue_pick(pool: string[], last: string, rand: number): string` — rand ∈ [0,1) で選択、直前と同じ行を避ける

- [ ] **Step 1: 失敗するテストを書く**

`source/monologue-model.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import {
  bubble_active, bubble_advance, bubble_char_interval, bubble_idle, bubble_linger,
  bubble_start, bubble_visible_text, monologue_pick,
} from './monologue-model'

describe('monologue_pick', () => {
  const pool = ['あ', 'い', 'う']

  it('rand に応じたプールの行を返す', () => {
    expect(monologue_pick(pool, '', 0)).toBe('あ')
    expect(monologue_pick(pool, '', 0.5)).toBe('い')
    expect(monologue_pick(pool, '', 0.99)).toBe('う')
  })

  it('直前と同じ行に当たったら次の行へずらす（末尾は先頭へ巻く）', () => {
    expect(monologue_pick(pool, 'あ', 0)).toBe('い')
    expect(monologue_pick(pool, 'う', 0.99)).toBe('あ')
  })

  it('1 行しかないプールは直前と同じでもその行を返す', () => {
    expect(monologue_pick(['あ'], 'あ', 0.5)).toBe('あ')
  })
})

describe('bubble', () => {
  it('idle は非アクティブで何も表示しない', () => {
    const b = bubble_idle()
    expect(bubble_active(b)).toBe(false)
    expect(bubble_visible_text(b)).toBe('')
  })

  it('遅延中は非表示だがアクティブ（予約中）', () => {
    const b = bubble_start('たばこ', 2)
    expect(bubble_active(b)).toBe(true)
    expect(bubble_visible_text(b)).toBe('')
    bubble_advance(b, 1)
    expect(bubble_visible_text(b)).toBe('')
  })

  it('遅延を消化すると文字送りが始まり、食い込んだ時間ぶんも進む', () => {
    const b = bubble_start('たばこたばこ', 1)
    bubble_advance(b, 1 + bubble_char_interval * 3)
    // 遅延 1 秒を消化し、残り 3 文字ぶんの時間 + 先頭 1 文字で 4 文字見えている
    expect(bubble_visible_text(b)).toBe('たばこた')
  })

  it('文字送りは 1 文字ずつ進む', () => {
    const b = bubble_start('たばこ', 0)
    expect(bubble_visible_text(b)).toBe('た')
    bubble_advance(b, bubble_char_interval)
    expect(bubble_visible_text(b)).toBe('たば')
    bubble_advance(b, bubble_char_interval)
    expect(bubble_visible_text(b)).toBe('たばこ')
  })

  it('全文表示から linger 経過で非アクティブになる', () => {
    const b = bubble_start('たばこ', 0)
    bubble_advance(b, 3 * bubble_char_interval + bubble_linger - 0.01)
    expect(bubble_active(b)).toBe(true)
    bubble_advance(b, 0.02)
    expect(bubble_active(b)).toBe(false)
    expect(bubble_visible_text(b)).toBe('')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- --run monologue-model`
Expected: FAIL（`./monologue-model` が存在しない）

- [ ] **Step 3: 最小実装を書く**

`source/monologue-model.ts` を新規作成:

```ts
// 吹き出しの文字送り状態機械とセリフプール選択。副作用も実行時 import も
// 持たない葉モジュール（Node の Vitest でモックなしに評価できる）。
// 時間は呼び出し側が state.time_elapsed で進める。setTimeout に載せないのは、
// terminal.ts の表示チェーンを terminal_cancel() が丸ごと捨てる既知バグ類型
// （レビュー Finding 1）に最初から加担しないため。

export const bubble_char_interval = 0.05 // 1 文字あたり秒（タイプ表示）
export const bubble_linger = 3 // 全文表示後、消えるまでの余韻（秒）

export interface bubble_t {
  text: string // 全文。'' = 非アクティブ
  delay: number // 表示開始までの残り秒
  age: number // 表示開始からの経過秒
}

export function bubble_idle(): bubble_t {
  return { text: '', delay: 0, age: 0 }
}

export function bubble_start(text: string, delay: number): bubble_t {
  return { text, delay, age: 0 }
}

export function bubble_advance(b: bubble_t, dt: number): void {
  if (!b.text) { return }
  if (b.delay > 0) {
    b.delay -= dt
    if (b.delay > 0) { return }
    b.age = -b.delay // 遅延を食い込んだ時間は表示側に繰り入れる
    b.delay = 0
    return
  }
  b.age += dt
  if (b.age > b.text.length * bubble_char_interval + bubble_linger) {
    b.text = ''
  }
}

export function bubble_visible_text(b: bubble_t): string {
  if (!b.text || b.delay > 0) { return '' }
  return b.text.slice(0, Math.floor(b.age / bubble_char_interval) + 1)
}

export function bubble_active(b: bubble_t): boolean {
  return b.text !== ''
}

// 直前に出した行（プール横断で 1 つだけ覚える）を避けて選ぶ。
// rand は [0, 1) を呼び出し側が渡す（テストで決定的にするため）。
export function monologue_pick(pool: string[], last: string, rand: number): string {
  let index = Math.min(pool.length - 1, Math.floor(rand * pool.length))
  if (pool.length > 1 && pool[index] === last) {
    index = (index + 1) % pool.length
  }
  return pool[index]
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- --run monologue-model`
Expected: PASS（8 件）

- [ ] **Step 5: 型チェックとコミット**

```bash
npm run typecheck
git add source/monologue-model.ts source/monologue-model.test.ts
git commit -m "feat: 吹き出しの文字送り状態機械とプール選択を追加"
```

---

### Task 3: 吹き出しの DOM 結合層（index.html / dom.ts / monologue.ts）

**Files:**
- Modify: `index.html`（要素 1 つと CSS を追加）
- Modify: `source/dom.ts`（`bubble_el` エクスポート追加）
- Create: `source/monologue.ts`

**Interfaces:**
- Consumes: Task 1 の `project()`、Task 2 の `bubble_*` / `monologue_pick`、renderer の `camera`、dom の `canvas` / `bubble_el`、nicotine の `nicotine_stage_withdrawal`、state の `state.time_elapsed`
- Produces（Task 4 の game.ts と Task 5 の entity-smoking-area.ts が使う）:
  - `monologue_arrival(): void` — フロア到達（2 秒遅延つき）
  - `monologue_dummy(): void` / `monologue_all_done(): void` / `monologue_complete(): void` / `monologue_interrupt(): void`
  - `monologue_notify_stage(stage: number): void` — 毎フレーム呼ぶ。悪化遷移の発話・周期つぶやき・震えクラスを内包
  - `monologue_reset(): void` — 表示中・予約中を消す
  - `monologue_update(px: number, pz: number): void` — 毎フレーム呼ぶ。時間進行と位置追従

- [ ] **Step 1: index.html に吹き出し要素と CSS を追加**

`<code id="sp"></code>` の直後（`<script>` の前）に要素を追加:

```html
	<code id="b"></code>
```

`<style>` 内の `#sp{...}` 行の後に追加:

```css
		#b{position:absolute;left:0;top:0;padding:.3vw .7vw;background:rgba(0,0,0,.75);border:1px solid #e90;border-radius:.5vw;color:#e90;font-weight:bold;font-size:1.4vw;white-space:nowrap;opacity:0;transition:opacity .5s;pointer-events:none;}
		#b::after{content:'';position:absolute;left:50%;bottom:-.35vw;margin-left:-.35vw;border:.35vw solid transparent;border-bottom:0;border-top-color:#e90;}
		#b.tr{animation:tr .12s infinite;}
		@keyframes tr{25%{margin:-2px 0 0 1px;}75%{margin:2px 0 0 -1px;}}
```

注意: 位置は `transform` で毎フレーム更新するので `left/top` は 0 固定。震え（`.tr`）は `margin` を揺らす — `transform` を使うと位置更新と衝突する。既存 CSS の `b{animation:...}` は要素セレクタ（ターミナルのカーソル `<b>`）なので `#b` とは干渉しない。

- [ ] **Step 2: dom.ts に bubble_el を追加**

`source/dom.ts` の末尾に追加し、冒頭コメントの ID 列挙に `b` を足す:

```ts
export const bubble_el = document.getElementById('b') as HTMLElement
```

- [ ] **Step 3: monologue.ts を新規作成**

```ts
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
// 添字 = nicotine_stage_*（1 そわそわ / 2 離脱症状 / 3 限界）。0 は使わない
const lines_stage: string[][] = [
  [],
  ['そろそろ一服したいな……', '……口寂しくなってきた'],
  ['たばこ……たばこ……', '吸わせろ……吸わせろ……'],
  ['もう……限界だ……', 'た……ばこ……'],
]

// フロア到達はターミナルの深度ログと同時に出さない（読む場所が割れる）
const arrival_delay = 2
// 離脱症状以降、何も表示していなければこの間隔で再つぶやきする
const whisper_interval = 10

let bubble: bubble_t = bubble_idle()
let last_line = ''
let stage_last = 0
let whisper_timer = 0

// アンビエント（段階のつぶやき）は表示中・予約中なら譲る。イベントは常に
// 上書きする。キューは持たない — 同フレームのイベント競合は呼び出し側の
// 分岐で解決している（entity-smoking-area の全回収分岐）。
function say(pool: string[], ambient: boolean, delay = 0): void {
  if (ambient && bubble_active(bubble)) { return }
  const line = monologue_pick(pool, last_line, Math.random())
  last_line = line
  bubble = bubble_start(line, delay)
}

export function monologue_arrival(): void { say(lines_arrival, false, arrival_delay) }
export function monologue_dummy(): void { say(lines_dummy, false) }
export function monologue_all_done(): void { say(lines_all_done, false) }
export function monologue_complete(): void { say(lines_complete, false) }
export function monologue_interrupt(): void { say(lines_interrupt, false) }

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
  bubble_el.style.opacity = '0'
}

export function monologue_update(px: number, pz: number): void {
  bubble_advance(bubble, state.time_elapsed)
  const text = bubble_visible_text(bubble)
  if (!text) {
    // textContent は残したまま opacity だけ落とす（CSS transition でフェードアウト）
    bubble_el.style.opacity = '0'
    return
  }
  bubble_el.textContent = text
  bubble_el.style.opacity = '1'

  // 自機頭上（中心 x+3、高さ 8）を投影して吹き出しの下端中央を合わせる
  const w = canvas.clientWidth
  const p = project(px + 3, 8, pz, camera.x, camera.y, camera.z, w, canvas.clientHeight)
  if (!p) {
    bubble_el.style.opacity = '0'
    return
  }
  const x = Math.max(w * 0.08, Math.min(w * 0.92, p.x))
  bubble_el.style.transform =
    'translate(' + x + 'px,' + (p.y - 2) + 'px) translate(-50%,-100%)'
}
```

- [ ] **Step 4: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: 既存テストが壊れていないことを確認してコミット**

Run: `npm test`
Expected: 全件 PASS（このタスクではまだ誰も monologue.ts を import していない）

```bash
git add index.html source/dom.ts source/monologue.ts
git commit -m "feat: 高木のモノローグ吹き出しの DOM 結合層を追加"
```

---

### Task 4: game.ts の配線 — フロア到達・段階監視・毎フレーム更新

**Files:**
- Modify: `source/game.ts`

**Interfaces:**
- Consumes: Task 3 の `monologue_arrival` / `monologue_notify_stage` / `monologue_reset` / `monologue_update`
- Produces: なし（配線のみ）

- [ ] **Step 1: import を追加**

`source/game.ts` の import 群（`minimap` の import の後あたり、アルファベット順の並びに合わせる）に追加:

```ts
import {
  monologue_arrival, monologue_notify_stage, monologue_reset, monologue_update,
} from './monologue'
```

- [ ] **Step 2: load_level にリセットと到達つぶやきを追加**

`load_level()` 末尾の

```ts
  terminal_show_notice('深度 ' + depth + ' に到達___喫煙所の残り香を探知中...')
```

の直後に追加:

```ts
  // フロアを跨いだ表示・予約は消す。到達つぶやきはターミナルの深度ログの
  // 2 秒後に出る（遅延は monologue 側の定数）
  monologue_reset()
  monologue_arrival()
```

- [ ] **Step 3: run_end に非表示化を追加**

`run_end()` の `hud_hide()` の直後に追加（リザルト画面に高木のつぶやきを残さない）:

```ts
  monologue_reset()
```

- [ ] **Step 4: game_tick に毎フレーム更新を追加**

`game_tick()` のカメラシェイク処理（`camera.z += camera.shake * ...` の行）と HP バー描画の間に追加:

```ts
  // 高木のつぶやき。ラン終了後（リザルト表示中）は進めない — run_end() が
  // monologue_reset() で消しているので、ここで動かすと復活してしまう
  if (state.game_running) {
    monologue_notify_stage(stage)
    monologue_update(player.x, player.z)
  }
```

- [ ] **Step 5: 型チェック・テスト・コミット**

```bash
npm run typecheck
npm test
git add source/game.ts
git commit -m "feat: フロア到達とニコチン段階のつぶやきを game.ts に配線"
```

---

### Task 5: entity-smoking-area.ts — 通知の移管と全回収分岐

**Files:**
- Modify: `source/entity-smoking-area.ts`
- Modify: `source/entity-smoking-area.test.ts`
- Modify: `source/entity-init.test.ts`（`./monologue` のモック追加のみ）

**Interfaces:**
- Consumes: Task 3 の `monologue_all_done` / `monologue_complete` / `monologue_dummy` / `monologue_interrupt`、既存の `entity_smoking_area_t._done`（公開フィールド）
- Produces: なし

- [ ] **Step 1: テストを先に更新する（失敗させる）**

`source/entity-smoking-area.test.ts` に以下の変更を加える。

(1) `mocks` に記録先を追加:

```ts
const mocks = vi.hoisted(() => ({
  notices: [] as string[],
  monologue: [] as string[],
  blocks: [] as number[][],
  sprites: [] as number[][],
  lights: [] as number[][],
}))
```

(2) `vi.mock('./game', ...)` の行の後に monologue のモックを追加（monologue.ts は dom / renderer を import するため Node では評価できない）:

```ts
vi.mock('./monologue', () => ({
  monologue_all_done: () => { mocks.monologue.push('all_done') },
  monologue_complete: () => { mocks.monologue.push('complete') },
  monologue_dummy: () => { mocks.monologue.push('dummy') },
  monologue_interrupt: () => { mocks.monologue.push('interrupt') },
}))
```

(3) `beforeEach` のクリア群に追加:

```ts
    mocks.monologue.length = 0
```

(4) 既存テスト「自機の死亡と同じフレームでは中断の通知を出さない」の末尾のアサーションを両チャンネルの検証に変更:

```ts
    expect(mocks.notices.length).toBe(0)
    expect(mocks.monologue.length).toBe(0)
```

(5) describe 末尾に新規テストを追加:

```ts
  // 通知の移管（docs/story.md「声の使い分け」）: 高木の体験は吹き出し、
  // 事実と指示はターミナル
  it('ダミーを踏むと高木がぼやく（他に未回収の喫煙所が残っている場合）', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true

    tick(dummy, player, 0.5)
    expect(mocks.monologue).toEqual(['dummy'])
  })

  it('最後の 1 箇所がダミーなら「もう喫煙所はない」になる', () => {
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true
    for (let i = 0; i < 5; i++) { tick(real, player, 0.5) } // 一服完了
    mocks.monologue.length = 0

    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5)
    expect(mocks.monologue).toEqual(['all_done'])
  })

  it('本物が最後の 1 箇所でも完了のセリフを出す（誘導はターミナルのロック解除通知が担う）', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5) // 開示
    mocks.monologue.length = 0

    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true
    for (let i = 0; i < 5; i++) { tick(real, player, 0.5) }
    expect(mocks.monologue).toEqual(['complete'])
    expect(mocks.notices.some((n) => n.includes('非常口'))).toBe(true)
  })

  it('被弾で中断すると高木が咳き込む（吹き出し側）', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5)
    player.h = 4
    tick(area, player, 0.5)
    expect(mocks.monologue).toEqual(['interrupt'])
    expect(mocks.notices.length).toBe(0) // ターミナルには出さない
  })
```

注意: `tick()` は対象エンティティ 1 体だけを進めるヘルパだが、`new entity_smoking_area_t(...)` はコンストラクタで `state.entities` に登録されるので、全回収分岐（`state.entities` を走査する）は両方のエンティティを見る。

(6) `source/entity-init.test.ts` にも同じモックを追加（このファイルは `entity_smoking_area_t` を import しており、実装が `./monologue` を import するようになるため）。`vi.mock('./game', ...)` の行の後に:

```ts
vi.mock('./monologue', () => ({
  monologue_all_done: () => {},
  monologue_complete: () => {},
  monologue_dummy: () => {},
  monologue_interrupt: () => {},
}))
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- --run entity-smoking-area`
Expected: 新規 4 件が FAIL（`mocks.monologue` が空のまま）。既存テストは PASS のまま

- [ ] **Step 3: entity-smoking-area.ts を実装する**

(1) import に追加:

```ts
import {
  monologue_all_done, monologue_complete, monologue_dummy, monologue_interrupt,
} from './monologue'
```

(2) `_advance()` の中断ブロック: `terminal_show_notice('咳き込んだ')` を次に置き換える:

```ts
      monologue_interrupt()
```

(3) `_complete()`: `terminal_show_notice('深く吸い込む...___非常口のロックが解除された')` を次に置き換える（「深く吸い込む」は高木側の体験なので吹き出しへ、ターミナルはシステムの声に統一）:

```ts
    monologue_complete()
    terminal_show_notice('煙を感知___非常口のロックが解除された')
```

(4) `_take_dummy()`: `terminal_show_notice('灰皿は撤去されました')` を次に置き換える:

```ts
    // このフロアの喫煙所（本物 + ダミー）が全部 _done なら、ハズレ告知の
    // 代わりに「もう無い」を出して非常口へ向かわせる。この状態では本物で
    // 一服済み（＝非常口が開いている）ので文言と状況が矛盾しない。
    // 本物側（_complete）では分岐しない — 誘導はロック解除通知が担う。
    if (state.entities.every(
      (e) => !(e instanceof entity_smoking_area_t) || e._done,
    )) {
      monologue_all_done()
    } else {
      monologue_dummy()
    }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全件 PASS（entity-init.test.ts 含む）

- [ ] **Step 5: 型チェックとコミット**

```bash
npm run typecheck
git add source/entity-smoking-area.ts source/entity-smoking-area.test.ts source/entity-init.test.ts
git commit -m "feat: 喫煙所の通知を高木の吹き出しへ移管し、全回収の分岐を追加"
```

---

### Task 6: docs への蒸留と作業ドキュメントの削除

**Files:**
- Modify: `docs/story.md`（「声の使い分け」節を追加）
- Delete: `docs/superpowers/specs/2026-08-21-monologue-design.md`
- Delete: `docs/superpowers/plans/2026-08-21-monologue.md`（本ファイル）

- [ ] **Step 1: docs/story.md に「声の使い分け」節を追加**

「全体のトーン」節の前に追加:

```markdown
## 声の使い分け

ゲーム中のメッセージは 2 つの声に分かれる。

| チャンネル | 声 | 担当 |
| --- | --- | --- |
| ターミナル（画面左上） | 施設・生体モニタリング端末 | 事実と指示（深度到達、非常口ロック解除、リザルト） |
| 吹き出し（自機頭上） | 高木の内心 | 目的・感情・切迫感（喫煙所を探す動機、ダミーへの悪態、ゲージ低下のつぶやき） |

セリフを書くときの規則:

- ターミナルはログ形式の文体、吹き出しは高木の一人称。初心者への「次に何をすべきか」は吹き出し側が高木の欲望として語る（例:「どこかに喫煙所があるはずだ……」）
- セリフは source/monologue.ts のプールに各 2〜3 種ずつ持ち、直前と同じ行は選ばれない
- ゲージ段階のつぶやきは悪化方向の遷移でのみ出す。改善（一服）では黙る
- 吹き出しの時間進行は setTimeout ではなくフレーム時間駆動。ターミナルの表示チェーンとは独立しており、互いに潰し合わない
```

- [ ] **Step 2: 全体検証**

```bash
npm run typecheck
npm test
```

Expected: いずれもエラーなし・全件 PASS

- [ ] **Step 3: 作業ドキュメントを削除してコミット**

```bash
git rm docs/superpowers/specs/2026-08-21-monologue-design.md docs/superpowers/plans/2026-08-21-monologue.md
git add docs/story.md
git commit -m "docs: 声の使い分けを story.md に蒸留し、作業ドキュメントを削除"
```

---

## 手動確認チェックリスト（メインセッションでブラウザ確認）

`npm run dev` でプレビューを開き、以下を確認する:

1. フロア開始の約 2 秒後、自機の頭上に「どこかに喫煙所があるはずだ……」等が 1 文字ずつ表示され、3 秒余韻ののちフェードアウトする
2. 吹き出しが自機の移動に追従する。画面端に寄っても見切れない
3. ダミーを踏むと「くそっ、灰皿が撤去されてやがる……」等が出て、ターミナル側には出ない
4. 一服完了で吹き出しに「……最高の一服だぜ」等、ターミナルに「煙を感知 / 非常口のロックが解除された」が同時に出る
5. ゲージ 60% を切ると「そろそろ一服したいな……」、30% を切ると「たばこ……たばこ……」が出て文字が震え、以降 10 秒ごとに再つぶやきする
6. 本物で一服済みの状態で最後のダミーを踏むと「もうここには喫煙所はない……」等が出る
7. 死亡（リザルト表示）で吹き出しが消え、次のランに残らない
