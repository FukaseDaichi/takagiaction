# 死亡画面の再設計（人体強化ステーション）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 死亡画面を「情報が並んだステータス画面」から「人体模型を操作して自分の身体を強化する装置」へ作り替える。常時表示の情報量を 30〜40% まで落とし、削った情報は Level 1 / 2 / 3 の 3 階層へ再配置する。

**Architecture:** 現行の `render()` は `root.innerHTML` をキー入力のたびに組み直しており、CSS アニメーションの位相が毎回 0 に戻る。これを **永続 DOM ＋ 純粋な状態機械** へ置き換える。`death_screen_show()` が DOM を 1 度だけ組み、以降は class の付け外しとテキスト代入だけを行う。人体模型は `body.webp`（256×512）を `mix-blend-mode: screen` の下地に敷き、その真上に viewBox を合わせた inline SVG で器官・接続線・アイコンを重ねる。

**Tech Stack:** TypeScript + Vite + Vitest（jsdom なし・Node 環境）。CSS はプレーン CSS（`death-screen.css`）。依存は追加しない。

**Spec:** [`docs/superpowers/specs/2026-08-26-death-screen-redesign-design.md`](../specs/2026-08-26-death-screen-redesign-design.md)

## Global Constraints

- **`AGENTS.md`「後方互換性は維持しない」** — 置き換えた実装・関数・CSS は残さず削除する。互換レイヤーやフォールバックを足さない
- **`AGENTS.md`「最もシンプルな実装を選ぶ」** — 呼び出し元が 1 箇所しかないものに抽象化レイヤーを作らない。使う予定のないオプションを増やさない
- **依存を追加しない** — `package.json` の `devDependencies` は `typescript` / `vite` / `vitest` の 3 つのまま。jsdom も happy-dom も入れない
- **画像は静的 import のみ** — `'../m/ui/gear-' + id + '.webp'` のような文字列連結は Vite が静的に検出できず本番ビルドで 404 になる（`docs/architecture.md`）
- **`death-screen-model.ts` と `body-figure.ts` は Node でモックなしに評価できること** — モジュール初期化時に `document` / `canvas.getContext()` / `new AudioContext()` へ推移的にも到達しない
- **新しい色語彙を増やさない** — 強化 6 種の色は `upgrade-rows.ts` が持つ値をそのまま使う: lung `#3ac6f0` / tolerance `#a86df0` / sniff `#3af08a` / leg `#f0568c` / power `#f0932a` / spare `#f0c93a`
- **効果の数値は `meta.ts` の getter から引く** — 式を画面側に書き写さない。`upgrade_rows[].value(level)` 経由でのみ取得する
- **音は既存の 11 個から選ぶ** — `sound-effects.ts` に instrument を追加しない。使えるのは `shoot` / `hit` / `hurt` / `beep` / `pickup` / `terminal` / `explode` / `lighter` / `exhale` / `door` / `swing`
- **`prefers-reduced-motion: reduce` は CSS だけで処理する** — JS 側に分岐を持たない（`index.html` の `#wf` / `#sl` / `#bf` と同じ流儀）
- **コミットは自分が触ったファイルだけを明示列挙する** — このリポジトリは複数セッションが同じ作業ツリーを共有している。`git commit -a` / `git add -A` / `git add .` は使わない
- **コミットメッセージは日本語**、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を置く

---

## ファイル構成

| ファイル | 責務 | 状態 |
| --- | --- | --- |
| `source/death-screen-model.ts` | 状態機械（`ds_reduce`）、強調階層（`ds_part_layer` / `ds_item_layer`）、死因メッセージ、生存時間の書式、記録更新の判定。純関数のみ | 変更 |
| `source/death-screen-model.test.ts` | 上記の網羅テスト | 変更 |
| `source/body-figure.ts` | 人体模型のジオメトリ — 6 部位のアンカーとアイコン座標、収納位置の導出、装備アンカー、器官の SVG マークアップ | 新規 |
| `source/body-figure.test.ts` | 座標の性質テスト | 新規 |
| `source/gear-icons.ts` | 装備アイコン 30 枚の静的 import とテーブル | 新規 |
| `source/equip-screen.ts` | 上記を import するだけに変更（他は不変） | 変更 |
| `source/death-screen.ts` | DOM の組み立て・状態の適用・入力の配線・演出の起動 | 全面書き換え |
| `source/death-screen.css` | スタイルとアニメーション | 全面書き換え |
| `source/game.ts` | `nicotine_ratio` の書き込みを削除 | 変更（1 行） |
| `docs/meta-progression.md` / `docs/architecture.md` / `docs/equipment.md` | 設計書の更新 | 変更 |

**タスクの並びの理由:** 純関数（Task 1〜4）を先に固めてテストで押さえ、その上に DOM（Task 5〜10）を積む。Task 1 で先に削除を済ませるのは、`death_message()` の戻り値の型が変わり、放置すると Task 2 以降の `npm run typecheck` が常に赤くなるため。

---

## Task 1: 体調 3 項目の削除と、死因を見出しへ移す

赤い状態パネル（手の震え・集中力・吸いたい気持ち）を DOM・CSS・モデル・呼び出し元から丸ごと消す。死因の区別は現在この箱の中にしか無いので、`death_message()` を見出し 1 行を返す関数に変えて拾い直す。

**Files:**
- Modify: `source/death-screen-model.ts`
- Modify: `source/death-screen-model.test.ts`
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`
- Modify: `source/game.ts:123`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `death_message(cause: number): string`（**戻り値が `string[]` から `string` に変わる**）、`run_result_t` から `nicotine_ratio` が消える。`condition_texts()` は存在しなくなる

- [ ] **Step 1: テストを、削除後の姿に書き換える**

`source/death-screen-model.test.ts` の import 行から `condition_texts` を外し、`describe('死亡時の状態表示')` ブロックを丸ごと削除する。`describe('死因メッセージ')` を次に差し替える。

```ts
import { describe, expect, it } from 'vitest'
import {
  death_cause_nicotine, death_message, format_run_time, is_new_record,
} from './death-screen-model'
```

```ts
describe('死因メッセージ', () => {
  // 赤い状態パネルを消したので、死因の区別が残るのは見出しだけになる
  it('敵に殺されたときは既定の見出しを返す', () => {
    expect(death_message(0)).toBe('死亡したよ、高木。')
  })

  it('ニコチン切れは別の見出しで死因が分かる', () => {
    expect(death_message(death_cause_nicotine)).toBe('ニコチン、限界です。')
  })

  it('見出しは 1 行の文字列で、配列ではない', () => {
    expect(typeof death_message(0)).toBe('string')
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npx vitest run source/death-screen-model.test.ts`
Expected: FAIL。`death_message(0)` が配列を返すため `toBe('死亡したよ、高木。')` が不一致になる

- [ ] **Step 3: `death-screen-model.ts` を書き換える**

ファイル全体を次に置き換える。`nicotine` の import が消えて実行時依存ゼロの葉モジュールになる。

```ts
// 死亡画面の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（meta.ts と同じ扱い）。実行時 import を
// 一切持たない。

export const death_cause_nicotine = 1

// run_end() が組み立てて death_screen_show() に渡す。state を直接読ませない
// のは、死亡画面の表示中に次のランが state を書き換えても表示が変わらないため。
// 獲得ヤニの内訳は持たない。run_end() が先に meta.yani へ合算し、
// 画面には合算後の残高だけを出す（内訳表示は無い）
export interface run_result_t {
  depth: number
  kills: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  // 更新前のベスト深度。run_end() は meta.best_depth を先に更新してから
  // この画面を出すので、控えておかないと記録更新を判定できない
  best_depth_before: number
}

export function format_run_time(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

// 死因は見出し 1 行だけが担う。体調パネル（赤い箱）を消したので、ここが
// 画面で唯一の「敵に殺されたのか、ゲージが尽きたのか」の出どころになる。
// 2 行目の励ましは、死を 2 回説明することになるため置かない
export function death_message(cause: number): string {
  return cause === death_cause_nicotine ? 'ニコチン、限界です。' : '死亡したよ、高木。'
}

// 旧ベストが 0（＝未プレイ）のときは出さない。初回のランで 1F に届いただけの
// 記録を「更新」として祝うと、演出そのものの意味が薄れる
export function is_new_record(depth: number, best_before: number): boolean {
  return best_before > 0 && depth > best_before
}
```

- [ ] **Step 4: `game.ts` から `nicotine_ratio` の書き込みを消す**

`source/game.ts:123` の次の 1 行を削除する。

```ts
    nicotine_ratio: state.nicotine / state.nicotine_max,
```

- [ ] **Step 5: `death-screen.ts` から状態パネルを消す**

3 箇所を編集する。

(a) import から `condition_texts` と `body_url` を外す。

```ts
import {
  death_message, format_run_time, is_new_record,
} from './death-screen-model'
```

`import body_url from '../m/ui/body.webp'` の行を削除する。

(b) `blocks()` 関数を丸ごと削除する（状態パネル専用のヘルパーで、他に呼び出し元が無い）。

(c) `render()` の中で、見出しを死因から引くように変え、状態パネルのブロックを削除する。

```ts
  let left = '<h1 class="ds-title">' +
    (dead ? death_message(r.death_cause) : '自席の端末。') + '</h1>' +
    '<p class="ds-sub">' +
    (dead ? '救護ドローンが君を回収して、自席へ戻した。' : '闇サイトに接続した。') +
    '</p>'
```

そして `if (dead) { ... }` の中の、記録パネルの後にある状態パネルのブロック（`// 体調は死因の説明であって…` のコメントから `left += '<div class="ds-status">' ... '</div>'` の終わりまで）を削除する。

- [ ] **Step 6: `death-screen.css` から状態パネルの規則を消す**

次のセレクタの規則を削除する。`/* 状態パネル（赤）。死亡モードのみ表示。… */` のコメントブロックも一緒に消す。

```
#ds .ds-status
#ds .ds-death-message
#ds .ds-status img
#ds .ds-gauge-row
#ds .ds-gauge-row b
#ds .ds-cond-line
#ds .ds-cond-line b
#ds .ds-cond-line b:last-child
#ds .ds-blocks
#ds .ds-blocks i
#ds .ds-blocks i.off
```

- [ ] **Step 7: テストと型チェックを通す**

Run: `npm test`
Expected: PASS（`death-screen-model.test.ts` の 3 件が緑。他のスイートに変化なし）

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 8: 変異で、テストが本当に効いていることを確かめる**

`death_message()` の三項演算子の条件を `cause !== death_cause_nicotine` に反転して `npx vitest run source/death-screen-model.test.ts` を走らせる。

Expected: 「敵に殺されたときは既定の見出しを返す」と「ニコチン切れは別の見出しで死因が分かる」の 2 件が落ちる。確認したら元に戻す。

- [ ] **Step 9: コミット**

```bash
git add source/death-screen-model.ts source/death-screen-model.test.ts source/death-screen.ts source/death-screen.css source/game.ts
git commit -m "$(cat <<'EOF'
体調 3 項目を削除し、死因を見出しへ移す

手の震え・集中力・吸いたい気持ちの赤い状態パネルを削除する。死を画面上部の
見出しと赤い箱の 2 か所で説明していたのをやめ、1 か所に寄せる。

死因の区別はこの箱の中にしか無かった（見出しは死因によらず常に同じ文言
だった）ので、death_message() を見出し 1 行を返す関数へ変えて拾い直す。
敵は「死亡したよ、高木。」、ニコチン切れは「ニコチン、限界です。」。

condition_texts() と run_result_t.nicotine_ratio、game.ts の書き込み 1 行も
消える。death-screen-model.ts は nicotine.ts への依存が無くなり、実行時
import を持たない葉モジュールになった。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 状態機械と強調階層

キー入力から次の状態を導く純関数を `death-screen-model.ts` に足す。この時点では誰も呼ばないが、Task 5 以降の土台になる。

**Files:**
- Modify: `source/death-screen-model.ts`
- Modify: `source/death-screen-model.test.ts`

**Interfaces:**
- Consumes: Task 1 の `death-screen-model.ts`
- Produces:
  - `ds_state_t { mode: 'idle' | 'upgrade', focus: number, panel: 'none' | 'record' | 'gear', busy: boolean }`
  - `ds_layer_t = 'active' | 'dim' | 'inactive'`
  - `ds_action_t = 'none' | 'descend' | 'buy'`
  - `ds_result_t { state: ds_state_t, action: ds_action_t }`
  - `ds_initial_state(): ds_state_t`
  - `ds_reduce(state: ds_state_t, key: string): ds_result_t`
  - `ds_part_layer(state: ds_state_t, index: number): ds_layer_t`
  - `ds_item_layer(state: ds_state_t, index: number): ds_layer_t`
  - 定数 `ds_idle_record = 0` / `ds_idle_gear = 1` / `ds_idle_descend = 2` / `ds_idle_count = 3` / `ds_part_count = 6`

- [ ] **Step 1: 失敗するテストを書く**

`source/death-screen-model.test.ts` の末尾に追加する。import 行にも新しい名前を足すこと。

```ts
import {
  ds_idle_descend, ds_idle_gear, ds_idle_record, ds_initial_state,
  ds_item_layer, ds_part_count, ds_part_layer, ds_reduce,
} from './death-screen-model'
import type { ds_state_t } from './death-screen-model'

// テストごとに開始状態を組み立てる。入場シーケンスが終わった直後（busy = false）
// を既定にする
function idle(over: Partial<ds_state_t> = {}): ds_state_t {
  return { ...ds_initial_state(), busy: false, ...over }
}

describe('死亡画面の状態機械', () => {
  it('初期状態は idle・地下へ戻るにフォーカス・入場中は busy', () => {
    const s = ds_initial_state()
    expect(s.mode).toBe('idle')
    expect(s.focus).toBe(ds_idle_descend)
    expect(s.panel).toBe('none')
    expect(s.busy).toBe(true)
  })

  it('busy 中はどのキーも状態を変えない', () => {
    const s = idle({ busy: true })
    for (const key of ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown']) {
      const r = ds_reduce(s, key)
      expect(r.state).toBe(s)
      expect(r.action).toBe('none')
    }
  })

  it('Tab で強化モードへ入り、先頭の部位を選ぶ', () => {
    const r = ds_reduce(idle(), 'Tab')
    expect(r.state.mode).toBe('upgrade')
    expect(r.state.focus).toBe(0)
  })

  it('Tab をもう一度押すと idle へ戻り、地下へ戻るへフォーカスが載る', () => {
    const r = ds_reduce(idle({ mode: 'upgrade', focus: 3 }), 'Tab')
    expect(r.state.mode).toBe('idle')
    expect(r.state.focus).toBe(ds_idle_descend)
  })

  it('idle の矢印は 3 項目を巡回する', () => {
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'ArrowDown').state.focus)
      .toBe(ds_idle_gear)
    // 末尾から前へ回り込む
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'ArrowUp').state.focus)
      .toBe(ds_idle_descend)
  })

  it('強化モードの矢印は 6 部位を解剖順に巡回する', () => {
    expect(ds_reduce(idle({ mode: 'upgrade', focus: 5 }), 'ArrowDown').state.focus).toBe(0)
    expect(ds_reduce(idle({ mode: 'upgrade', focus: 0 }), 'ArrowUp').state.focus)
      .toBe(ds_part_count - 1)
  })

  it('← ↑ と → ↓ は同じ向きに動く', () => {
    const s = idle({ mode: 'upgrade', focus: 2 })
    expect(ds_reduce(s, 'ArrowLeft').state.focus).toBe(ds_reduce(s, 'ArrowUp').state.focus)
    expect(ds_reduce(s, 'ArrowRight').state.focus).toBe(ds_reduce(s, 'ArrowDown').state.focus)
  })

  it('idle の Enter は、フォーカス位置ごとに違うことをする', () => {
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'Enter').state.panel).toBe('record')
    expect(ds_reduce(idle({ focus: ds_idle_gear }), 'Enter').state.panel).toBe('gear')
    expect(ds_reduce(idle({ focus: ds_idle_descend }), 'Enter').action).toBe('descend')
  })

  it('強化モードの Enter は購入を要求する（状態は動かない）', () => {
    const s = idle({ mode: 'upgrade', focus: 2 })
    const r = ds_reduce(s, 'Enter')
    expect(r.action).toBe('buy')
    expect(r.state.focus).toBe(2)
    expect(r.state.mode).toBe('upgrade')
  })

  // Esc は「1 段戻る」。この 3 段の順序がこの画面の操作の背骨になる
  it('Esc はパネル → 強化モード → 降下 の順に 1 段ずつ戻る', () => {
    const opened = idle({ mode: 'upgrade', focus: 2, panel: 'record' })
    const closed = ds_reduce(opened, 'Escape')
    expect(closed.state.panel).toBe('none')
    expect(closed.state.mode).toBe('upgrade') // 強化モードは維持される
    expect(closed.action).toBe('none')

    const collapsed = ds_reduce(closed.state, 'Escape')
    expect(collapsed.state.mode).toBe('idle')
    expect(collapsed.action).toBe('none')

    expect(ds_reduce(collapsed.state, 'Escape').action).toBe('descend')
  })

  it('パネル表示中は Esc 以外を受け付けない', () => {
    const s = idle({ panel: 'record' })
    for (const key of ['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const r = ds_reduce(s, key)
      expect(r.state).toBe(s)
      expect(r.action).toBe('none')
    }
  })

  it('知らないキーは何もしない', () => {
    const s = idle()
    expect(ds_reduce(s, 'a').state).toBe(s)
  })
})

describe('強調階層', () => {
  it('強化モードでは選択部位だけが active、残りは dim', () => {
    const s = idle({ mode: 'upgrade', focus: 3 })
    expect(ds_part_layer(s, 3)).toBe('active')
    expect(ds_part_layer(s, 0)).toBe('dim')
  })

  // idle で部位を inactive にすると、この画面の主役が沈んでしまう。
  // 触れないが「押せそう」に見えている必要がある
  it('idle では部位はどれも dim で、active にはならない', () => {
    const s = idle()
    for (let i = 0; i < ds_part_count; i++) { expect(ds_part_layer(s, i)).toBe('dim') }
  })

  it('idle では選択項目が active、残りは dim', () => {
    const s = idle({ focus: ds_idle_gear })
    expect(ds_item_layer(s, ds_idle_gear)).toBe('active')
    expect(ds_item_layer(s, ds_idle_record)).toBe('dim')
  })

  it('強化モードでは記録確認と装備確認が inactive へ落ちる', () => {
    const s = idle({ mode: 'upgrade', focus: 0 })
    expect(ds_item_layer(s, ds_idle_record)).toBe('inactive')
    expect(ds_item_layer(s, ds_idle_descend)).toBe('inactive')
  })

  it('パネル表示中は部位も項目もすべて inactive', () => {
    const s = idle({ panel: 'gear' })
    expect(ds_part_layer(s, 0)).toBe('inactive')
    expect(ds_item_layer(s, ds_idle_descend)).toBe('inactive')
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npx vitest run source/death-screen-model.test.ts`
Expected: FAIL。`ds_reduce is not a function` などの未定義エラー

- [ ] **Step 3: 状態機械を実装する**

`source/death-screen-model.ts` の末尾に追加する。

```ts
// --- 状態機械 ---
//
// 画面の状態はこの 1 オブジェクトに閉じる。death-screen.ts は返ってきた
// 状態と直前の状態を比べて class を当てるだけで、分岐を持たない。

export type ds_mode_t = 'idle' | 'upgrade'
export type ds_panel_t = 'none' | 'record' | 'gear'
export type ds_layer_t = 'active' | 'dim' | 'inactive'
// 状態の変化では表せない副作用だけを action にする。パネルの開閉は状態が
// 語るので action を持たない
export type ds_action_t = 'none' | 'descend' | 'buy'

// idle のフォーカス位置。地下へ戻るを既定にするので末尾に置く
export const ds_idle_record = 0
export const ds_idle_gear = 1
export const ds_idle_descend = 2
export const ds_idle_count = 3

export const ds_part_count = 6

export interface ds_state_t {
  mode: ds_mode_t
  focus: number // idle: 0..2、upgrade: 0..5（body_parts の添字）
  panel: ds_panel_t
  busy: boolean // 入場シーケンスと強化演出の再生中
}

export interface ds_result_t {
  state: ds_state_t
  action: ds_action_t
}

// 既定のフォーカスが「地下へ戻る」なのは、この画面の最終的なメインアクション
// だから。開いた瞬間に「地下へ戻れる」が読めることを最優先する。
// busy = true で始めるのは入場シーケンスが終わるまで入力を捨てるため
export function ds_initial_state(): ds_state_t {
  return { mode: 'idle', focus: ds_idle_descend, panel: 'none', busy: true }
}

export function ds_reduce(state: ds_state_t, key: string): ds_result_t {
  const stay: ds_result_t = { state, action: 'none' }
  // 演出の途中で状態が動くと、収納と展開が同時に走って読めなくなる
  if (state.busy) { return stay }

  // パネルは矢印も Tab も奪わない。開いている間の出口は Esc だけ
  if (state.panel !== 'none') {
    return key === 'Escape'
      ? { state: { ...state, panel: 'none' }, action: 'none' }
      : stay
  }

  const to_idle: ds_result_t = {
    state: { ...state, mode: 'idle', focus: ds_idle_descend }, action: 'none',
  }

  if (key === 'Tab') {
    return state.mode === 'upgrade'
      ? to_idle
      : { state: { ...state, mode: 'upgrade', focus: 0 }, action: 'none' }
  }

  // Esc は「1 段戻る」。パネル（上で処理済み）→ 強化モード → 降下 の順
  if (key === 'Escape') {
    return state.mode === 'upgrade' ? to_idle : { state, action: 'descend' }
  }

  const count = state.mode === 'upgrade' ? ds_part_count : ds_idle_count
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return { state: { ...state, focus: (state.focus + count - 1) % count }, action: 'none' }
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return { state: { ...state, focus: (state.focus + 1) % count }, action: 'none' }
  }

  if (key === 'Enter') {
    if (state.mode === 'upgrade') { return { state, action: 'buy' } }
    if (state.focus === ds_idle_record) {
      return { state: { ...state, panel: 'record' }, action: 'none' }
    }
    if (state.focus === ds_idle_gear) {
      return { state: { ...state, panel: 'gear' }, action: 'none' }
    }
    return { state, action: 'descend' }
  }

  return stay
}

// 強化アイコンの強調階層。idle で dim に留めるのは、触れないが「押せそう」に
// 見えている必要があるため — この 6 個がこの画面の主役で、inactive まで
// 落とすと Tab を押す動機が画面から消える
export function ds_part_layer(state: ds_state_t, index: number): ds_layer_t {
  if (state.panel !== 'none') { return 'inactive' }
  if (state.mode !== 'upgrade') { return 'dim' }
  return state.focus === index ? 'active' : 'dim'
}

// 記録確認 / 装備確認 / 地下へ戻る の強調階層
export function ds_item_layer(state: ds_state_t, index: number): ds_layer_t {
  if (state.panel !== 'none' || state.mode === 'upgrade') { return 'inactive' }
  return state.focus === index ? 'active' : 'dim'
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run source/death-screen-model.test.ts`
Expected: PASS（全件）

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: 変異で、テストが効いていることを確かめる**

1 つずつ入れて、狙ったテストだけが落ちることを確認し、毎回戻す。

| 変異 | 落ちるべきテスト |
| --- | --- |
| `if (state.busy) { return stay }` を削除 | 「busy 中はどのキーも状態を変えない」 |
| `Escape` の分岐で `state.mode === 'upgrade'` を `false` に固定 | 「Esc はパネル → 強化モード → 降下 の順に 1 段ずつ戻る」 |
| `ds_part_layer` の `if (state.mode !== 'upgrade') { return 'dim' }` を削除 | 「idle では部位はどれも dim で、active にはならない」 |
| パネル分岐の `key === 'Escape'` を `key === 'Enter'` に | 「パネル表示中は Esc 以外を受け付けない」と Esc の順序テスト |

Expected: 各変異でそれぞれ該当テストのみが落ちる

- [ ] **Step 6: コミット**

```bash
git add source/death-screen-model.ts source/death-screen-model.test.ts
git commit -m "$(cat <<'EOF'
死亡画面の状態機械と強調階層を追加する

画面の状態を { mode, focus, panel, busy } の 1 オブジェクトに閉じ、遷移を
ds_reduce() の純関数 1 本にする。DOM を持たないので Node のテストで網羅
できる。この時点では呼び出し元はまだ無い。

Esc は「1 段戻る」に統一した。パネルが開いていれば閉じ、強化モードなら
収納し、どちらでもなければ降下する。

状態の変化で表せない副作用（降下・購入）だけを action として返す。パネルの
開閉は状態そのものが語るので action を持たせない。

ds_part_layer() が idle で dim を返すのは意図。この 6 個が画面の主役で、
inactive まで落とすと Tab を押す動機が画面から消える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 人体模型のジオメトリ

`body.webp` の実測に合わせた座標と、器官の SVG マークアップを持つ葉モジュールを作る。

**Files:**
- Create: `source/body-figure.ts`
- Create: `source/body-figure.test.ts`

**Interfaces:**
- Consumes: `meta_upgrade_id_t` / `meta_upgrade_ids`（`./meta`）、`gear_slot_t` / `gear_slots`（`./equipment`）
- Produces:
  - `body_width = 256` / `body_height = 512` / `figure_view_box = '-80 -10 416 532'`
  - `body_part_t { id, label, ax, ay, ix, iy }`
  - `body_parts: body_part_t[]`（解剖順の 6 要素）
  - `body_stow_ratio = 0.3`
  - `body_stow_position(part: body_part_t): { x: number, y: number }`
  - `gear_anchors: Record<gear_slot_t, { x: number, y: number }>`
  - `organ_svg: Record<meta_upgrade_id_t, string>`

- [ ] **Step 1: 失敗するテストを書く**

`source/body-figure.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import {
  body_height, body_parts, body_stow_position, body_stow_ratio, body_width,
  gear_anchors, organ_svg,
} from './body-figure'
import { meta_upgrade_ids } from './meta'
import { gear_slots } from './equipment'

// body.webp（256×512）の線の bbox。tools で実測した値で、アンカーが身体から
// 外れていないことの基準になる
const bbox = { x0: 48, x1: 208, y0: 14, y1: 491 }

describe('人体模型のジオメトリ', () => {
  it('6 部位が強化 6 種と 1:1 で対応する', () => {
    expect(body_parts.length).toBe(meta_upgrade_ids.length)
    expect([...body_parts.map((p) => p.id)].sort())
      .toEqual([...meta_upgrade_ids].sort())
  })

  it('アンカーは body.webp の線の内側にある', () => {
    for (const p of body_parts) {
      expect(p.ax, p.label).toBeGreaterThanOrEqual(bbox.x0)
      expect(p.ax, p.label).toBeLessThanOrEqual(bbox.x1)
      expect(p.ay, p.label).toBeGreaterThanOrEqual(bbox.y0)
      expect(p.ay, p.label).toBeLessThanOrEqual(bbox.y1)
    }
  })

  it('解剖順に上から下へ並ぶ（矢印キーの巡回順そのもの）', () => {
    for (let i = 1; i < body_parts.length; i++) {
      expect(body_parts[i].ay, body_parts[i].label)
        .toBeGreaterThanOrEqual(body_parts[i - 1].ay)
    }
  })

  it('アイコンは身体の外に出る', () => {
    for (const p of body_parts) {
      const outside = p.ix < bbox.x0 || p.ix > bbox.x1
      expect(outside, p.label).toBe(true)
    }
  })

  it('左右それぞれ 3 個ずつに分かれる', () => {
    const left = body_parts.filter((p) => p.ix < 0)
    const right = body_parts.filter((p) => p.ix > body_width)
    expect(left.length).toBe(3)
    expect(right.length).toBe(3)
  })

  // 同じ側で近すぎると、アイコンとその発光が重なって別々の項目に見えない
  it('同じ側のアイコンは縦に 60 以上離れる', () => {
    for (const left of [true, false]) {
      const ys = body_parts
        .filter((p) => (left ? p.ix < 0 : p.ix > body_width))
        .map((p) => p.iy)
        .sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('収納位置はアンカーとアイコンの間にあり、アンカー寄りである', () => {
    for (const p of body_parts) {
      const s = body_stow_position(p)
      // アンカーとアイコンを結ぶ線分の内分点
      expect(s.x, p.label).toBeCloseTo(p.ax + (p.ix - p.ax) * body_stow_ratio, 6)
      expect(s.y, p.label).toBeCloseTo(p.ay + (p.iy - p.ay) * body_stow_ratio, 6)
      // 半分より手前（＝身体の脇に寄っている）
      expect(Math.abs(s.x - p.ax), p.label).toBeLessThan(Math.abs(p.ix - p.ax) / 2)
    }
  })

  it('装備アンカー 3 点は身体の線の内側にある', () => {
    for (const slot of gear_slots) {
      const a = gear_anchors[slot]
      expect(a.x, slot).toBeGreaterThanOrEqual(bbox.x0)
      expect(a.x, slot).toBeLessThanOrEqual(bbox.x1)
      expect(a.y, slot).toBeGreaterThanOrEqual(bbox.y0)
      expect(a.y, slot).toBeLessThanOrEqual(bbox.y1)
    }
  })

  it('器官のマークアップが 6 種すべてにある', () => {
    for (const id of meta_upgrade_ids) {
      expect(organ_svg[id], id).toBeTruthy()
    }
  })

  it('下地の寸法は body.webp そのもの', () => {
    expect(body_width).toBe(256)
    expect(body_height).toBe(512)
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npx vitest run source/body-figure.test.ts`
Expected: FAIL。`Failed to resolve import "./body-figure"`

- [ ] **Step 3: `body-figure.ts` を実装する**

`source/body-figure.ts` を新規作成する。

```ts
// 人体模型のジオメトリ。DOM を触らず、Node（Vitest）でモックなしに評価できる
// ことが条件（death-screen-model.ts と同じ扱い）。
//
// 座標系は下地 m/ui/body.webp（256×512）そのもの。実測した線の bbox は
// x 48〜208 / y 14〜491 で、内訳は 頭 y14〜78・胸 y96〜176・手 y262（x56 と
// x200）・腰 y248・脚 y304〜491。アンカーはこの実測から採っている。
//
// 器官は手描きのパスではなく ellipse と polyline だけで組む。実測アンカーから
// ずれたときに直しやすく、医療図の模式図という狙いにも合う。

import type { gear_slot_t } from './equipment'
import type { meta_upgrade_id_t } from './meta'

export const body_width = 256
export const body_height = 512

// アイコンを身体の外へ置くため、viewBox は下地より広い。左は -80、右は
// 336 まで取り、アイコン（半径 22）の発光がはみ出さない余白を含む
export const figure_view_box = '-80 -10 416 532'

export interface body_part_t {
  id: meta_upgrade_id_t
  label: string // 部位名。アイコンの alt と器官 <g> の識別に使う
  ax: number // 身体側のアンカー
  ay: number
  ix: number // 強化モードでのアイコン定位置
  iy: number
}

// 解剖順（上から下）。矢印キーはこの順で巡回する。
// アイコンの左右は接続線が互いに交差しない組み合わせを選んだ結果で、
// 右＝脳・肺・腰、左＝鼻・手・脚 になる
export const body_parts: body_part_t[] = [
  { id: 'tolerance', label: '脳', ax: 128, ay: 40, ix: 290, iy: 30 },
  { id: 'sniff', label: '鼻', ax: 128, ay: 58, ix: -34, iy: 70 },
  { id: 'lung', label: '肺', ax: 128, ay: 135, ix: 290, iy: 140 },
  { id: 'power', label: '手', ax: 56, ay: 262, ix: -34, iy: 240 },
  { id: 'spare', label: '腰', ax: 160, ay: 248, ix: 290, iy: 300 },
  { id: 'leg', label: '脚', ax: 128, ay: 360, ix: -34, iy: 370 },
]

// 初期状態のアイコンは身体のすぐ脇に寄り、強化モードで外側の定位置へ飛び出す。
// 2 組の座標を持たず、この比率 1 つから導出する
export const body_stow_ratio = 0.3

export function body_stow_position(part: body_part_t): { x: number, y: number } {
  return {
    x: part.ax + (part.ix - part.ax) * body_stow_ratio,
    y: part.ay + (part.iy - part.ay) * body_stow_ratio,
  }
}

// 装備カードを引き出す 3 点。刃物は右手、ソールは右足、パッチは胸。
// いずれもカードが右へ展開するので、線が身体を横切らない側を選んでいる
export const gear_anchors: Record<gear_slot_t, { x: number, y: number }> = {
  blade: { x: 200, y: 262 },
  sole: { x: 155, y: 478 },
  patch: { x: 128, y: 150 },
}

// 器官の中身。既定は不可視で、フォーカスと強化演出のときだけ光る。
// class は death-screen.css が受ける（ds-o-* は演出で個別に動かす部品）
export const organ_svg: Record<meta_upgrade_id_t, string> = {
  // 脳と、脊椎から四肢へ降りる神経ライン。ニコチン耐性のパルスがここを流れる
  tolerance:
    '<ellipse class="ds-o-brain" cx="128" cy="42" rx="17" ry="13"/>' +
    '<polyline class="ds-o-nerve" points="128,58 128,96 128,212"/>' +
    '<polyline class="ds-o-nerve" points="128,110 96,150 62,250"/>' +
    '<polyline class="ds-o-nerve" points="128,110 160,150 194,250"/>' +
    '<polyline class="ds-o-nerve" points="128,212 110,330 100,470"/>' +
    '<polyline class="ds-o-nerve" points="128,212 146,330 156,470"/>',
  // 鼻と、外から吸い込まれてくる煙の軌跡 6 本
  sniff:
    '<path class="ds-o-nose" d="M122 50l6 14h-6"/>' +
    '<polyline class="ds-o-smoke" points="60,20 96,42 124,56"/>' +
    '<polyline class="ds-o-smoke" points="56,64 92,60 124,58"/>' +
    '<polyline class="ds-o-smoke" points="66,108 98,80 124,62"/>' +
    '<polyline class="ds-o-smoke" points="196,20 160,42 132,56"/>' +
    '<polyline class="ds-o-smoke" points="200,64 164,60 132,58"/>' +
    '<polyline class="ds-o-smoke" points="190,108 158,80 132,62"/>',
  // 左右の肺と気管。膨張はこの 2 つの ellipse を scale する
  lung:
    '<ellipse class="ds-o-lung ds-o-lung-l" cx="106" cy="136" rx="21" ry="31"/>' +
    '<ellipse class="ds-o-lung ds-o-lung-r" cx="150" cy="136" rx="21" ry="31"/>' +
    '<polyline class="ds-o-trachea" points="128,88 128,116 106,132"/>' +
    '<polyline class="ds-o-trachea" points="128,116 150,132"/>',
  // 肩から手へ降りる腕のラインと、両手の輪。反動はこの <g> ごと動かす
  power:
    '<polyline class="ds-o-arm" points="88,104 70,180 56,254"/>' +
    '<polyline class="ds-o-arm" points="168,104 186,180 200,254"/>' +
    '<circle class="ds-o-hand" cx="56" cy="264" r="10"/>' +
    '<circle class="ds-o-hand" cx="200" cy="264" r="10"/>',
  // 腰のポケットと、そこへ収まる煙草 1 本
  spare:
    '<rect class="ds-o-pocket" x="146" y="238" width="26" height="22" rx="3"/>' +
    '<line class="ds-o-cig" x1="152" y1="242" x2="166" y2="242"/>',
  // 骨盤から足へ降りる脚のラインと、足元の接地点
  leg:
    '<polyline class="ds-o-leg" points="118,230 110,318 104,404 100,470"/>' +
    '<polyline class="ds-o-leg" points="138,230 146,318 152,404 156,470"/>' +
    '<ellipse class="ds-o-ground" cx="128" cy="488" rx="46" ry="8"/>',
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run source/body-figure.test.ts`
Expected: PASS（全件）

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: 変異で、テストが効いていることを確かめる**

| 変異 | 落ちるべきテスト |
| --- | --- |
| `body_parts` の `leg` を先頭へ移動 | 「解剖順に上から下へ並ぶ」 |
| `sniff` の `ix: -34` を `ix: 128` に | 「アイコンは身体の外に出る」「左右それぞれ 3 個ずつに分かれる」 |
| `body_stow_ratio` を `0.7` に | 「収納位置は…アンカー寄りである」 |
| `gear_anchors.sole` の `y: 478` を `y: 600` に | 「装備アンカー 3 点は身体の線の内側にある」 |

Expected: 各変異でそれぞれ該当テストのみが落ちる。確認したら戻す

- [ ] **Step 6: コミット**

```bash
git add source/body-figure.ts source/body-figure.test.ts
git commit -m "$(cat <<'EOF'
人体模型のジオメトリを追加する

body.webp（256×512）の線を実測して得た bbox（x 48〜208 / y 14〜491）に
6 部位のアンカーを合わせる。頭 y14〜78、胸 y96〜176、手 y262（x56 と x200）、
腰 y248、脚 y304〜491。

アイコンの左右は、接続線が互いに交差しない組み合わせを選んだ結果として
右＝脳・肺・腰、左＝鼻・手・脚 になった。収納位置は座標を 2 組持たず、
アンカーとアイコンを結ぶ線分の 30% 地点として導出する。

器官は手描きのパスではなく ellipse と polyline で組む。実測アンカーから
ずれたときに直しやすく、医療図の模式図という狙いにも合う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 装備アイコンを共有モジュールへ切り出す

装備確認パネル（Task 9）が同じ 30 枚を要る。30 行の静的 import を 2 か所に書き写さないよう、先に切り出す。

**Files:**
- Create: `source/gear-icons.ts`
- Modify: `source/equip-screen.ts`

**Interfaces:**
- Consumes: `gear_slot_t`（`./equipment`）
- Produces: `gear_icons: Record<gear_slot_t, string[]>`（添字は `tier - 1`。10 要素ずつ）

- [ ] **Step 1: `gear-icons.ts` を作る**

`source/equip-screen.ts` の 14 行目から始まる 30 本の `import ... from '../m/ui/gear-*.webp'` と、`const gear_icons: Record<gear_slot_t, string[]> = { ... }` のテーブルを、新しいファイルへそのまま移す。テーブルには `export` を付ける。

```ts
// 装備アイコン 30 枚のテーブル。開封ダイアログ（equip-screen.ts）と死亡画面の
// 装備確認パネル（death-screen.ts）の両方が読む唯一の出どころ。
//
// 画像は静的 import しか使えない。'../m/ui/gear-' + id + '.webp' のような
// 文字列連結は Vite が静的に検出できず、本番ビルドで 404 になる
// （docs/architecture.md）。だから 30 行を並べてテーブルに詰める。
//
// 添字は tier - 1（段は 1 始まり、配列は 0 始まり）。

import type { gear_slot_t } from './equipment'

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

export const gear_icons: Record<gear_slot_t, string[]> = {
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
```

**注意:** `equip-screen.ts` の実際の import 順を確認して写すこと。上の順（blade → patch → sole）は現行ファイルの並びに合わせてある。

- [ ] **Step 2: `equip-screen.ts` から移した分を消し、import に差し替える**

30 本の `import ... webp` 行と `const gear_icons = {...}` のテーブル（およびその直前の「画像は静的 import しか使えない」コメントブロック）を削除し、代わりに他の import と並べて 1 行足す。

```ts
import { gear_icons } from './gear-icons'
```

- [ ] **Step 3: 型チェックとテストで回帰がないことを確認する**

Run: `npm run typecheck`
Expected: エラーなし

Run: `npm test`
Expected: PASS。Task 3 までと同じ件数（減っていないこと）

- [ ] **Step 4: 本番ビルドで画像が落ちていないことを確認する**

静的 import をファイル間で移すと、Vite が検出できなくなって本番ビルドから画像が消える事故が起こりうる。ここだけは実ビルドで確かめる。

Run: `npm run build`
Expected: 成功する

Run: `ls dist/assets | grep -c gear-`
Expected: 30（4096 バイト未満はデータ URI として埋め込まれるが、装備アイコンはすべて 4KB 超なので 30 枚とも別ファイルとして出る）

- [ ] **Step 5: コミット**

```bash
git add source/gear-icons.ts source/equip-screen.ts
git commit -m "$(cat <<'EOF'
装備アイコン 30 枚を共有モジュールへ切り出す

死亡画面の装備確認パネルが同じ 30 枚を要る。静的 import しか使えない以上
30 行のテーブルになるので、2 か所に書き写さないよう gear-icons.ts へ寄せる。

equip-screen.ts の挙動は変わらない。dist/assets に gear-* が 30 枚出ることを
実ビルドで確認済み（ファイル間で静的 import を移すと Vite が検出できなくなる
事故がありうるため）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 永続 DOM の骨格と Level 1

`death-screen.ts` を全面書き換えして、DOM を 1 度だけ組む形にする。この Task の終わりで、初期状態（①）が正しく出て、矢印と Tab でフォーカスが動くところまでを完成させる。強化モードの展開演出・詳細パネル・記録/装備パネル・降下演出は以降の Task で足す。

**Files:**
- Modify: `source/death-screen.ts`（全面書き換え）
- Modify: `source/death-screen.css`（全面書き換え）

**Interfaces:**
- Consumes: Task 2 の状態機械一式、Task 3 の `body_parts` / `figure_view_box` / `body_stow_position` / `organ_svg`、既存の `upgrade_rows` / `meta` / `meta_max_level` / `meta_upgrade_price`
- Produces: `death_screen_show(result: run_result_t | null, on_start: () => void): void`（シグネチャは現行のまま）。DOM の class 契約（下記）

### DOM の骨格

`death_screen_show()` が最初の 1 回だけ組む。以降 `innerHTML` を書き換えるのは、記録パネルと装備パネルの中身（表示のたびに内容が変わるが、アニメーションを持たない行だけ）に限る。

```html
<div id="ds">
  <div class="ds-bg"></div>
  <div class="ds-scrim"></div>
  <div class="ds-well"></div>

  <h1 class="ds-title"></h1>
  <p class="ds-sub"></p>

  <div class="ds-yani">
    <img class="ds-yani-icon" alt="">
    <span class="ds-yani-label">ヤニ</span>
    <b class="ds-yani-value">0</b>
    <div class="ds-yani-warn">警告: ストレージ利用不可。強化はこのセッション限りで消える</div>
  </div>

  <div class="ds-menu">
    <button class="ds-item" data-item="0">記録確認</button>
    <button class="ds-item" data-item="1">装備確認</button>
  </div>

  <div class="ds-figure">
    <svg class="ds-svg" viewBox="-80 -10 416 532">
      <g class="ds-wires">
        <!-- 部位ごとに 1 本。x1/y1 = アンカー、x2/y2 = アイコン定位置 -->
        <line class="ds-wire" data-part="tolerance" style="--i:0"/>
        ... 6 本
      </g>
      <!-- 下地は SVG の中に置く。SVG には z-index が無く重ね順は文書順で
           決まるので、接続線 → 下地 → 器官 → アイコン を成立させるには
           <image> として同じ木に入れるしかない -->
      <image class="ds-body" x="0" y="0" width="256" height="512"/>
      <g class="ds-organs">
        <g class="ds-organ" data-part="tolerance">…organ_svg.tolerance…</g>
        ... 6 個
      </g>
      <g class="ds-icons">
        <g class="ds-part" data-part="tolerance" style="--i:0">
          <circle class="ds-arc-bg" r="21"/>
          <circle class="ds-arc" r="21"/>
          <image class="ds-part-icon" width="26" height="26"/>
          <path class="ds-check" d="M-6 0l4 5 8-10"/>
        </g>
        ... 6 個
      </g>
    </svg>
  </div>

  <div class="ds-hint">
    <span>[Tab] 強化</span><span>[Enter] 決定</span><span>[Esc] 地下へ戻る</span>
  </div>
</div>
```

`#ds` のルート class が全体のモードを表す。

| class | 意味 |
| --- | --- |
| `mode-idle` / `mode-upgrade` | 状態機械の `mode` |
| `panel-none` / `panel-record` / `panel-gear` | 状態機械の `panel` |
| `busy` | 入力を受け付けない（入場シーケンス中・演出中） |
| `boot` | `result === null` の初回起動モード |

各 `.ds-part` と `.ds-item` は `active` / `dim` / `inactive` のいずれか 1 つを持つ。

- [ ] **Step 1: `death-screen.ts` を書き換える**

現行ファイルを次に置き換える。

```ts
import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import {
  body_height, body_parts, body_stow_position, body_width, figure_view_box, organ_svg,
} from './body-figure'
import { canvas } from './dom'
import {
  death_message, ds_idle_descend, ds_idle_gear, ds_idle_record, ds_initial_state,
  ds_item_layer, ds_part_layer, ds_reduce,
} from './death-screen-model'
import type { ds_state_t, run_result_t } from './death-screen-model'
import { meta, meta_buy, meta_max_level, meta_upgrade_price } from './meta'
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
    '<div class="ds-hint">' +
    '<span>[Tab] 強化</span><span>[Enter] 決定</span>' +
    '<span>[Esc] 地下へ戻る</span></div>'

  document.body.appendChild(el)

  el.querySelectorAll<HTMLButtonElement>('.ds-item').forEach((button) => {
    button.onclick = () => {
      state = { ...state, mode: 'idle', focus: Number(button.dataset.item) }
      dispatch('Enter')
    }
  })
  el.querySelectorAll<SVGGElement>('.ds-part').forEach((g, index) => {
    g.onclick = () => {
      state = { ...state, mode: 'upgrade', focus: index }
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

  text('.ds-yani-value', String(meta.yani))

  el.querySelectorAll<SVGGElement>('.ds-part').forEach((g, index) => {
    const part = body_parts[index]
    const level = meta.levels[part.id]
    const max = meta_max_level[part.id]
    const maxed = level >= max
    set_layer(g, ds_part_layer(state, index))
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
  // preventDefault() を外すとブラウザ既定のフォーカス移動が走る
  if (event.key === 'Tab') { event.preventDefault() }
  dispatch(event.key)
}

function buy(): void {
  if (meta_buy(body_parts[state.focus].id)) {
    audio_play(audio_sfx_pickup)
    apply()
  }
}

function descend(): void {
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  clearTimeout(entry_timer)
  root!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend_cb()
}
```

**注意:** この Task の時点では「地下へ戻る」ボタンがまだ DOM に無い。`ds_idle_descend` へのフォーカスは `Esc` / `Enter` で降下できる状態として動くが、見た目は Task 10 で足す。`ds_idle_record` / `ds_idle_gear` の import は Task 8 / 9 で使うので、この時点では**まだ import しない**（未使用 import は `tsc --noEmit` が落とす）。上の import 行から `ds_idle_descend` / `ds_idle_gear` / `ds_idle_record` を外しておくこと。

- [ ] **Step 2: `death-screen.css` を書き換える**

現行ファイルを次に置き換える。

```css
/* 死亡画面（リザルト＋闇サイト）。index.html の <style> とは独立
   （id 限定スタイルだけでなく、裸の型セレクタ（b / div:last-child）も
   index.html 側で #a 限定にしてあるため干渉しない）。
   寸法はすべて vw / vh 単位で、16:9 前後のアスペクト比を前提にしている。 */
#ds {
  position: fixed;
  inset: 0;
  display: none;
  box-sizing: border-box;
  background: #050805;
  color: #b9dcc4;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
  z-index: 10;
  user-select: none;
  overflow: hidden;
  /* 段階開示の刻み。--i を掛けて animation-delay にする */
  --step: 80ms;
  --ease-in: cubic-bezier(.2, .8, .2, 1);
  --ease-out: cubic-bezier(.6, 0, .8, .2);
}

/* --- 背景 3 枚 --- */

/* 16:9 では画像の高さの 38.5% にあたる帯が見える。center 16% で
   左＝高木の顔と煙草、右上＝張り紙、右下＝闇サイト端末 の構図になる。
   cover は縦にしか溢れないので background-position-x は効かない */
#ds .ds-bg {
  position: absolute;
  inset: 0;
  background-position: center 16%;
  background-size: cover;
  opacity: 0;
  animation: ds-bg-in 1.2s var(--ease-in) forwards;
}
#ds .ds-scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 100% at 50% 45%, rgba(5, 8, 5, .55) 0%, rgba(5, 8, 5, .88) 70%,
      rgba(3, 5, 3, .96) 100%),
    linear-gradient(90deg, rgba(3, 6, 4, .82) 0%, rgba(3, 6, 4, 0) 34%);
}
/* 模型の背後だけを落とす暗がり。背景で最も明るい 2 点（張り紙・端末画面）が
   模型と同じ右半分にあるため、これが無いと模型が読めない */
#ds .ds-well {
  position: absolute;
  inset: 0;
  background: radial-gradient(38% 62% at 60% 52%,
    rgba(2, 4, 3, .92) 0%, rgba(2, 4, 3, .55) 55%, rgba(2, 4, 3, 0) 100%);
}
/* 段階的な減光の専用レイヤー。ds-scrim の opacity を上げる形にすると 1 で
   頭打ちになって効かない（既に 1 のため）ので、別の膜として重ねる。
   ⑦ の「照明が落ちる」もこの 1 枚が担う */
#ds .ds-dim {
  position: absolute;
  inset: 0;
  background: #020403;
  opacity: 0;
  transition: opacity .35s var(--ease-in);
}
#ds.mode-upgrade .ds-dim { opacity: .22; }
#ds.panel-record .ds-dim, #ds.panel-gear .ds-dim { opacity: .42; }

/* --- 見出し --- */

#ds .ds-title {
  position: absolute;
  left: 4%;
  top: 5%;
  margin: 0;
  font-size: 2.2vw;
  font-weight: bold;
  color: #ffaa2b;
  text-shadow: 0 0 14px #f70;
  letter-spacing: .08em;
}
#ds .ds-sub {
  position: absolute;
  left: 4%;
  top: 10.5%;
  margin: 0;
  font-size: .95vw;
  color: #cfe8d8;
}
/* 3 秒後に存在感を落とす。死は 1 度伝われば十分で、以降は世界観の一部として
   背景に馴染ませる */
#ds.entering .ds-title { animation: ds-in-left .5s var(--ease-in) .15s both, ds-fade-back 1.2s var(--ease-in) 3s forwards; }
#ds.entering .ds-sub { animation: ds-in-left .5s var(--ease-in) .3s both, ds-fade-back 1.2s var(--ease-in) 3s forwards; }

/* --- ヤニ残高 --- */

#ds .ds-yani {
  position: absolute;
  right: 3%;
  top: 3%;
  text-align: right;
  font-size: .9vw;
  color: #e8c9a8;
  white-space: nowrap;
}
#ds .ds-yani-icon { width: 1.1vw; height: 1.1vw; vertical-align: middle; opacity: .8; }
#ds .ds-yani-value {
  margin-left: .5vw;
  font-size: 1.8vw;
  color: #ffaa2b;
  text-shadow: 0 0 10px #f70;
  vertical-align: middle;
}
#ds .ds-yani-warn {
  display: none;
  margin-top: .2vw;
  font-size: .75vw;
  color: #ff6b5e;
  max-width: 16vw;
  white-space: normal;
}
#ds.entering .ds-yani { animation: ds-in-up .5s var(--ease-in) 1.1s both; }

/* --- 記録確認 / 装備確認 --- */

#ds .ds-menu {
  position: absolute;
  left: 4%;
  top: 42%;
  display: flex;
  flex-direction: column;
  gap: .8vh;
}
#ds .ds-item {
  border: none;
  background: none;
  font: inherit;
  font-size: 1.1vw;
  letter-spacing: .12em;
  color: #b9dcc4;
  text-align: left;
  padding: .3vh 0;
  cursor: pointer;
  transition: opacity .25s var(--ease-in), text-shadow .25s var(--ease-in),
    transform .25s var(--ease-in);
}
/* フォーカスは枠でなく光と字間で示す */
#ds .ds-item::before { content: '［'; opacity: .5; }
#ds .ds-item::after { content: '］'; opacity: .5; }
#ds.entering .ds-menu { animation: ds-in-left .5s var(--ease-in) 1.25s both; }

/* --- 強調階層。枠線で囲わず明度・発光・拡大で示す --- */

.ds-item.active, .ds-part.active { opacity: 1; }
.ds-item.dim, .ds-part.dim { opacity: .65; }
.ds-item.inactive, .ds-part.inactive { opacity: .35; }
#ds .ds-item.active {
  color: #7fe0a8;
  text-shadow: 0 0 12px rgba(127, 224, 168, .9);
  transform: translateX(.4vw);
}

/* --- 人体模型 --- */

#ds .ds-figure {
  position: absolute;
  top: 50%;
  left: 60%;
  height: 66vh;
  /* viewBox 416:532 の比。下地と SVG が同じ箱に載る */
  aspect-ratio: 416 / 532;
  transform: translate(-50%, -50%);
  transition: opacity .35s var(--ease-in), transform .35s var(--ease-in);
}
#ds.panel-record .ds-figure, #ds.panel-gear .ds-figure { opacity: .3; }
#ds.entering .ds-figure { animation: ds-figure-in .8s var(--ease-in) .45s both; }

/* 下地は SVG の <image>。背景が near-black（rgb(12,15,12)）なので screen で
   黒が抜ける。既定は彩度を落として灰色にし、強化モードで少しだけ色を戻す。
   重ね順は文書順（接続線 → 下地 → 器官 → アイコン）で決まる — SVG に
   z-index は無い。接続線が下地より先にあるおかげで、身体の明るい線の上を
   通る箇所だけが下地の発光で覆われ、「線が腕の後ろを通っている」という
   奥行きとして読める */
#ds .ds-body {
  mix-blend-mode: screen;
  filter: saturate(.12) brightness(.55);
  transition: filter .4s var(--ease-in);
}
#ds.mode-upgrade .ds-body { filter: saturate(.3) brightness(.8); }

#ds .ds-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

#ds .ds-wire {
  stroke: var(--c);
  stroke-width: 1;
  opacity: 0;
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
}
#ds.mode-upgrade .ds-wire {
  animation: ds-wire-draw .34s var(--ease-in) calc(.16s + var(--i) * var(--step)) forwards;
}

#ds .ds-organ { opacity: 0; }
#ds .ds-organ * {
  fill: none;
  stroke: var(--c);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* --- 強化アイコン --- */

#ds .ds-part {
  /* 収納位置と定位置の切り替え。座標は JS が CSS 変数で渡す */
  transform: translate(calc(var(--sx) * 1px), calc(var(--sy) * 1px));
  transition: transform .4s var(--ease-in), opacity .3s var(--ease-in);
  cursor: pointer;
}
#ds.mode-upgrade .ds-part {
  transform: translate(calc(var(--ix) * 1px), calc(var(--iy) * 1px));
  transition-delay: calc(var(--i) * var(--step));
}
#ds .ds-part.active { transform: translate(calc(var(--ix) * 1px), calc(var(--iy) * 1px)) scale(1.15); }

#ds .ds-arc-bg { fill: rgba(4, 10, 7, .8); stroke: rgba(120, 160, 135, .3); stroke-width: 2; }
#ds .ds-arc {
  fill: none;
  stroke: var(--c);
  stroke-width: 2.5;
  /* 12 時から時計回りに満ちる */
  transform: rotate(-90deg);
  transform-origin: center;
  filter: saturate(.15);
  transition: stroke-dashoffset .45s var(--ease-in), filter .3s var(--ease-in);
}
#ds.mode-upgrade .ds-arc { filter: saturate(.6); }
#ds .ds-part.active .ds-arc { filter: none; }
#ds .ds-part.active .ds-arc-bg {
  stroke: var(--c);
  filter: drop-shadow(0 0 6px var(--c));
}
#ds .ds-part-icon { filter: saturate(.15) brightness(.8); transition: filter .3s var(--ease-in); }
#ds.mode-upgrade .ds-part-icon { filter: saturate(.55) brightness(.9); }
#ds .ds-part.active .ds-part-icon { filter: none; }

/* ヤニ不足は静かに赤みを帯びるだけ */
#ds .ds-part.poor .ds-arc { stroke: #b3564a; }
#ds .ds-part.poor .ds-part-icon { filter: saturate(.1) brightness(.6) sepia(.5) hue-rotate(-30deg); }

/* MAX は円弧が閉じてリングになり、小さなチェックが乗る。MAX ボタンは置かない */
#ds .ds-check {
  fill: none;
  stroke: var(--c);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0;
  transform: translateY(19px);
}
#ds .ds-part.maxed .ds-check { opacity: .9; }
#ds .ds-part.maxed .ds-arc { stroke-dashoffset: 0 !important; }

/* 強化可能な部位だけが呼吸する。買えない・MAX は静止したまま */
#ds.mode-upgrade .ds-part:not(.poor):not(.maxed):not(.active) .ds-arc-bg {
  animation: ds-breathe 2.4s ease-in-out infinite;
}

/* --- キーヒント --- */

#ds .ds-hint {
  position: absolute;
  left: 4%;
  bottom: 4%;
  display: flex;
  gap: 2vw;
  font-size: .85vw;
  color: #7fe0a8;
  opacity: .7;
}
#ds.entering .ds-hint { animation: ds-in-up .5s var(--ease-in) 1.4s both; }

/* --- キーフレーム --- */

@keyframes ds-bg-in { to { opacity: 1; } }
@keyframes ds-in-left {
  from { opacity: 0; transform: translateX(-1.5vw); }
  to { opacity: 1; transform: none; }
}
@keyframes ds-in-up {
  from { opacity: 0; transform: translateY(1vh); }
  to { opacity: 1; transform: none; }
}
@keyframes ds-figure-in {
  from { opacity: 0; transform: translate(-50%, -48%) scale(.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes ds-fade-back { to { opacity: .4; } }
@keyframes ds-wire-draw { to { opacity: .55; stroke-dashoffset: 0; } }
@keyframes ds-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }

/* 段階アニメーションをすべて 0 秒にして最終状態へ置く。JS 側に分岐を持たない
   （index.html の #wf / #sl / #bf と同じ流儀） */
@media (prefers-reduced-motion: reduce) {
  #ds *, #ds *::before, #ds *::after {
    animation-duration: .001s !important;
    animation-delay: 0s !important;
    transition-duration: .001s !important;
    transition-delay: 0s !important;
  }
}
```

- [ ] **Step 3: 型チェックとテストを通す**

Run: `npm run typecheck`
Expected: エラーなし（未使用 import が残っていたら消す）

Run: `npm test`
Expected: PASS。件数が Task 4 から減っていないこと

- [ ] **Step 4: ブラウザで初期状態を確認する**

`preview_start` で `{name: "takagiaction"}` を起動し、開いたページをクリックしてイントロを飛ばす（`main.ts` が起動直後に `death_screen_show(null, run_start)` を呼ぶので、初回起動モードがそのまま出る）。

死亡モードを出すには、コンソールから次を実行する。**HMR 後は `?t=` 付きの URL がアプリの実インスタンスなので、`performance` から拾うこと**（素の `import('/source/death-screen.ts')` は別インスタンスを掴む）。

```js
const pick = (f) => performance.getEntriesByType('resource')
  .map(e => e.name).filter(n => n.includes(f)).pop()
const ds = await import(pick('/source/death-screen.ts'))
const mt = await import(pick('/source/meta.ts'))
mt.meta.yani = 5000
mt.meta.levels.lung = 5
ds.death_screen_show({
  depth: 11, kills: 0, run_time: 9, smoke_count: 0, dummy_count: 0,
  death_cause: 0, best_depth_before: 8,
}, () => {})
```

確認する項目:

- [ ] 見出しが「死亡したよ、高木。」、サブが「救護ドローンが君を回収して、自席へ戻した。」
- [ ] 背景に高木の顔（左）と張り紙（右上）と端末（右下）が見える
- [ ] 人体模型が中央やや右にあり、背景の明るい部分に埋もれていない
- [ ] 6 個のアイコンが身体のすぐ脇（収納位置）にある
- [ ] 右上に「ヤニ 5000」
- [ ] 左に［記録確認］［装備確認］
- [ ] 赤い状態パネルと強化 6 行の縦リストが**無い**

**スクリーンショットを撮る前に必ず `resize_window` でサイズを 1px 変える**（720 ↔ 721 でよい）。変えないと古いフレームが返る。

- [ ] **Step 5: フォーカス移動を確認する**

コンソールから合成キーイベントを送る（実ポインタイベントはページに届かないが、`keydown` は `document` に張ってあるので合成で届く）。

```js
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true}))
const ds_el = document.getElementById('ds')
const dump = () => [ds_el.className,
  [...ds_el.querySelectorAll('.ds-part')].map(g => g.className.baseVal || g.getAttribute('class')).join(' | ')]

dump()                        // mode-idle。部位はすべて dim
key('Tab');  dump()           // mode-upgrade。先頭（脳）だけ active
key('ArrowDown'); dump()      // 2 番目（鼻）が active
key('Tab');  dump()           // mode-idle へ戻る
```

Expected:
- 初期は `mode-idle panel-none` を含み、6 部位すべてが `dim`
- `Tab` 後は `mode-upgrade` を含み、`data-part="tolerance"` だけが `active`
- `ArrowDown` で `active` が `data-part="sniff"` へ移る
- もう一度 `Tab` で `mode-idle` へ戻る

- [ ] **Step 6: アニメーションがノードに付いていることを確認する**

これがこの再設計の核心（`innerHTML` 再構築をやめた理由）なので、必ず確かめる。

```js
key('ArrowDown'); key('ArrowDown'); key('ArrowDown')
const parts = [...document.querySelectorAll('#ds .ds-part')]
// 矢印を 3 回押しても同じノードのままか
parts[0] === document.querySelectorAll('#ds .ds-part')[0]   // → true
// アニメーション/トランジションが生きているか
document.getElementById('ds').getAnimations({subtree: true}).length   // → 0 より大きい
```

Expected: ノードの同一性が `true`、`getAnimations()` が 1 個以上を返す

- [ ] **Step 7: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
死亡画面を永続 DOM ＋ 状態機械へ作り替える（Level 1）

render() が innerHTML を毎キー入力で組み直す形をやめ、death_screen_show()
が DOM を 1 度だけ組んで以降は class とテキストだけを触る形にする。ノードが
生き続けるので CSS アニメーションの位相が保たれる。

この時点で入るのは Level 1 だけ — 背景 3 枚、見出し、ヤニ残高、記録確認と
装備確認の項目、人体模型と 6 アイコン（収納位置）、キーヒント。強化 6 行の
縦リストと購入ボタンは消えた。

アイコンの位置は CSS 変数（--sx/--sy = 収納、--ix/--iy = 定位置）で渡し、
どちらへ translate するかは mode-upgrade の class が選ぶ。段階開示の刻みも
--i と --step の掛け算で、JS からタイマーを撒かない。

詳細パネル・記録/装備パネル・地下へ戻る・強化演出は以降のタスクで足す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 強化モードの展開と Level 2 詳細パネル

**Files:**
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: Task 5 の DOM 骨格と `apply()`、`upgrade_rows[].value(level)` / `.stat` / `.flavor` / `.name` / `.color`、`meta_upgrade_price`
- Produces: `.ds-detail` の DOM と、`apply()` 内でそれを埋める `fill_detail()`

- [ ] **Step 1: 詳細パネルの DOM を足す**

`build()` の `el.innerHTML` の、`.ds-figure` の閉じ `</div>` と `.ds-hint` のあいだに挿入する。

```ts
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
    ' / <b class="ds-detail-mx"></b><span class="ds-detail-pips"></span></div>' +
    '<div class="ds-detail-cost">所持 <b class="ds-detail-own"></b>' +
    '<span class="ds-detail-need-wrap">必要 <b class="ds-detail-need"></b></span></div>' +
    '</div>' +
```

- [ ] **Step 2: `fill_detail()` を実装し、`apply()` から呼ぶ**

`death-screen.ts` に足す。

```ts
// Level 2。強化モードで部位を選んでいるあいだだけ出る。効果の数値は
// upgrade_rows[].value(level) 経由で meta.ts の getter から引き、式を
// 画面側に書き写さない
function fill_detail(): void {
  if (state.mode !== 'upgrade') { return }
  const part = body_parts[state.focus]
  const row = row_of.get(part.id)!
  const level = meta.levels[part.id]
  const max = meta_max_level[part.id]
  const maxed = level >= max
  const detail = root!.querySelector<HTMLElement>('.ds-detail')!

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

  let pips = ''
  for (let p = 0; p < max; p++) { pips += '<i class="' + (p < level ? 'on' : '') + '"></i>' }
  root!.querySelector<HTMLElement>('.ds-detail-pips')!.innerHTML = pips
}
```

`apply()` の末尾に `fill_detail()` を足す。

- [ ] **Step 3: 詳細パネルの CSS を足す**

`death-screen.css` の、キーヒントの規則の前に挿入する。

```css
/* --- Level 2 詳細パネル --- */

#ds .ds-detail {
  /* fill_detail() が走る前は --c が未設定で border-color が無効になる。
     既定色を持たせておく */
  --c: #7fe0a8;
  position: absolute;
  right: 3%;
  top: 34%;
  width: 20vw;
  padding: 1vh 1vw;
  border-left: 2px solid var(--c);
  background: linear-gradient(90deg, rgba(6, 14, 10, .9), rgba(6, 14, 10, .35));
  opacity: 0;
  transform: translateX(1.5vw);
  pointer-events: none;
  transition: opacity .22s var(--ease-out), transform .22s var(--ease-out);
}
/* 展開は収納より 0.1s 遅れて始まる。完全に直列だと待ちが長く、
   完全に並列だと 2 枚が同時に見える */
#ds.mode-upgrade .ds-detail {
  opacity: 1;
  transform: none;
  transition: opacity .3s var(--ease-in) .32s, transform .3s var(--ease-in) .32s;
}
#ds.panel-record .ds-detail, #ds.panel-gear .ds-detail { opacity: 0; }

#ds .ds-detail-name {
  font-size: 1.3vw;
  font-weight: bold;
  color: var(--c);
  text-shadow: 0 0 10px var(--c);
}
#ds .ds-detail-flavor { font-size: .8vw; color: #9cc4aa; margin-bottom: .8vh; }
#ds .ds-detail-stat { font-size: .9vw; color: #9cc4aa; }
#ds .ds-detail-cur { font-size: 1.1vw; color: #eaf5ee; margin: 0 .4vw; }
#ds .ds-detail-arw { color: #6b8f78; font-style: normal; margin: 0 .3vw; }
#ds .ds-detail-nxt { font-size: 1.1vw; color: var(--c); text-shadow: 0 0 8px var(--c); }
#ds .ds-detail-level { font-size: .9vw; color: #eaf5ee; margin-top: .6vh; }
#ds .ds-detail-pips { display: inline-flex; gap: .22vw; margin-left: .6vw; }
#ds .ds-detail-pips i {
  width: .5vw; height: .5vw; border-radius: 50%;
  background: #1c3a2a;
}
#ds .ds-detail-pips i.on { background: var(--c); box-shadow: 0 0 5px var(--c); }
#ds .ds-detail-cost { font-size: .85vw; color: #9cc4aa; margin-top: .8vh; }
#ds .ds-detail-cost b { color: #e8c9a8; margin: 0 .8vw 0 .3vw; }
/* ヤニ不足は静かに赤みを帯びる */
#ds .ds-detail.poor .ds-detail-need { color: #ff6b5e; }
/* MAX では「→ 次の値」と必要ヤニを出さない */
#ds .ds-detail.maxed .ds-detail-arw,
#ds .ds-detail.maxed .ds-detail-nxt,
#ds .ds-detail.maxed .ds-detail-need-wrap { display: none; }
#ds .ds-detail.maxed .ds-detail-level::after {
  content: 'MAX';
  margin-left: .8vw;
  color: var(--c);
  text-shadow: 0 0 8px var(--c);
}
```

- [ ] **Step 4: 型チェックとテスト**

Run: `npm run typecheck` / `npm test`
Expected: どちらも成功。テスト件数は減っていないこと

- [ ] **Step 5: ブラウザで展開・収納・フォーカス移動を確認する**

Task 5 Step 4 の手順で死亡モードを出してから:

- [ ] `Tab` で 6 アイコンが外側へ飛び出し、接続線が描かれ、詳細パネルが右に出る
- [ ] 詳細パネルに「肺活量 / 吸い方の訓練 / 最大ゲージ 150 → 160 / Lv. 5 / 10 / 所持 5000　必要 190」が出る（`meta.levels.lung = 5` にしてある場合）
- [ ] 矢印で部位を移すと、旧パネルが引っ込んでから新パネルが出る
- [ ] `Tab` をもう一度押すと、数値 → パネル → 線 → アイコン の順に収納される
- [ ] `meta.yani = 10` にして `apply()` を呼び直すと、買えない部位の円弧とアイコンが赤みを帯び、必要ヤニが赤くなる（巨大な警告は出ない）
- [ ] `meta.levels.sniff = 5`（上限）にすると、鼻のアイコンにチェックが出て円弧が閉じ、フォーカスすると `Lv. 5 / 5 MAX` になる

段階の時間差は `getAnimations()` で確かめられる。

```js
key('Tab')
document.getElementById('ds').getAnimations({subtree: true})
  .map(a => [a.animationName || a.transitionProperty, a.effect.getTiming().delay])
```

Expected: `--i` に応じて 0 / 80 / 160 / 240 / 320 / 400ms の遅延が並ぶ

- [ ] **Step 6: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
強化モードの展開と Level 2 詳細パネルを足す

Tab で 6 アイコンが収納位置から外側へ飛び出し、接続線が描かれ、選択部位の
詳細が右に展開する。もう一度押すと逆順に収納される。

詳細パネルが出すのは 能力名・フレーバー・「現在値 → 次の段の値」・Lv n/max・
所持ヤニと必要ヤニ。効果の数値は upgrade_rows[].value(level) 経由で meta.ts の
getter から引き、式を画面側に書き写さない。

MAX では「→ 次の値」と必要ヤニを出さず、Lv n/max の隣に MAX を出す。ヤニ
不足は円弧・アイコン・必要ヤニが静かに赤みを帯びるだけにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 部位別の強化演出と音

**Files:**
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: Task 6 の `.ds-detail` と `.ds-organ`、`audio_play` と既存の効果音
- Produces: `play_upgrade(id: meta_upgrade_id_t): void`（`busy` を立てて演出を再生し、終わったら降ろす）

- [ ] **Step 1: 演出の起動を `buy()` に組み込む**

`death-screen.ts` の import に効果音を足す。

```ts
import {
  audio_play, audio_sfx_beep, audio_sfx_exhale, audio_sfx_hit, audio_sfx_lighter,
  audio_sfx_pickup, audio_sfx_shoot, audio_sfx_swing, audio_sfx_terminal,
} from './audio'
```

`upgrade_sfx` のテーブルに型が要るので、`meta` からの型 import も足す。

```ts
import type { meta_upgrade_id_t } from './meta'
```

`buy()` を差し替える。

```ts
// 強化ごとの音。docs/gameplay.md のとおりこの画面は無音なので、これが唯一
// 鳴る音になる。sound-effects.ts に instrument は増やさない
const upgrade_sfx: Record<meta_upgrade_id_t, () => AudioBuffer | undefined> = {
  lung: () => audio_sfx_exhale,
  tolerance: () => audio_sfx_hit,
  sniff: () => audio_sfx_terminal,
  leg: () => audio_sfx_swing,
  power: () => audio_sfx_shoot,
  spare: () => audio_sfx_lighter,
}

// 演出の長さ。いちばん長い肺（膨張 → 戻り → 煙）に合わせて一律にする。
// 部位ごとに変えると、連続で買ったときのテンポが項目によってばらつく
const upgrade_duration = 1100

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
```

`descend()` の中で `clearTimeout(upgrade_timer)` も呼ぶこと（演出中に降下すると、消えた画面のうえでタイマーが発火する）。

- [ ] **Step 2: 端末の明滅とヤニへの線の DOM を足す**

`build()` の `el.innerHTML` の、`.ds-well` の直後に足す。

```ts
    '<div class="ds-terminal-glow"></div>' +
    '<div class="ds-yani-beam"></div>' +
```

- [ ] **Step 3: 演出の CSS を足す**

`death-screen.css` のキーフレーム群の前に挿入する。

```css
/* --- 強化演出 --- */

/* 器官はフォーカス中だけ薄く光り、購入の瞬間に強く光る */
#ds.mode-upgrade .ds-organ { transition: opacity .3s var(--ease-in); }
#ds.mode-upgrade .ds-organ[data-part] { opacity: 0; }
/* JS が付ける up-<id> と、フォーカス中の部位に対応する器官を出す */
#ds.up-lung .ds-organ[data-part="lung"],
#ds.up-tolerance .ds-organ[data-part="tolerance"],
#ds.up-sniff .ds-organ[data-part="sniff"],
#ds.up-power .ds-organ[data-part="power"],
#ds.up-spare .ds-organ[data-part="spare"],
#ds.up-leg .ds-organ[data-part="leg"] { opacity: 1; }

/* 肺活量: 膨らむ → 気管へ光が流れる → 戻る → 口元から煙 */
#ds.up-lung .ds-o-lung {
  transform-box: fill-box;
  transform-origin: center;
  animation: ds-lung-swell 1.05s var(--ease-in);
}
#ds.up-lung .ds-o-trachea {
  stroke-dasharray: 60;
  animation: ds-flow .4s linear .1s;
}

/* ニコチン耐性: 脳が点灯し、神経ラインへパルスが降りる */
#ds.up-tolerance .ds-o-brain { animation: ds-pulse .5s ease-out 2; }
#ds.up-tolerance .ds-o-nerve {
  stroke-dasharray: 220;
  animation: ds-flow .5s linear;
}
#ds.up-tolerance .ds-o-nerve:nth-of-type(2) { animation-delay: .06s; }
#ds.up-tolerance .ds-o-nerve:nth-of-type(3) { animation-delay: .12s; }
#ds.up-tolerance .ds-o-nerve:nth-of-type(4) { animation-delay: .18s; }
#ds.up-tolerance .ds-o-nerve:nth-of-type(5) { animation-delay: .24s; }

/* 嗅覚: 外周から煙の粒子が鼻へ吸い込まれる */
#ds.up-sniff .ds-o-smoke {
  stroke-dasharray: 90;
  animation: ds-suck .55s var(--ease-in);
}
#ds.up-sniff .ds-o-nose { animation: ds-pulse .5s ease-out 2; }

/* 火力: 腕へラインが接続 → 手先で閃光 → 模型が反動で後退 */
#ds.up-power .ds-o-arm { stroke-dasharray: 140; animation: ds-flow .3s linear; }
#ds.up-power .ds-o-hand { animation: ds-flash .18s ease-out .3s 2; }
/* 反動は .ds-figure だけに掛ける。ds-recoil は translate(-50%,-50%) を土台に
   しており、それを持たない .ds-body（SVG の <image>）に当てると模型が飛ぶ */
#ds.up-power .ds-figure { animation: ds-recoil .18s ease-out .3s 2; }

/* 予備の一本: 煙草が弧を描いてポケットへ落ちる */
#ds.up-spare .ds-o-cig { animation: ds-drop .5s var(--ease-in); }
#ds.up-spare .ds-o-pocket { animation: ds-pulse .4s ease-out .45s; }

/* 脚力: 骨盤から足へエネルギーが降り、足元へ衝撃 */
#ds.up-leg .ds-o-leg { stroke-dasharray: 260; animation: ds-flow .45s linear; }
#ds.up-leg .ds-o-ground { animation: ds-shock .4s var(--ease-out) .4s; }
#ds.up-leg .ds-figure { animation: ds-shake .12s linear .4s 2; }

/* 数値の差し替えを目立たせる。ロールアップではなく 1 度の点滅にする —
   桁が動くだけの演出は、重い機械という狙いから外れる */
#ds.upgrading .ds-detail-cur { animation: ds-value-in .45s var(--ease-in) .4s; }

/* 背景の闇サイト端末が明滅し、右上のヤニ残高へ線が走る */
#ds .ds-terminal-glow {
  position: absolute;
  right: 8%;
  top: 62%;
  width: 22vw;
  height: 18vh;
  background: radial-gradient(closest-side, rgba(255, 60, 40, .45), transparent);
  opacity: 0;
  pointer-events: none;
}
#ds.yani-spend .ds-terminal-glow { animation: ds-terminal-blink .6s ease-out; }
#ds .ds-yani-beam {
  position: absolute;
  right: 9%;
  top: 10%;
  width: 2px;
  height: 52vh;
  background: linear-gradient(180deg, rgba(255, 170, 43, .9), transparent);
  transform-origin: top;
  transform: scaleY(0);
  opacity: 0;
  pointer-events: none;
}
#ds.yani-spend .ds-yani-beam { animation: ds-beam .5s var(--ease-in) .1s; }
#ds.yani-spend .ds-yani-value { animation: ds-pulse .4s ease-out .4s; }

/* ヤニ不足の拒否。赤く巨大に警告せず、1 回だけ震える */
#ds .ds-detail.reject, #ds .ds-yani.reject { animation: ds-reject .3s linear; }
#ds .ds-detail.reject .ds-detail-need, #ds .ds-yani.reject .ds-yani-value { color: #ff6b5e; }
```

キーフレームを追加する。

```css
@keyframes ds-lung-swell {
  0% { transform: scale(1); }
  33% { transform: scale(1.28); }
  100% { transform: scale(1); }
}
@keyframes ds-flow { from { stroke-dashoffset: 260; } to { stroke-dashoffset: 0; } }
@keyframes ds-suck { from { stroke-dashoffset: -90; opacity: 0; } 40% { opacity: 1; } to { stroke-dashoffset: 0; opacity: 0; } }
@keyframes ds-pulse { 0%, 100% { filter: none; } 50% { filter: drop-shadow(0 0 10px var(--c)) brightness(1.6); } }
@keyframes ds-flash { 0%, 100% { opacity: .6; } 50% { opacity: 1; filter: drop-shadow(0 0 12px var(--c)); } }
@keyframes ds-recoil { 0%, 100% { transform: translate(-50%, -50%); } 50% { transform: translate(calc(-50% + 3px), -50%); } }
@keyframes ds-drop {
  from { transform: translate(120px, -180px); opacity: 0; }
  60% { opacity: 1; }
  to { transform: none; opacity: 1; }
}
@keyframes ds-shock { from { transform: scale(.2); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
@keyframes ds-shake { 0%, 100% { transform: translate(-50%, -50%); } 50% { transform: translate(-50%, calc(-50% + 2px)); } }
@keyframes ds-value-in { from { opacity: 0; transform: translateY(-.4vh); } to { opacity: 1; transform: none; } }
@keyframes ds-terminal-blink { 0%, 100% { opacity: 0; } 20%, 60% { opacity: 1; } }
@keyframes ds-beam { 0% { transform: scaleY(0); opacity: 1; } 100% { transform: scaleY(1); opacity: 0; } }
@keyframes ds-reject { 0%, 100% { transform: none; } 25% { transform: translateX(-.3vw); } 75% { transform: translateX(.3vw); } }
```

- [ ] **Step 4: フォーカス中にも器官が薄く光るようにする**

購入時だけでなく、フォーカスしただけで該当器官が淡く出る必要がある（§4）。`apply()` の `.ds-part` のループの中で、対応する `.ds-organ` に `active` を付ける。

```ts
    const organ = el.querySelector<SVGGElement>('.ds-organ[data-part="' + part.id + '"]')!
    organ.classList.toggle('active', ds_part_layer(state, index) === 'active')
```

CSS を足す。

```css
#ds.mode-upgrade .ds-organ.active { opacity: .5; }
```

- [ ] **Step 5: 型チェックとテスト**

Run: `npm run typecheck` / `npm test`
Expected: どちらも成功

- [ ] **Step 6: ブラウザで 6 種の演出を確認する**

`meta.yani = 100000` にしてから、部位ごとに `Tab` → 矢印 → `Enter` を送る。

```js
mt.meta.yani = 100000
key('Tab')
for (let i = 0; i < 6; i++) {
  key('Enter')
  await new Promise(r => setTimeout(r, 1300))   // 待ちは最小限に（hidden タブは setTimeout が絞られる）
  key('ArrowDown')
}
```

**ペインでは `setTimeout` がバックグラウンドのクランプ（1 回 約 1 秒）を受ける。** 上のループは 30 秒の `javascript_tool` タイムアウトに掛かる可能性があるので、**部位ごとに分けて実行すること。**

演出そのものは `getAnimations()` を止めて任意時刻へ送ればスクリーンショットが撮れる。

```js
key('Enter')
const anims = document.getElementById('ds').getAnimations({subtree: true})
anims.forEach(a => { a.pause(); a.currentTime = 300 })   // 0.3s 時点の絵
```

確認する項目:

- [ ] 肺: 2 枚の楕円が膨らんで戻り、気管に光が流れる
- [ ] 耐性: 脳が光り、神経ラインが上から順に点灯する
- [ ] 嗅覚: 外周 6 本の線が鼻へ向かって縮む
- [ ] 火力: 腕のラインが手へ伸び、手の輪が光り、模型が横に揺れる
- [ ] 予備: 煙草が右上から腰のポケットへ落ちる
- [ ] 脚力: 脚のラインが降りて足元に輪が広がる
- [ ] どの演出中も背景の端末が明滅し、右上のヤニへ線が走り、残高が減る
- [ ] 演出中にキーを送っても何も起きない（`busy`）
- [ ] `meta.yani = 0` にして `Enter` を押すと、音が鳴らず、必要ヤニとヤニ残高が 1 回震えて赤くなるだけ

- [ ] **Step 7: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
部位別の強化演出と音を足す

購入した瞬間に、その部位の器官が動く。肺は膨らんで戻り、脳は神経ラインへ
パルスを流し、鼻は外から煙を吸い込み、腕は手へラインを繋いで反動で揺れ、
腰はポケットへ煙草を落とし、脚は足元へ衝撃を出す。

音は既存の 11 個から選ぶ（exhale / hit / terminal / swing / shoot / lighter）。
docs/gameplay.md のとおりこの画面は無音なので、これが唯一鳴る音になる。
sound-effects.ts に instrument は増やしていない。

演出の長さは 1.1s で一律にした。部位ごとに変えると、連続で買ったときの
テンポが項目によってばらつく。

ヤニ不足では音を鳴らさない。必要ヤニとヤニ残高が 1 回だけ赤く震える。被弾音
（audio_sfx_hurt）は流用しない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 記録確認パネル

**Files:**
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: Task 2 の `ds_idle_record`、`format_run_time` / `is_new_record`、既存の統計アイコン 5 枚
- Produces: `.ds-record` パネルと `fill_record()`。NEW RECORD バナーは `#ds` の内側に移る

- [ ] **Step 1: 統計アイコンの import を足す**

```ts
import stat_depth_url from '../m/ui/icon-stat-depth.webp'
import stat_time_url from '../m/ui/icon-stat-time.webp'
import stat_kills_url from '../m/ui/icon-stat-kills.webp'
import stat_smoke_url from '../m/ui/icon-stat-smoke.webp'
import stat_dummy_url from '../m/ui/icon-stat-dummy.webp'
```

import 一覧に `ds_idle_record` と `is_new_record` / `format_run_time` を足す。

- [ ] **Step 2: 記録パネルの DOM を足す**

`build()` の `el.innerHTML` の末尾（`.ds-hint` の後）に足す。

```ts
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
```

- [ ] **Step 3: `fill_record()` を実装する**

```ts
// 行の出現を 70ms ずつずらすための連番。fill_record() が 0 に戻す
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
```

- [ ] **Step 4: 記録確認の項目を、記録が無いときに隠す**

`fill_static()` に足す。初回起動でベスト深度も 0 なら、読むものが無いので項目ごと出さない。

```ts
  const has_record = current !== null || meta.best_depth > 0
  root!.querySelector<HTMLElement>('.ds-item[data-item="0"]')!.style.display =
    has_record ? '' : 'none'
  fill_record()
```

- [ ] **Step 5: NEW RECORD バナーを `#ds` の内側で出す**

`fill_static()` に足す。

```ts
  const banner = root!.querySelector<HTMLElement>('.ds-nr')!
  const record = current !== null && is_new_record(current.depth, current.best_depth_before)
  banner.style.display = record ? 'block' : 'none'
  if (record) {
    text('.ds-nr-sub', '自己ベスト更新！ 深度 ' + current!.depth + 'F')
    audio_play(audio_sfx_pickup)
  }
```

**現行の `show_record_banner()` と `#ds-nr` の兄弟要素、および `death-screen.css` の `#ds-nr` 一式は削除する。** `innerHTML` を組み直さなくなったので、`#ds` の外へ逃がす理由が無くなった。

- [ ] **Step 6: CSS を足す**

```css
/* --- Level 3 記録確認パネル --- */

#ds .ds-record {
  position: absolute;
  left: 0;
  top: 18%;
  width: 28vw;
  padding: 2vh 2vw;
  box-sizing: border-box;
  border-right: 2px solid #2e6b4f;
  background: linear-gradient(90deg, rgba(4, 12, 8, .96), rgba(4, 12, 8, .82));
  overflow: hidden;
  transform: translateX(-100%);
  transition: transform .3s var(--ease-out);
}
#ds.panel-record .ds-record { transform: none; transition: transform .34s var(--ease-in) .1s; }

/* 古い端末が起動するときの走査線。1 往復だけ */
#ds .ds-record-scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 2.5vh;
  background: linear-gradient(180deg, transparent, rgba(127, 224, 168, .22), transparent);
  opacity: 0;
}
#ds.panel-record .ds-record-scan { animation: ds-scan .8s linear .2s; }

#ds .ds-record-title {
  color: #7fe0a8; font-weight: bold; font-size: 1.1vw;
  letter-spacing: .1em; margin-bottom: 1vh;
}
#ds .ds-record-row {
  display: flex; align-items: center; gap: .5vw;
  font-size: 1vw; padding: .5vh 0;
  border-bottom: 1px solid rgba(46, 107, 79, .4);
  opacity: 0;
}
#ds.panel-record .ds-record-row {
  animation: ds-row-in .3s var(--ease-in) calc(.35s + var(--i) * 70ms) forwards;
}
#ds .ds-record-row:last-child { border-bottom: none; }
#ds .ds-record-row img { width: 1.2vw; height: 1.2vw; }
#ds .ds-record-row b { margin-left: auto; font-size: 1.15vw; color: #eaf5ee; }
/* バッジは点滅させない。演出はバナー側が持つ */
#ds .ds-record-row.record b { color: #ffd24a; text-shadow: 0 0 8px rgba(255, 210, 74, .8); }
#ds .ds-record-prev { margin-left: .5vw; font-size: .8vw; font-weight: normal; color: #7fe0a8; }
#ds .ds-record-new {
  margin-left: .5vw; padding: 0 .35vw;
  border: 1px solid #ffd24a; border-radius: .2vw;
  font-size: .7vw; color: #ffd24a;
}
#ds .ds-record-close { margin-top: 1.5vh; font-size: .8vw; color: #7fe0a8; opacity: .7; }

/* --- NEW RECORD バナー。#ds の内側で問題ない（innerHTML を組み直さないため） --- */

#ds .ds-nr {
  position: absolute;
  left: 4%;
  top: 24%;
  width: 40vw;
  display: none;
  pointer-events: none;
  text-align: center;
}
#ds.entering .ds-nr .ds-nr-title {
  animation: ds-nr-in .35s cubic-bezier(.2, 1.6, .35, 1) 1.6s both,
    ds-nr-glow 2s ease-in-out 2.3s infinite;
}
#ds .ds-nr-title {
  font-size: 3.6vw; line-height: 1.05; font-weight: bold;
  letter-spacing: .08em; color: #ffd24a;
}
#ds .ds-nr-sub { font-size: 1.2vw; font-weight: bold; color: #ffaa2b; text-shadow: 0 0 10px #f70; }
#ds.entering .ds-nr .ds-nr-sub {
  animation: ds-nr-in .35s cubic-bezier(.2, 1.6, .35, 1) 1.8s both;
}
```

キーフレームを足す。

```css
@keyframes ds-scan { from { opacity: 1; top: 0; } to { opacity: 0; top: 100%; } }
@keyframes ds-row-in { from { opacity: 0; transform: translateX(-.8vw); } to { opacity: 1; transform: none; } }
@keyframes ds-nr-in { from { opacity: 0; transform: translateX(-4vw) scale(1.3); } to { opacity: 1; transform: none; } }
@keyframes ds-nr-glow {
  0%, 100% { text-shadow: 0 0 1vw #ffb400, 0 0 2.2vw rgba(255, 140, 0, .7); }
  50% { text-shadow: 0 0 1.8vw #ffd24a, 0 0 4vw rgba(255, 170, 43, .95); }
}
```

- [ ] **Step 7: 型チェックとテスト**

Run: `npm run typecheck` / `npm test`
Expected: どちらも成功

- [ ] **Step 8: ブラウザで確認する**

- [ ] `↑`（または `↓`）で［記録確認］にフォーカスし、`Enter` で左からパネルが出る
- [ ] 走査線が上から下へ 1 往復し、6 行が上から順に点灯する
- [ ] `Esc` で左へ戻る
- [ ] パネル表示中は矢印も `Tab` も効かない
- [ ] `best_depth_before: 8, depth: 11` で開くと最高深度の行に `11 F ← 8 F NEW` が出て、入場時に NEW RECORD バナーが出る
- [ ] `death_screen_show(null, ...)` かつ `meta.best_depth = 0` では［記録確認］の項目が消える
- [ ] `death_screen_show(null, ...)` かつ `meta.best_depth = 12` では［記録確認］が出て、最高深度の 1 行だけになる

- [ ] **Step 9: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
記録確認パネル（Level 3）を足す

到達深度・最高深度・生存時間・撃破数・喫煙回数・ダミー踏みを常時表示から
外し、Enter で左からスライドインするパネルへ移す。走査線が 1 往復してから
6 行が 70ms 間隔で順に点灯する。

初回起動モードでは最高深度の 1 行だけに縮め、ベスト深度が 0 のときは項目
ごと出さない（読むものが無いため）。

NEW RECORD バナーを #ds の内側へ戻した。innerHTML をキー入力のたびに組み
直すのをやめたので、兄弟要素へ逃がす理由が無くなった。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 装備確認パネル

**Files:**
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: Task 4 の `gear_icons`、Task 3 の `gear_anchors`、既存の `gear_grade` / `gear_grades` / `gear_name` / `gear_slot_labels` / `gear_slots`、`ds_idle_gear`
- Produces: `.ds-gearpanel` と `.ds-gear-wire`（SVG 内）、`fill_gear()`

- [ ] **Step 1: import を足す**

```ts
import { gear_anchors } from './body-figure'
import { gear_grade, gear_grades, gear_name, gear_slot_labels, gear_slots } from './equipment'
import { gear_icons } from './gear-icons'
```

- [ ] **Step 2: 模型から伸びる線と、カードの DOM を足す**

`build()` の SVG の中、`.ds-icons` の直前に装備の線を足す。

```ts
  let gear_wires = ''
  for (const slot of gear_slots) {
    const a = gear_anchors[slot]
    // カードは右へ展開するので、線はアンカーから右外へ抜ける
    gear_wires += '<line class="ds-gear-wire" data-slot="' + slot +
      '" x1="' + a.x + '" y1="' + a.y + '" x2="330" y2="' + a.y + '"/>'
  }
```

`'<g class="ds-gear-wires">' + gear_wires + '</g>' +` を `.ds-organs` と `.ds-icons` のあいだに挿入する。

`el.innerHTML` の末尾（記録パネルの後）にカードの入れ物を足す。

```ts
    '<div class="ds-gearpanel"></div>' +
```

- [ ] **Step 3: `fill_gear()` を実装する**

```ts
// 装備は買うものではないので、強化の動線とは別の面に置く。カードは模型の
// 装備部位から線で繋がっていて、閉じると模型側へ吸い込まれる
function fill_gear(): void {
  const panel = root!.querySelector<HTMLElement>('.ds-gearpanel')!
  let html = ''
  let index = 0
  for (const slot of gear_slots) {
    const tier = meta.gear[slot]
    const owned = tier > 0
    const grade = owned ? gear_grades[gear_grade(tier)] : null
    html += '<div class="ds-card' + (owned ? '' : ' none') +
      '" style="--i:' + index++ + (grade ? ';--c:' + grade.color : '') + '">' +
      (owned
        ? '<img src="' + gear_icons[slot][tier - 1] + '" alt="">'
        : '<div class="ds-card-empty"></div>') +
      '<div><div class="ds-card-slot">' + gear_slot_labels[slot] + '</div>' +
      '<div class="ds-card-name">' +
      (owned ? gear_name(slot, tier) : '未所持') + '</div></div></div>'
  }
  panel.innerHTML = html
}
```

`fill_static()` に足す。1 つも持っていないときは項目ごと出さない（現行の「パネルを出さない」を踏襲）。

```ts
  const has_gear = gear_slots.some((slot) => meta.gear[slot] > 0)
  root!.querySelector<HTMLElement>('.ds-item[data-item="1"]')!.style.display =
    has_gear ? '' : 'none'
  fill_gear()
```

- [ ] **Step 4: CSS を足す**

```css
/* --- Level 3 装備確認パネル --- */

#ds .ds-gear-wire {
  stroke: #7fe0a8;
  stroke-width: 1;
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  opacity: 0;
}
#ds.panel-gear .ds-gear-wire { animation: ds-wire-draw .3s var(--ease-in) .1s forwards; }

#ds .ds-gearpanel {
  position: absolute;
  right: 4%;
  top: 26%;
  width: 24vw;
  display: flex;
  flex-direction: column;
  gap: 1.2vh;
  pointer-events: none;
}
#ds .ds-card {
  display: flex;
  align-items: center;
  gap: 1vw;
  padding: 1vh 1vw;
  border-left: 2px solid var(--c, #5d7a68);
  background: linear-gradient(90deg, rgba(6, 14, 10, .92), rgba(6, 14, 10, .5));
  opacity: 0;
  /* 閉じると模型側（左）へ吸い込まれる */
  transform: translateX(6vw) scale(.9);
  transition: opacity .2s var(--ease-out), transform .2s var(--ease-out);
}
#ds.panel-gear .ds-card {
  opacity: 1;
  transform: none;
  transition: opacity .3s var(--ease-in) calc(.2s + var(--i) * 90ms),
    transform .3s var(--ease-in) calc(.2s + var(--i) * 90ms);
}
#ds .ds-card img { width: 3vw; height: 3vw; }
#ds .ds-card-empty { width: 3vw; height: 3vw; border: 1px dashed #2e6b4f; box-sizing: border-box; }
#ds .ds-card-slot { font-size: .8vw; color: #9cc4aa; }
#ds .ds-card-name { font-size: 1.1vw; font-weight: bold; color: var(--c, #5d7a68); }
#ds .ds-card.none .ds-card-name { color: #5d7a68; font-weight: normal; }
```

- [ ] **Step 5: 型チェックとテスト**

Run: `npm run typecheck` / `npm test`
Expected: どちらも成功

- [ ] **Step 6: ブラウザで確認する**

```js
mt.meta.gear.blade = 9
mt.meta.gear.sole = 2
mt.meta.gear.patch = 10
ds.death_screen_show({depth: 11, kills: 0, run_time: 9, smoke_count: 0,
  dummy_count: 0, death_cause: 0, best_depth_before: 8}, () => {})
```

- [ ] ［装備確認］に `Enter` で、模型の 3 部位（右手・右足・胸）から右へ線が伸び、カード 3 枚が 90ms 間隔で展開する
- [ ] 品名が等級色（銘品は `#f0c93a`、上物は `#3af08a` など）で出る
- [ ] `Esc` でカードが模型側（左）へ吸い込まれる
- [ ] 3 系統とも `0` にすると［装備確認］の項目ごと消える

- [ ] **Step 7: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
装備確認パネル（Level 3）を足す

刃物・ソール・パッチの品名を常時表示から外し、Enter で開くカードへ移す。
カードは模型の装備部位（右手・右足・胸）から伸びる線と繋がっていて、閉じる
と模型側へ吸い込まれる。装備は買うものではないので、強化の動線とは別の面に
置くという既存の判断はそのまま。

アイコンは Task 4 で切り出した gear-icons.ts から引く。3 系統とも未所持の
あいだは項目ごと出さない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 地下へ戻ると降下演出

**Files:**
- Modify: `source/death-screen.ts`
- Modify: `source/death-screen.css`

**Interfaces:**
- Consumes: `ds_idle_descend`、`audio_sfx_door`、`door.webp`
- Produces: `.ds-descend` ボタンと `.ds-split`（光の裂け目）。`descend()` が演出を挟んでから `on_descend_cb()` を呼ぶ

- [ ] **Step 1: import を足す**

```ts
import door_url from '../m/ui/door.webp'
```

`audio` の import に `audio_sfx_door` を足し、`death-screen-model` の import に `ds_idle_descend` を足す。

- [ ] **Step 2: ボタンと裂け目の DOM を足す**

`build()` の `el.innerHTML` の、`.ds-hint` の前に足す。

```ts
    '<button class="ds-descend" data-item="2">' +
    '<img src="' + door_url + '" alt="">' +
    '<span class="ds-descend-label">地下へ戻る</span>' +
    '<small class="ds-descend-depth"></small>' +
    '</button>' +
```

末尾（装備パネルの後）に足す。

```ts
    '<div class="ds-split"><i></i><i></i></div>' +
```

`build()` のクリック配線に足す。

```ts
  el.querySelector<HTMLButtonElement>('.ds-descend')!.onclick = () => {
    state = { ...state, mode: 'idle', panel: 'none', focus: ds_idle_descend }
    dispatch('Enter')
  }
```

- [ ] **Step 3: `apply()` と `fill_static()` を更新する**

`apply()` の `.ds-item` のループを `.ds-item, .ds-descend` へ広げる。`data-item` を持つ 3 要素をまとめて扱う。

```ts
  el.querySelectorAll<HTMLElement>('[data-item]').forEach((item) => {
    set_layer(item, ds_item_layer(state, Number(item.dataset.item)))
  })
```

`fill_static()` に推奨深度を足す。

```ts
  // meta.best_depth は未プレイ時 0 のため、1 で底上げして「0F+」を避ける
  text('.ds-descend-depth', Math.max(meta.best_depth, 1) + 'F-')
  text('.ds-descend-label', current !== null ? '地下へ戻る' : '地下へ潜る')
```

キーヒントの `[Esc] 地下へ戻る` も初回起動では「地下へ潜る」になるので、`fill_static()` で書き換える。`.ds-hint` の 3 つ目の `<span>` に class を付けておくこと。

- [ ] **Step 4: `descend()` に演出を挟む**

```ts
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
    on_descend_cb()
  }, 1000)
}
```

- [ ] **Step 5: CSS を足す**

```css
/* --- 地下へ戻る --- */

#ds .ds-descend {
  position: absolute;
  right: 3%;
  top: 74%;
  display: flex;
  align-items: center;
  gap: .8vw;
  border: 1px solid rgba(255, 170, 43, .5);
  background: linear-gradient(180deg, rgba(60, 34, 4, .5), rgba(24, 13, 2, .7));
  color: #ffaa2b;
  font: inherit;
  font-size: 1.3vw;
  font-weight: bold;
  padding: 1vh 1.2vw;
  cursor: pointer;
  transition: opacity .25s var(--ease-in), box-shadow .25s var(--ease-in),
    border-color .25s var(--ease-in);
}
#ds .ds-descend img { height: 3vw; opacity: .85; }
#ds .ds-descend-depth {
  display: block; font-size: .8vw; font-weight: normal; color: #e8c9a8;
}
#ds .ds-descend.active {
  border-color: #ffaa2b;
  box-shadow: 0 0 22px rgba(255, 170, 43, .45);
}
/* フォーカス中は扉の光の筋がゆっくり明滅する */
#ds .ds-descend.active img { animation: ds-door-glow 2.2s ease-in-out infinite; }
#ds.entering .ds-descend { animation: ds-in-up .5s var(--ease-in) 1.25s both; }

/* --- 降下演出。画面そのものが開く扉になる --- */

/* 裂け目の向こう側の光。2 枚の <i> が閉じた扉で、開くとこれが現れる */
#ds .ds-split {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(60% 100% at 50% 50%, #3af08a 0%, #0a2a18 55%, #050805 100%);
}
#ds .ds-split i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: #050805;
}
#ds .ds-split i:first-child {
  left: 0;
  box-shadow: 6px 0 40px rgba(58, 240, 138, .8);
}
#ds .ds-split i:last-child {
  right: 0;
  box-shadow: -6px 0 40px rgba(58, 240, 138, .8);
}
/* 0.35s まで出さない。先に出すと UI が吸い込まれる様子を覆い隠してしまう */
#ds.exiting .ds-split { animation: ds-split-show .01s linear .35s forwards; }
#ds.exiting .ds-split i:first-child { animation: ds-split-l .5s var(--ease-in) .5s forwards; }
#ds.exiting .ds-split i:last-child { animation: ds-split-r .5s var(--ease-in) .5s forwards; }
/* 照明が落ちる */
#ds.exiting .ds-dim { opacity: .92; transition-duration: .3s; }
/* 全 UI が模型へ吸い込まれる */
#ds.exiting .ds-title, #ds.exiting .ds-sub, #ds.exiting .ds-yani,
#ds.exiting .ds-menu, #ds.exiting .ds-descend, #ds.exiting .ds-hint,
#ds.exiting .ds-detail, #ds.exiting .ds-nr {
  animation: ds-suck-in .3s var(--ease-out) forwards;
}
#ds.exiting .ds-part { transform: translate(calc(var(--sx) * 1px), calc(var(--sy) * 1px)); }
#ds.exiting .ds-figure { animation: ds-figure-out .45s var(--ease-out) .35s forwards; }
```

キーフレームを足す。

```css
@keyframes ds-door-glow { 0%, 100% { filter: none; } 50% { filter: drop-shadow(0 0 10px #3af08a) brightness(1.25); } }
@keyframes ds-suck-in { to { opacity: 0; transform: translate(2vw, 1vh) scale(.94); } }
@keyframes ds-figure-out { to { opacity: 0; transform: translate(-50%, -50%) scale(.9); } }
@keyframes ds-split-show { to { opacity: 1; } }
@keyframes ds-split-l { to { transform: translateX(-100%); } }
@keyframes ds-split-r { to { transform: translateX(100%); } }
```

- [ ] **Step 6: 型チェック・テスト・ビルド**

Run: `npm run typecheck` / `npm test` / `npm run build`
Expected: すべて成功

- [ ] **Step 7: ブラウザで通しの操作を確認する**

`death_screen_show(result, () => console.log('DESCEND'))` として、コールバックが 1 度だけ呼ばれることを確かめる。

- [ ] 初期状態で「地下へ戻る」に光が乗っている（既定フォーカス）
- [ ] `Enter` で UI が吸い込まれ、暗くなり、緑の裂け目が左右に開いて `DESCEND` が出力される
- [ ] `Esc`（idle）でも同じになる
- [ ] 強化モード中の `Esc` は収納だけで、降下しない
- [ ] パネル表示中の `Esc` はパネルを閉じるだけ
- [ ] 演出中に `Enter` を連打しても `DESCEND` の出力は 1 回だけ

- [ ] **Step 8: `prefers-reduced-motion` を確認する**

```js
// resize_window は colorScheme しか変えられないので、規則の存在をスタイルシートから確かめる
[...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
  .filter(r => r.conditionText && r.conditionText.includes('reduced-motion')).length
```

Expected: 1 以上

- [ ] **Step 9: コミット**

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "$(cat <<'EOF'
地下へ戻るボタンと降下演出を足す

巨大なオレンジの横長ボタンをやめ、右下のコンパクトな控えに変える。中に扉の
グリフと推奨深度を持ち、フォーカス中は扉の光の筋がゆっくり明滅する。

決定すると全 UI が模型へ吸い込まれ、照明が落ち、緑の光の裂け目が左右へ開いて
画面を飲む。背景に扉は写っていないので door.webp を背景へ貼らず、画面そのもの
が開く扉になることで「地下への扉が開く」を担う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: docs の更新

**Files:**
- Modify: `docs/meta-progression.md`
- Modify: `docs/architecture.md`
- Modify: `docs/equipment.md`

**Interfaces:**
- Consumes: Task 1〜10 で確定した実装
- Produces: なし（文書のみ）

- [ ] **Step 1: `docs/meta-progression.md`「死亡画面（リザルト＋闇サイト）とスコア」節を書き換える**

無効になる記述と、書くべき内容:

| 削除・修正する記述 | 新しい内容 |
| --- | --- |
| 「表示ロジックのうち…（死因メッセージ、体調テキスト、生存時間の書式）」 | 体調テキストを外し、状態機械と強調階層を足す |
| 「画面は左＝振り返り…右＝闇サイト…の 2 列で」の段落まるごと | Level 1 / 2 / 3 の情報階層と、人体模型を主 UI にした配置 |
| 「体調パネルは死因の説明に徹し…」 | 削除。代わりに「死因は見出し 1 行だけが担う」を書く |
| 強化行の「現在値 → 次の段の値」の説明 | 場所が縦リストから Level 2 詳細パネルへ移ったことだけ直す。効果の数値を getter から引く規約はそのまま |
| 「装備の行は買うものではないので左列に置く」 | 装備確認パネル（Level 3）へ移ったと書く |
| 「推奨深度は…『地下へ戻る』ボタンの中に出す」 | 変更なし（そのまま有効） |
| 「演出のバナーは `#ds` の兄弟として…」の段落 | `innerHTML` の再構築をやめたので `#ds` の内側に戻したと書く |

新しく書くべき不変条件:

- **DOM は 1 度だけ組み、以降はノードを作り直さない。** 作り直すと CSS アニメーションの位相が 0 に戻り、段階開示が成立しない
- **状態は `{ mode, focus, panel, busy }` の 1 オブジェクトに閉じ、遷移は `ds_reduce()` の純関数 1 本が持つ。** 副作用は `descend` / `buy` の 2 つだけを action として返し、パネルの開閉は状態そのものが語る
- **`Esc` は「1 段戻る」**（パネル → 強化モード → 降下）
- **既定フォーカスは「地下へ戻る」**
- **Level 2 / 3 の情報を Level 1 へ持ち上げない**

- [ ] **Step 2: `docs/architecture.md` を更新する**

| 行 | 変更 |
| --- | --- |
| L34-35 のモジュール一覧 | `death-screen.ts` の説明に「DOM を 1 度だけ組む」を足す。`death-screen-model.ts` から「体調テキスト」を外し「状態機械・強調階層」を足す。`body-figure.ts` と `gear-icons.ts` の行を新設する |
| L50 の Node 評価可能リスト | `death-screen-model`（→ `nicotine`）の依存表記を外す（実行時 import ゼロになった）。`body-figure`（→ `equipment` / `meta`）を加える |
| L146 の静的 import | 装備アイコン 30 枚の出どころを `equip-screen.ts` から `gear-icons.ts` へ直す。総枚数 45 は変わらない |

- [ ] **Step 3: `docs/equipment.md` L262「HUD と死亡画面」を更新する**

「置き場は左列（振り返り）で、装備 3 行として系統名と品名を等級色で並べる」を、装備確認パネル（`Enter` で開く Level 3、模型の装備部位から線で繋がったカード 3 枚）に書き換える。「装備は買うものではないので購入動線に入れない」「3 系統とも未所持のあいだは出さない」はそのまま有効なので残す。

- [ ] **Step 4: 記述と実装が食い違っていないか確認する**

同じ文言がコードとドキュメントに複製されていると、片方を直した時点で自己矛盾が生まれる。書き換えた語で grep して複製を数える。

```bash
grep -rn "体調\|condition_texts\|nicotine_ratio\|ds-status\|ds-buy\|闇サイトの強化行\|強化 6 行" docs source
```

Expected: 実装から消えた語がドキュメントに残っていないこと（`docs/story.md` など、この画面と無関係な文脈での「体調」は除く）

- [ ] **Step 5: 最終確認**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: コミット**

```bash
git add docs/meta-progression.md docs/architecture.md docs/equipment.md
git commit -m "$(cat <<'EOF'
死亡画面の再設計を設計書へ反映する

meta-progression.md の「死亡画面（リザルト＋闇サイト）とスコア」節を、
2 列レイアウト・強化 6 行・体調パネル・装備 3 行の記述から、Level 1/2/3 の
情報階層と人体模型を主 UI にした構成へ書き換える。

新しく明文化した不変条件:
- DOM は 1 度だけ組み、以降ノードを作り直さない（作り直すと CSS アニメー
  ションの位相が 0 に戻り、段階開示が成立しない）
- 状態は 1 オブジェクトに閉じ、遷移は ds_reduce() の純関数 1 本が持つ
- Esc は「1 段戻る」（パネル → 強化モード → 降下）
- Level 2/3 の情報を Level 1 へ持ち上げない

architecture.md はモジュール一覧・Node 評価可能リスト・静的 import の
出どころを、equipment.md は装備の置き場を更新した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## セルフレビュー結果

計画を書き終えてから仕様書と突き合わせ、次を直した。

1. **SVG に `z-index` は無い** — 重ね順は文書順で決まる。当初 `.ds-body` を SVG の**外**の `<img>` に置いたまま `z-index` で「接続線 → 下地 → 器官 → アイコン」を作ろうとしていたが、これは成立しない。下地を SVG の中の `<image x="0" y="0" width="256" height="512">` へ移し、文書順で重ね順を作る形に直した。副産物として、下地を viewBox に合わせるための百分率（`left: 19.23%` など）が不要になった
2. **`opacity` は 1 で頭打ち** — `#ds.mode-upgrade .ds-scrim { opacity: 1.28 }` は何もしない（既に 1 のため）。段階的な減光の専用レイヤー `.ds-dim` を足し、強化モード .22 / パネル .42 / 降下 .92 と上げる形に直した。⑦ の「照明が落ちる」もこの 1 枚が担う
3. **`ds-recoil` を `.ds-body` にも当てていた** — このキーフレームは `translate(-50%, -50%)` を土台にしており、それを持たない SVG の `<image>` に当てると模型が画面外へ飛ぶ。`.ds-figure` だけに限定した
4. **降下演出の裂け目に「向こう側」が無かった** — 2 枚の扉が開いても背後が同じ暗色で、開いたことが分からない。`.ds-split` 自体に緑の放射グラデーションを敷き、扉が開くとそれが現れる形にした。併せて、裂け目を 0.35s まで出さないようにした（先に出すと UI が吸い込まれる様子を覆い隠す）
5. **`--c` の未設定** — `fill_detail()` が走る前の `.ds-detail` は `--c` を持たず `border-left-color` が無効になる。既定色を規則に持たせた
6. **`meta_upgrade_id_t` の import 漏れ** — Task 7 の `upgrade_sfx` テーブルが型を要るのに、Task 5 の import 一覧から外していた。Task 7 Step 1 に型 import を足した
7. **`record_index` が使用より後に宣言されていた** — 実行順では問題ないが読みにくいので、`record_row()` の前へ移した
8. **`gear_anchor_slots` の再エクスポート** — テストは `gear_slots` を `./equipment` から直接引くので、この再エクスポートは使われない。`AGENTS.md`「呼び出し元が 1 箇所しかないものに抽象化レイヤーを作らない」に反するので削除した

さらに、前回の見直しで入れていた次の 5 点もそのまま有効である。

- `ds_idle_record` / `ds_idle_gear` は Task 5 の時点では使わないので import しない（`tsc --noEmit` が未使用 import で落ちる）
- `.ds-descend` は Task 10 で加わるので、強調階層のループを `[data-item]` 全体へ広げる
- 演出中に降下すると消えた画面の上でタイマーが発火するため、`descend()` で `clearTimeout(upgrade_timer)` を呼ぶ
- `entering` の class は付け直すだけでは再生されない。`remove` → 強制リフロー → `add` の順にする
- 仕様の「数値のロールアップ」は、桁が動くだけの演出が §6 の「重い・暗い・機械的」から外れるので、1 度の点滅（`ds-value-in`）に落とした

**仕様のうち、この計画が意図的に見送った点はない。** §1〜§20 の各項は Task 1〜11 のいずれかで実装される。
