# 計画B: 通貨「ヤニ」と恒久強化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ローグライト中核（実装済み）に、通貨「ヤニ」とラン間の恒久強化（闇サイトメニュー・嗅覚・予備の一本・localStorage 保存）を足す。

**Architecture:** 恒久状態は新規の葉モジュール `source/meta.ts` に置く（`state.ts` はラン状態専用のまま）。ヤニは拾得エンティティ `entity-yani.ts` と敵ドロップ・フロア到達ボーナスで貯まり、ラン終了時に `meta` へ合算して保存する。メニューは `terminal_el` を流用した DOM クリック式（`menu.ts`）。嗅覚は純粋関数 `sniff.ts`（BFS）+ `minimap.ts` の矢印描画。

**Tech Stack:** TypeScript + Vite。テストは Vitest（`npm test` / 個別は `npx vitest run source/<file>.test.ts`）。型チェックは `npm run typecheck`。

**設計書:** `docs/superpowers/specs/2026-08-20-plan-b-yani-meta-progression.md`（数値・理屈の正はこちら）

## Global Constraints

- 後方互換なし: 置き換えた古い経路・引数・文言は削除する（AGENTS.md）
- `state.ts` / `meta.ts` / `nicotine.ts` / `sniff.ts` / `level-generator.ts` は実行時に renderer / dom / audio / terminal を import しない（Node でモックなしに評価できること）
- コスト: `20 << level`（20/40/80/160/320）。3 段の項目は先頭 3 つ。全解放合計 1660
- 効果値: 肺活量 +10/段（最大 150）、耐性 −6%/段（係数 0.70）、火力 −12%/段（係数 0.64）、予備の一本 = 50% 回復 × レベル回数、嗅覚 1段=30%以下で方向 / 2段=60%以下に緩和 / 3段=距離表示
- 死亡時ヤニは全額持ち帰り。スコアはベスト深度のみ保存
- コミットメッセージは日本語・動詞終止（例: `feat: 通貨ヤニの恒久状態 meta.ts を追加する`）
- 各タスクの最後に `npm run typecheck` と `npm test` が通ること

---

### Task 1: meta.ts — 恒久状態・強化テーブル・保存

**Files:**
- Create: `source/meta.ts`
- Test: `source/meta.test.ts`

**Interfaces:**
- Consumes: `nicotine.ts` の `nicotine_stage_edgy` / `nicotine_stage_withdrawal`（葉→葉なので可）
- Produces（後続タスクが使う正確な名前）:
  - `meta`（`{ yani: number, best_depth: number, persistent: boolean, levels: Record<meta_upgrade_id_t, number> }`）
  - `meta_upgrade_ids`, `type meta_upgrade_id_t = 'lung'|'tolerance'|'sniff'|'power'|'spare'`
  - `meta_max_level: Record<meta_upgrade_id_t, number>`
  - `meta_upgrade_cost(level: number): number`
  - `meta_buy(id: meta_upgrade_id_t): boolean`
  - `meta_nicotine_max(): number` / `meta_drain_factor(): number` / `meta_power_factor(): number` / `meta_spare_count(): number`
  - `meta_sniff_active(stage: number): boolean`
  - `meta_load(): void` / `meta_save(): void`

- [ ] **Step 1: 失敗するテストを書く**

`source/meta.test.ts` を新規作成:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  meta, meta_buy, meta_drain_factor, meta_load, meta_max_level,
  meta_nicotine_max, meta_power_factor, meta_save, meta_sniff_active,
  meta_spare_count, meta_upgrade_cost, meta_upgrade_ids,
} from './meta'
import {
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_normal,
  nicotine_stage_withdrawal,
} from './nicotine'

// meta はモジュールレベルの可変オブジェクトなので、テストごとに手で初期化する
function meta_reset(): void {
  meta.yani = 0
  meta.best_depth = 0
  meta.persistent = true
  for (const id of meta_upgrade_ids) { meta.levels[id] = 0 }
}

// Node には localStorage が無い。保存・読込のテストではスタブを差す
function stub_storage(): Record<string, string> {
  const store: Record<string, string> = {}
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return store
}

describe('強化テーブル', () => {
  beforeEach(meta_reset)

  it('コストは 20/40/80/160/320 の倍々', () => {
    expect([0, 1, 2, 3, 4].map(meta_upgrade_cost)).toEqual([20, 40, 80, 160, 320])
  })

  it('購入で残高が減りレベルが上がる', () => {
    meta.yani = 25
    expect(meta_buy('lung')).toBe(true)
    expect(meta.yani).toBe(5)
    expect(meta.levels.lung).toBe(1)
  })

  it('残高不足なら購入できない', () => {
    meta.yani = 19
    expect(meta_buy('lung')).toBe(false)
    expect(meta.yani).toBe(19)
    expect(meta.levels.lung).toBe(0)
  })

  it('最大レベルでは購入できない', () => {
    meta.yani = 9999
    meta.levels.sniff = meta_max_level.sniff
    expect(meta_buy('sniff')).toBe(false)
    expect(meta.yani).toBe(9999)
  })

  it('全解放の合計コストは 1660', () => {
    let total = 0
    for (const id of meta_upgrade_ids) {
      for (let level = 0; level < meta_max_level[id]; level++) {
        total += meta_upgrade_cost(level)
      }
    }
    expect(total).toBe(1660)
  })
})

describe('強化の効果値', () => {
  beforeEach(meta_reset)

  it('肺活量: 最大ゲージは 100 + 10/段、全強化で 150', () => {
    expect(meta_nicotine_max()).toBe(100)
    meta.levels.lung = 5
    expect(meta_nicotine_max()).toBe(150)
  })

  it('耐性: 減少係数は 1 − 0.06/段、全強化で 0.70', () => {
    expect(meta_drain_factor()).toBeCloseTo(1, 6)
    meta.levels.tolerance = 5
    expect(meta_drain_factor()).toBeCloseTo(0.7, 6)
  })

  it('火力: 射撃間隔係数は 1 − 0.12/段、全強化で 0.64', () => {
    expect(meta_power_factor()).toBeCloseTo(1, 6)
    meta.levels.power = 3
    expect(meta_power_factor()).toBeCloseTo(0.64, 6)
  })

  it('予備の一本: 使用可能回数はレベルと同数', () => {
    expect(meta_spare_count()).toBe(0)
    meta.levels.spare = 2
    expect(meta_spare_count()).toBe(2)
  })
})

describe('嗅覚の発動条件', () => {
  beforeEach(meta_reset)

  it('未購入では発動しない', () => {
    expect(meta_sniff_active(nicotine_stage_limit)).toBe(false)
  })

  it('1 段は離脱症状帯（30% 以下）のみ', () => {
    meta.levels.sniff = 1
    expect(meta_sniff_active(nicotine_stage_normal)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_withdrawal)).toBe(true)
    expect(meta_sniff_active(nicotine_stage_limit)).toBe(true)
  })

  it('2 段以上はそわそわ帯（60% 以下）に緩和される', () => {
    meta.levels.sniff = 2
    expect(meta_sniff_active(nicotine_stage_normal)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(true)
    meta.levels.sniff = 3
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(true)
  })
})

describe('保存と読み込み', () => {
  beforeEach(meta_reset)
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('localStorage が無い環境では persistent が false になり初期値のまま', () => {
    meta_load()
    expect(meta.persistent).toBe(false)
    expect(meta.yani).toBe(0)
  })

  it('保存して読み込むと復元される', () => {
    stub_storage()
    meta.yani = 123
    meta.best_depth = 9
    meta.levels.lung = 3
    meta_save()
    meta_reset()
    meta_load()
    expect(meta.persistent).toBe(true)
    expect(meta.yani).toBe(123)
    expect(meta.best_depth).toBe(9)
    expect(meta.levels.lung).toBe(3)
  })

  it('壊れた保存データは捨てて初期値で始める', () => {
    const store = stub_storage()
    store['takagi_meta'] = '{壊れたJSON'
    meta_load()
    expect(meta.persistent).toBe(true)
    expect(meta.yani).toBe(0)
  })

  it('範囲外の値は最大レベルに丸める', () => {
    const store = stub_storage()
    store['takagi_meta'] = JSON.stringify({
      yani: -5, best_depth: 3.7, levels: { lung: 99, sniff: 2 },
    })
    meta_load()
    expect(meta.yani).toBe(0)
    expect(meta.best_depth).toBe(3)
    expect(meta.levels.lung).toBe(meta_max_level.lung)
    expect(meta.levels.sniff).toBe(2)
    expect(meta.levels.power).toBe(0)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/meta.test.ts`
Expected: FAIL（`./meta` が存在しない）

- [ ] **Step 3: meta.ts を実装する**

`source/meta.ts` を新規作成:

```ts
import { nicotine_stage_edgy, nicotine_stage_withdrawal } from './nicotine'

// ラン間で持ち越す恒久状態と強化テーブル。ラン状態（state.ts）と寿命が違うため
// 分離する。state.ts と同様に実行時依存を持たない葉モジュールで、
// Node（Vitest）でモックなしに評価できることが条件。

export const meta_upgrade_ids = ['lung', 'tolerance', 'sniff', 'power', 'spare'] as const
export type meta_upgrade_id_t = (typeof meta_upgrade_ids)[number]

export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 5, tolerance: 5, sniff: 3, power: 3, spare: 3,
}

export const meta = {
  yani: 0,
  best_depth: 0,
  // localStorage が使えない環境（プライベートモード等）で false。
  // メニューが「このセッション限り」の警告を出すために読む
  persistent: true,
  levels: { lung: 0, tolerance: 0, sniff: 0, power: 0, spare: 0 } as
    Record<meta_upgrade_id_t, number>,
}

// コストは段階ごとに倍々: 20/40/80/160/320。3 段の項目は先頭 3 つを使う。
// 全解放の合計は 1660
export function meta_upgrade_cost(level: number): number {
  return 20 << level
}

export function meta_buy(id: meta_upgrade_id_t): boolean {
  const level = meta.levels[id]
  if (level >= meta_max_level[id]) { return false }
  const cost = meta_upgrade_cost(level)
  if (meta.yani < cost) { return false }
  meta.yani -= cost
  meta.levels[id]++
  meta_save()
  return true
}

export function meta_nicotine_max(): number {
  return 100 + 10 * meta.levels.lung
}

// 減少速度に掛ける係数。全強化 0.70 は、最大ゲージ 1.5 倍と合わせた実効 2.143 倍が
// nicotine_drain_rate の √ 式と深度 37 で釣り合う前提の値（gameplay.md 参照）
export function meta_drain_factor(): number {
  return 1 - 0.06 * meta.levels.tolerance
}

// shot_interval() に渡す火力係数。3 段で 0.64
export function meta_power_factor(): number {
  return 1 - 0.12 * meta.levels.power
}

export function meta_spare_count(): number {
  return meta.levels.spare
}

// 嗅覚は「追い詰められたときだけ働く救済」。恒久ナビにすると中核の問い
// （ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化するため、
// 1 段は離脱症状帯（30% 以下）のみ、2 段以上でそわそわ帯（60% 以下）に緩和
export function meta_sniff_active(stage: number): boolean {
  if (meta.levels.sniff === 0) { return false }
  const threshold = meta.levels.sniff >= 2
    ? nicotine_stage_edgy
    : nicotine_stage_withdrawal
  return stage >= threshold
}

const meta_storage_key = 'takagi_meta'

function meta_clamp_int(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value | 0)
    : 0
}

export function meta_load(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(meta_storage_key)
    meta.persistent = true
  } catch {
    meta.persistent = false
    return
  }
  if (!raw) { return }
  try {
    const data = JSON.parse(raw) as {
      yani?: unknown, best_depth?: unknown, levels?: Record<string, unknown>,
    }
    meta.yani = meta_clamp_int(data.yani)
    meta.best_depth = meta_clamp_int(data.best_depth)
    for (const id of meta_upgrade_ids) {
      meta.levels[id] = Math.min(meta_clamp_int(data.levels?.[id]), meta_max_level[id])
    }
  } catch {
    // 壊れた保存データは捨てて初期値のまま始める
  }
}

export function meta_save(): void {
  try {
    localStorage.setItem(meta_storage_key, JSON.stringify({
      yani: meta.yani, best_depth: meta.best_depth, levels: meta.levels,
    }))
  } catch {
    meta.persistent = false
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/meta.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 型チェックと全テスト**

Run: `npm run typecheck && npm test`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add source/meta.ts source/meta.test.ts
git commit -m "feat: 恒久状態と強化テーブルの meta.ts を追加する"
```

---

### Task 2: shot_interval に火力係数を追加し、自機が使う

**Files:**
- Modify: `source/nicotine.ts:31-33`（`shot_interval`）
- Modify: `source/entity-player.ts:61`（`shot_interval` 呼び出し）
- Test: `source/nicotine.test.ts` / `source/entity-player.test.ts`

**Interfaces:**
- Consumes: Task 1 の `meta`, `meta_power_factor()`
- Produces: `shot_interval(stage: number, power_factor?: number): number`（省略時 1。既存呼び出しは互換）

- [ ] **Step 1: 失敗するテストを書く**

`source/nicotine.test.ts` の `describe('段階効果', ...)` 内、「離脱症状では射撃間隔が 1.8 倍になる」テストの直後に追加:

```ts
  // 計画B: 基礎 0.1 秒 × 火力係数（強化） × ニコチン係数 の順に掛ける
  it('火力係数が射撃間隔に掛かる（全強化 0.64）', () => {
    expect(shot_interval(nicotine_stage_normal, 0.64)).toBeCloseTo(0.064, 6)
    expect(shot_interval(nicotine_stage_withdrawal, 0.64)).toBeCloseTo(0.1152, 6)
    expect(shot_interval(nicotine_stage_normal)).toBeCloseTo(0.1, 6) // 省略時は 1
  })
```

`source/entity-player.test.ts` に、import へ `import { meta } from './meta'` を追加し、`describe('自機とニコチン段階', ...)` の `beforeEach` に `meta.levels.power = 0` を 1 行追加。さらに「離脱症状では射撃間隔が 1.8 倍になる」テストの直後に追加:

```ts
  it('火力強化で射撃間隔が縮む（3 段で 0.064 秒）', () => {
    meta.levels.power = 3
    keys[key_shoot] = 1
    player._update() // 1 発目
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.05
    player._update()
    expect(plasma_count()).toBe(1) // 0.064 秒に届かない

    state.time_elapsed = 0.02
    player._update()
    expect(plasma_count()).toBe(2)
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/nicotine.test.ts source/entity-player.test.ts`
Expected: 新規 2 件が FAIL（引数が無い / 係数が効かない）

- [ ] **Step 3: 実装する**

`source/nicotine.ts` の `shot_interval` を置き換え:

```ts
// 基礎 0.1 秒 × 火力係数（恒久強化、省略時 1） × ニコチン係数（離脱症状で 1.8）
export function shot_interval(stage: number, power_factor = 1): number {
  return 0.1 * power_factor * (stage >= nicotine_stage_withdrawal ? 1.8 : 1)
}
```

`source/entity-player.ts`: import に `meta_power_factor` を追加（`import { meta_power_factor } from './meta'`）し、射撃処理の

```ts
      t._last_shot = shot_interval(stage)
```

を

```ts
      t._last_shot = shot_interval(stage, meta_power_factor())
```

に変更。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/nicotine.test.ts source/entity-player.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェックと全テスト、コミット**

```bash
npm run typecheck && npm test
git add source/nicotine.ts source/nicotine.test.ts source/entity-player.ts source/entity-player.test.ts
git commit -m "feat: 射撃間隔に恒久強化の火力係数を掛ける"
```

---

### Task 3: ラン状態への接続（最大ゲージ・減少係数・ヤニ集計・ベスト深度）

**Files:**
- Modify: `source/state.ts:15-32`（フィールド追加）
- Modify: `source/game.ts:26-48`（`run_start` / `next_level` / `run_end`）、`source/game.ts:143-148`（減少式）

**Interfaces:**
- Consumes: Task 1 の `meta`, `meta_nicotine_max()`, `meta_drain_factor()`, `meta_spare_count()`, `meta_save()`
- Produces: `state.yani_run: number`（このランで得たヤニ）、`state.spares_left: number`（予備の一本の残数）。後続タスク（5, 6, 8）が読み書きする

- [ ] **Step 1: state.ts にフィールドを足す**

`state` オブジェクトの `kills: 0,` の直後に追加:

```ts
  yani_run: 0, // このランで得たヤニ。run_end() が meta.yani に合算する
  spares_left: 0, // 予備の一本の残数。run_start() が強化レベルから設定する
```

- [ ] **Step 2: game.ts を接続する**

import に追加:

```ts
import {
  meta, meta_drain_factor, meta_nicotine_max, meta_save, meta_spare_count,
} from './meta'
```

`run_start()` を変更（`nicotine_max` の固定 100 を恒久強化値に置き換え、ヤニと残数を初期化）:

```ts
export function run_start(): void {
  // ラン開始ごとにシードを引く。シードを深度から一意に決めると、どのランでも
  // 深度 1 が同じ間取りになって暗記ゲーになる。
  state.run_seed = ((Math.random() * 0x7ffffffe) | 0) + 1
  state.depth = 0
  state.kills = 0
  state.yani_run = 0
  state.spares_left = meta_spare_count()
  state.nicotine_max = meta_nicotine_max()
  state.nicotine = state.nicotine_max
  state.game_running = 1
  next_level()
}
```

`next_level()` にフロア到達ボーナスを追加:

```ts
export function next_level(): void {
  state.depth++
  state.yani_run += state.depth // フロア到達ボーナス: そのフロアの深度と同数
  load_level(state.depth)
}
```

`run_end()` に合算・ベスト深度・保存を追加（リザルト表示の変更は Task 8。この時点では既存の `terminal_show_result(state.depth, state.kills, run_start)` のまま）:

```ts
export function run_end(): void {
  state.game_running = 0
  minimap_hide()
  hud_hide()
  // 死亡時も全額持ち帰り。ランごとに失う設計は「損した」感覚を残すだけで
  // 深度を伸ばす動機にならない（設計書）
  meta.yani += state.yani_run
  meta.best_depth = Math.max(meta.best_depth, state.depth)
  meta_save()
  terminal_show_result(state.depth, state.kills, run_start)
}
```

`game_tick()` のニコチン減少式に耐性係数を掛ける:

```ts
    state.nicotine = Math.max(
      0,
      state.nicotine -
        nicotine_drain_rate(state.depth) * meta_drain_factor() * state.time_elapsed,
    )
```

- [ ] **Step 3: 型チェックと全テスト**

Run: `npm run typecheck && npm test`
Expected: エラーなし（game.ts は DOM 依存のため単体テストなし。既存テストの回帰確認が目的）

- [ ] **Step 4: コミット**

```bash
git add source/state.ts source/game.ts
git commit -m "feat: ランに恒久強化の数値とヤニ集計を接続する"
```

---

### Task 4: 床のヤニ配置（level-generator）

**Files:**
- Modify: `source/level-generator.ts:20-30`（`level_layout_t`）、`source/level-generator.ts:299-305`（配置と返却）
- Test: `source/level-generator.test.ts`

**Interfaces:**
- Produces: `level_layout_t.yani: tile_pos_t[]`（1 フロアあたり 1〜3 個。床タイル上、他の配置物と重複しない）

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` の「体力回復アイテムは 2〜4 個」テストの直後に追加（同ファイルのヘルパ `is_floor` / seeds の書き方は既存テストに合わせる。既存テストが使うシード集合をそのまま使うこと）:

```ts
  it('ヤニは 1〜3 個で床タイルの上にある', () => {
    for (const seed of seeds) {
      const layout = generate_level(1, seed)
      expect(layout.yani.length).toBeGreaterThanOrEqual(1)
      expect(layout.yani.length).toBeLessThanOrEqual(3)
      for (const p of layout.yani) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
      }
    }
  })
```

さらに既存の「敵とアイテムは床タイルの上にあり、互いに重ならない」テストと「敵とアイテムは開始地点から 8 タイル以上離れている」テストで、走査対象の配列リスト（`layout.spiders` / `layout.sentries` / `layout.health` を連結している箇所）に `layout.yani` を追加する。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/level-generator.test.ts`
Expected: 新規テストが FAIL（`yani` が undefined）

- [ ] **Step 3: 実装する**

`level_layout_t` に追加:

```ts
  yani: tile_pos_t[] // 床に散在する吸い殻
```

`build_layout()` の配置部を変更。`take` の抽選順は既存の後ろに足す（先頭に挟むと既存シードの敵配置が変わる）:

```ts
  const sentries = take(sentry_count(depth))
  const spiders = take(enemy_budget(depth) - sentries.length)
  const health = take(random_int(2, 4))
  const yani = take(random_int(1, 3)) // 床への散在: 1 フロアあたり 1〜3（設計書）

  return {
    tiles, rooms, start, smoking_area, dummies, exit, spiders, sentries, health, yani,
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/level-generator.test.ts`
Expected: PASS（既存テスト含む）

- [ ] **Step 5: 型チェックと全テスト、コミット**

```bash
npm run typecheck && npm test
git add source/level-generator.ts source/level-generator.test.ts
git commit -m "feat: フロアに吸い殻を 1〜3 個散在させる"
```

---

### Task 5: entity-yani（拾得）と敵ドロップ

**Files:**
- Create: `source/entity-yani.ts`
- Modify: `source/entity-spider.ts:68-75`（`_kill`）、`source/entity-sentry.ts:69-77`（`_kill`）、`source/game.ts:110-112`（配置）
- Test: `source/entity-yani.test.ts`

**Interfaces:**
- Consumes: `state.yani_run`（Task 3）、`layout.yani`（Task 4）
- Produces: `entity_yani_t`（`new entity_yani_t(x, 0, z, 5, 26)` で生成。自機接触で `state.yani_run++` して消える）

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-yani.test.ts` を新規作成（モックは `entity-smoking-area.test.ts` と同じパターン）:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_toggle: () => {},
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
}))
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
vi.mock('./game', () => ({ run_end: () => {}, next_level: () => {} }))

import { entity_player_t } from './entity-player'
import { entity_spider_t } from './entity-spider'
import { entity_yani_t } from './entity-yani'
import { level_data, state } from './state'

describe('ヤニ', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    state.yani_run = 0
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('拾うとラン内のヤニが 1 増えて消える', () => {
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    yani._check(player)
    expect(state.yani_run).toBe(1)
    expect(yani._dead).toBe(true)
  })

  it('自機以外には反応しない', () => {
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    const spider = new entity_spider_t(64, 0, 64, 5, 27)
    yani._check(spider)
    expect(state.yani_run).toBe(0)
    expect(yani._dead).toBe(false)
  })

  it('蜘蛛は 50% の抽選に当たるとヤニを落とす', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4) // < 0.5 で当選
    const spider = new entity_spider_t(16, 0, 16, 5, 27)
    spider._receive_damage(player, 999)
    expect(state.entities.some((e) => e instanceof entity_yani_t)).toBe(true)
  })

  it('抽選に外れるとヤニを落とさない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    const spider = new entity_spider_t(16, 0, 16, 5, 27)
    spider._receive_damage(player, 999)
    expect(state.entities.some((e) => e instanceof entity_yani_t)).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/entity-yani.test.ts`
Expected: FAIL（`./entity-yani` が存在しない）

- [ ] **Step 3: 実装する**

`source/entity-yani.ts` を新規作成:

```ts
import { audio_play, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_light } from './renderer'
import { state } from './state'

// 吸い殻。拾うとラン内のヤニが 1 増える。meta への合算は run_end() が行う。
// スプライトは 26（HP バーと同じ白点）を火種に見立て、専用の絵は用意しない
export class entity_yani_t extends entity_t {
  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) {
      this._kill()
      state.yani_run++
      audio_play(audio_sfx_pickup)
    }
  }

  override _render(): void {
    super._render()
    // 弱いオレンジの光で、暗い床でも吸い殻の火種として見つけられるようにする
    push_light(this.x, 2, this.z + 4, 1.0, 0.4, 0.1, 0.3)
  }
}
```

`source/entity-spider.ts` の `_kill()` 末尾（`audio_play(audio_sfx_explode)` の後）に追加。import も追加（`import { entity_yani_t } from './entity-yani'`）:

```ts
    // 敵ドロップ: 撃破ごとに 50% で吸い殻を 1 つ落とす（設計書）
    if (Math.random() < 0.5) { new entity_yani_t(this.x, 0, this.z, 5, 26) }
```

`source/entity-sentry.ts` の `entity_sentry_t._kill()` にも同じ 2 行（import + ドロップ）を追加。`entity_sentry_plasma_t` には足さない（弾の消滅はドロップ対象外）。

`source/game.ts` の `load_level()`、`layout.health` の配置行の直後に追加。import も追加（`import { entity_yani_t } from './entity-yani'`）:

```ts
  for (const p of layout.yani) { new entity_yani_t(p.x * 8, 0, p.z * 8, 5, 26) }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/entity-yani.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェックと全テスト、コミット**

```bash
npm run typecheck && npm test
git add source/entity-yani.ts source/entity-yani.test.ts source/entity-spider.ts source/entity-sentry.ts source/game.ts
git commit -m "feat: 吸い殻の拾得エンティティと敵ドロップを追加する"
```

---

### Task 6: 予備の一本（E キー・HUD 残数表示）

**Files:**
- Modify: `source/input.ts`（キー 69 とエッジ検出）
- Modify: `source/entity-player.ts:23-65`（`_update` に使用処理）
- Modify: `source/hud.ts` / `source/dom.ts` / `index.html`（残数表示 `#sp`）
- Modify: `source/game.ts:201`（`hud_update` 呼び出し）
- Test: `source/entity-player.test.ts`

**Interfaces:**
- Consumes: `state.spares_left`（Task 3）
- Produces: `key_spare = 69`（`input.ts`）。エッジ検出の契約: keydown（非リピート）で 1、使用側が処理後に 0 へ戻す、リピートでは 1 に戻らない。`hud_update(nicotine, nicotine_max, stage, spares)` の第 4 引数

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-player.test.ts` の import に `key_spare` を追加（`import { key_right, key_shoot, key_spare, keys } from './input'`）し、ファイル末尾に describe を追加:

```ts
describe('予備の一本', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 20
    state.nicotine_max = 100
    state.smoking = 0
    state.game_running = 1
    state.spares_left = 2
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('E キーで 50% 回復し、残数が減り、キーは消費される', () => {
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(70)
    expect(state.spares_left).toBe(1)
    expect(keys[key_spare]).toBe(0)
  })

  it('回復は最大値で頭打ちになる', () => {
    state.nicotine = 80
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(100)
  })

  it('残数 0 では何も起きない', () => {
    state.spares_left = 0
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(keys[key_spare]).toBe(0)
  })

  it('一服中は使えず、残数も減らない', () => {
    state.smoking = 1
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(state.spares_left).toBe(2)
  })

  // リザルト表示中に terminal_show_notice を呼ぶと、表示チェーンが壊れて
  // クリック復帰できなくなる（既存レビュー Finding 1 と同じ構図）
  it('ラン終了後は使えない', () => {
    state.game_running = 0
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(state.spares_left).toBe(2)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/entity-player.test.ts`
Expected: 新規 describe が FAIL（`key_spare` が存在しない）

- [ ] **Step 3: input.ts を実装する**

`source/input.ts` を変更。`keys` 初期値に 69 を追加し、エクスポートとハンドラを足す:

```ts
export const keys: Record<number, number> = { 32: 0, 37: 0, 38: 0, 39: 0, 40: 0, 69: 0 }
```

```ts
export const key_spare = 69
```

`input_init()` の `onkeydown` で、M キーの分岐の後・`set_key(ev, 1)` の前に追加:

```ts
    // E（予備の一本）: 押しっぱなしで 1 のままだと毎フレーム発動してしまう。
    // 非リピートの keydown だけ 1 にし、使用側（entity-player）が処理後に 0 へ
    // 戻す。リピート keydown では 1 に戻さないので、押しっぱなしでも 1 回きり
    if (ev.keyCode === key_spare) {
      if (!ev.repeat) { keys[key_spare] = 1 }
      ev.preventDefault()
      return
    }
```

（keyup は `set_key(ev, 0)` が `69 in keys` になったので既存のまま 0 に戻す）

- [ ] **Step 4: entity-player.ts を実装する**

import を追加:

```ts
import { key_down, key_left, key_right, key_shoot, key_spare, key_up, keys } from './input'
import { terminal_show_notice } from './terminal'
```

`_update()` 内、射撃処理ブロックの直前に追加:

```ts
    // 予備の一本: E で 50% 回復。エッジ検出は input.ts と対で、処理したら 0 へ戻す。
    // こっそり浅く吸うだけなので感知器は作動せず（非常口は開かない）、回復も半分止まり。
    // リザルト表示中の terminal_show_notice は表示チェーンを壊すので game_running を見る
    if (keys[key_spare]) {
      keys[key_spare] = 0
      if (!smoking && state.game_running && state.spares_left > 0) {
        state.spares_left--
        state.nicotine = Math.min(
          state.nicotine_max, state.nicotine + state.nicotine_max * 0.5,
        )
        audio_play(audio_sfx_pickup)
        terminal_show_notice('隠れて一服した（残り ' + state.spares_left + ' 本）')
      }
    }
```

`audio_sfx_pickup` を audio の import に追加。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run source/entity-player.test.ts`
Expected: PASS

- [ ] **Step 6: HUD に残数を出す**

`index.html` に要素とスタイルを追加。`<div id="n">` の行の直後に:

```html
	<code id="sp"></code>
```

`<style>` 内の `#nf{...}` の行の直後に:

```css
		#sp{position:absolute;bottom:2vw;left:45vw;color:#e90;font-weight:bold;font-size:1.3vw;text-shadow:0 0 7px #f70;display:none;}
```

`source/dom.ts` に追加:

```ts
export const spare_el = document.getElementById('sp') as HTMLElement
```

`source/hud.ts` を変更（表示・非表示にも `spare_el` を連動させ、`hud_update` に第 4 引数を足す）:

```ts
import { nicotine_bar, nicotine_fill, spare_el } from './dom'
import { stage_color } from './nicotine'

// ニコチンゲージは push_sprite() ではなく DOM オーバーレイで描く。
// HP バーと同じ手で画面下部に置くと、傾いたビュー行列のぶん遠くなって
// スプライトが読めない大きさになり、直すには renderer.ts を触ることになる。

export function hud_show(): void {
  nicotine_bar.style.display = 'block'
  spare_el.style.display = 'block'
}

export function hud_hide(): void {
  nicotine_bar.style.display = 'none'
  spare_el.style.display = 'none'
}

export function hud_update(
  nicotine: number, nicotine_max: number, stage: number, spares: number,
): void {
  nicotine_fill.style.width = (nicotine / nicotine_max) * 100 + '%'
  nicotine_fill.style.background = stage_color(stage)
  spare_el.textContent = spares > 0 ? '予備の一本 ×' + spares + ' [E]' : ''
}
```

`source/game.ts` の呼び出しを変更:

```ts
  hud_update(state.nicotine, state.nicotine_max, stage, state.spares_left)
```

- [ ] **Step 7: 型チェックと全テスト、コミット**

```bash
npm run typecheck && npm test
git add source/input.ts source/entity-player.ts source/entity-player.test.ts source/hud.ts source/dom.ts source/game.ts index.html
git commit -m "feat: E キーの予備の一本と残数 HUD を追加する"
```

---

### Task 7: 嗅覚（sniff.ts の BFS とミニマップ矢印・距離表示）

**Files:**
- Create: `source/sniff.ts`
- Modify: `source/level-generator.ts:152`（`bfs_distances` を export）
- Modify: `source/entity-smoking-area.ts:20`（`_done` を公開）
- Modify: `source/minimap.ts`（矢印描画・1 秒間隔の再計算・距離表示）
- Modify: `source/dom.ts` / `index.html`（`#sn`）
- Test: `source/sniff.test.ts`

**Interfaces:**
- Consumes: `meta_sniff_active(stage)` / `meta.levels.sniff`（Task 1）、`level-generator.ts` の `bfs_distances(tiles, start): Int32Array`（このタスクで export にする）
- Produces: `sniff_find(tiles: Uint8Array, player_x: number, player_z: number, targets: {x: number, z: number}[]): sniff_result_t | null`（`sniff_result_t = { angle: number, dist: number }`。座標はすべてタイル単位）

- [ ] **Step 1: 失敗するテストを書く**

`source/sniff.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { sniff_find } from './sniff'
import { level_height, level_width } from './state'

function make_tiles(): Uint8Array {
  return new Uint8Array(level_width * level_height)
}

describe('嗅覚の残り香探索', () => {
  it('通路の先の目標への方角と BFS 距離を返す', () => {
    const tiles = make_tiles()
    // z=1 の横一列に床。目標タイル (10,1) は生成器と同じく壁（8）
    for (let x = 1; x <= 20; x++) { tiles[x + level_width] = 1 }
    tiles[10 + level_width] = 8

    const r = sniff_find(tiles, 1, 1, [{ x: 10, z: 1 }])!
    expect(r).not.toBeNull()
    expect(r.dist).toBe(9) // 隣接床 (9,1) まで 8 歩 + 1
    expect(r.angle).toBeCloseTo(0, 6) // 真東
  })

  it('ユークリッド距離ではなく BFS 距離で最寄りを選ぶ', () => {
    const tiles = make_tiles()
    // z=1 と z=3 の平行な通路。x=20 でだけ縦につながる
    for (let x = 1; x <= 20; x++) {
      tiles[x + 1 * level_width] = 1
      tiles[x + 3 * level_width] = 1
    }
    tiles[20 + 2 * level_width] = 1
    // 目標A (2,3): 直線距離 2 だが、経路は x=20 経由の大回り
    tiles[2 + 3 * level_width] = 8
    // 目標B (15,0): 直線距離 14 だが、通路沿いですぐ（隣接床 (15,1)）
    tiles[15 + 0 * level_width] = 8

    const r = sniff_find(tiles, 1, 1, [{ x: 2, z: 3 }, { x: 15, z: 0 }])!
    expect(r.dist).toBe(15) // 目標B: (15,1) まで 14 歩 + 1
    expect(r.angle).toBeCloseTo(Math.atan2(0 - 1, 15 - 1), 6)
  })

  it('どの目標にも到達できなければ null', () => {
    const tiles = make_tiles()
    for (let x = 1; x <= 5; x++) { tiles[x + level_width] = 1 }
    // 目標 (30,30) の周囲は虚空
    const r = sniff_find(tiles, 1, 1, [{ x: 30, z: 30 }])
    expect(r).toBeNull()
  })

  it('目標が空なら null', () => {
    const tiles = make_tiles()
    tiles[1 + level_width] = 1
    expect(sniff_find(tiles, 1, 1, [])).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/sniff.test.ts`
Expected: FAIL（`./sniff` が存在しない）

- [ ] **Step 3: bfs_distances を公開して sniff.ts を実装する**

`source/level-generator.ts` の `function bfs_distances(...)` を `export function bfs_distances(...)` に変更（コメント含め中身はそのまま）。

`source/sniff.ts` を新規作成:

```ts
import { bfs_distances } from './level-generator'
import { level_height, level_width } from './state'

// 嗅覚の残り香探索。自機タイルから床タイルを BFS し、最も近い目標
// （本物とダミーを区別しない。跡地にも残り香はある、という理屈）への
// 方角と距離を返す。目標タイル自体は壁（生成器が 8 を書く）なので、
// 目標の 4 近傍の床までの距離 + 1 で比較する。到達不能なら null。
// BFS は毎フレーム回すには重いので、呼び出し側（minimap.ts）が
// 1 秒間隔に律速する。

export interface sniff_result_t {
  angle: number // 自機から目標へのユークリッド方角（ラジアン）
  dist: number // BFS タイル距離
}

export function sniff_find(
  tiles: Uint8Array,
  player_x: number,
  player_z: number,
  targets: { x: number, z: number }[],
): sniff_result_t | null {
  const dist = bfs_distances(tiles, { x: player_x, z: player_z })

  let best: sniff_result_t | null = null
  for (const target of targets) {
    let d = -1
    for (const [nx, nz] of [
      [target.x + 1, target.z], [target.x - 1, target.z],
      [target.x, target.z + 1], [target.x, target.z - 1],
    ]) {
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      const n = dist[nx + nz * level_width]
      if (n === -1) { continue }
      if (d === -1 || n < d) { d = n }
    }
    if (d === -1) { continue }
    if (!best || d + 1 < best.dist) {
      best = {
        angle: Math.atan2(target.z - player_z, target.x - player_x),
        dist: d + 1,
      }
    }
  }
  return best
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/sniff.test.ts source/level-generator.test.ts`
Expected: PASS

- [ ] **Step 5: 喫煙所の消費フラグを公開する**

`source/entity-smoking-area.ts` の `private _done = false` を次に置き換え:

```ts
  // minimap.ts が「残り香が残っているか」（嗅覚の目標になるか）を読むため公開
  _done = false
```

- [ ] **Step 6: 距離表示の DOM を足す**

`index.html`: `<canvas id="m" ...>` の行の直後に追加:

```html
	<code id="sn"></code>
```

`<style>` 内の `#m{...}` の行の直後に追加（ミニマップの直下に出す）:

```css
		#sn{position:absolute;top:22.5vw;right:1.25vw;color:#e90;font-weight:bold;font-size:1.3vw;text-shadow:0 0 7px #f70;display:none;}
```

`source/dom.ts` に追加:

```ts
export const sniff_el = document.getElementById('sn') as HTMLElement
```

- [ ] **Step 7: minimap.ts に矢印と距離を実装する**

`source/minimap.ts` を変更。import を追加:

```ts
import { minimap_canvas, sniff_el } from './dom'
import { meta, meta_sniff_active } from './meta'
import { sniff_find } from './sniff'
import type { sniff_result_t } from './sniff'
```

モジュールローカルの状態と再計算を追加:

```ts
// 嗅覚。BFS は毎フレーム回すには重いので 1 秒間隔で再計算する。
// 自機が 1 秒で動けるのは最大 16 タイル相当だが、矢印の解像度（ミニマップの
// 数ピクセル）ではズレとして知覚できない
let sniff_timer = 0
let sniff_result: sniff_result_t | null = null
```

`minimap_reset()` に追加:

```ts
  sniff_timer = 0
  sniff_result = null
```

`minimap_hide()` に追加:

```ts
  sniff_el.style.display = 'none'
```

`minimap_update()` を次に置き換え（stage を一度だけ計算して各所へ渡す）:

```ts
export function minimap_update(): void {
  const stage = nicotine_stage(state.nicotine, state.nicotine_max)
  minimap_sniff(stage)
  minimap_reveal(stage)
  minimap_draw()
}

function minimap_sniff(stage: number): void {
  if (!meta_sniff_active(stage)) {
    sniff_result = null
    sniff_timer = 0
    sniff_el.style.display = 'none'
    return
  }

  sniff_timer -= state.time_elapsed
  if (sniff_timer <= 0) {
    sniff_timer = 1
    const player = state.entity_player!
    const targets: { x: number, z: number }[] = []
    for (const e of state.entities) {
      // 本物もダミーも「残り香」。消費済み（吸い終わり・灰皿撤去判明）は外す
      if (e instanceof entity_smoking_area_t && !e._done) {
        targets.push({ x: e.x >> 3, z: e.z >> 3 })
      }
    }
    sniff_result = sniff_find(level_data, player.x >> 3, player.z >> 3, targets)
  }

  // 3 段: 距離も表示する（1 タイル = 1m と読む）
  if (sniff_result && meta.levels.sniff >= 3) {
    sniff_el.textContent = '残り香 ' + sniff_result.dist + 'm'
    sniff_el.style.display = 'block'
  } else {
    sniff_el.style.display = 'none'
  }
}
```

`minimap_reveal()` のシグネチャを `function minimap_reveal(stage: number): void` に変え、関数内の `const r = minimap_radius(nicotine_stage(...))` を `const r = minimap_radius(stage)` にする。

`minimap_draw()` の自機ピクセル描画の直後（`putImageData` の前）に矢印を追加:

```ts
  // 嗅覚: 自機から残り香の方角へ短い光跡を描く
  if (sniff_result) {
    for (let r = 2; r <= 4; r++) {
      const x = (player.x >> 3) + Math.round(Math.cos(sniff_result.angle) * r)
      const z = (player.z >> 3) + Math.round(Math.sin(sniff_result.angle) * r)
      if (x >= 0 && x < level_width && z >= 0 && z < level_height) {
        minimap_set_pixel(x + z * level_width, 255, 220, 100)
      }
    }
  }
```

- [ ] **Step 8: 型チェックと全テスト、コミット**

```bash
npm run typecheck && npm test
git add source/sniff.ts source/sniff.test.ts source/level-generator.ts source/entity-smoking-area.ts source/minimap.ts source/dom.ts index.html
git commit -m "feat: 嗅覚の残り香矢印と距離表示を追加する"
```

---

### Task 8: 闇サイトメニューとリザルト改修・起動フロー

**Files:**
- Create: `source/menu.ts`
- Modify: `source/terminal.ts`（`terminal_show` を export、`terminal_show_result` の改修、イントロ末尾文言）
- Modify: `source/game.ts:43-48`（`run_end` → メニューへ）
- Modify: `source/main.ts`（`meta_load` とメニュー経由の起動）

**Interfaces:**
- Consumes: Task 1 の `meta` 一式、`terminal_el` / `canvas`（dom.ts）
- Produces:
  - `menu_show(on_start: () => void): void`（`menu.ts`）
  - `terminal_show(): void`（export に変更）
  - `terminal_show_result(depth: number, kills: number, yani: number, best_depth: number, on_continue: () => void): void`（クリックで `on_continue` を呼ぶだけになる。canvas の不透明度は戻さない — メニューが表示を引き継ぐ）

- [ ] **Step 1: terminal.ts を改修する**

`function terminal_show(): void` を `export function terminal_show(): void` に変更。

`terminal_text_story` の末尾 `'クリックで降下開始\n '` を `'クリックで自席の端末へ\n '` に変更（クリック先がメニューになるため）。

`terminal_show_result` を次に置き換え:

```ts
// ラン終了時のリザルト。クリックで自席の端末（闇サイトメニュー）へ移る。
// game_running のリセットとミニマップ・HUD の非表示は game.ts の run_end が持つ。
export function terminal_show_result(
  depth: number,
  kills: number,
  yani: number,
  best_depth: number,
  on_continue: () => void,
): void {
  canvas.style.opacity = '0.3'
  terminal_el.innerHTML = ''
  terminal_text_buffer = []

  terminal_cancel()
  terminal_show()

  // クリックハンドラはテキストの表示チェーン（下の terminal_write_text）が
  // 終わるより先に登録する。表示完了後のコールバックで登録すると、その間に
  // 別の terminal_show_notice() が terminal_cancel() でチェーンを壊した場合、
  // ハンドラが永久に登録されずクリックしても復帰できないままソフトロックする。
  // canvas の不透明度はここでは戻さない（続くメニューが暗いまま引き継ぐ）
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    on_continue()
  }

  terminal_write_text(
    terminal_prepare_text(
      '生体反応 消失\n' +
      '救護ドローンが自席へ回収\n' +
      '_ \n' +
      '到達深度: ' + depth + '（自己ベスト: ' + best_depth + '）\n' +
      '撃破数: ' + kills + '\n' +
      '回収したヤニ: ' + yani + '\n' +
      '_ \n' +
      'クリックで端末へ\n ',
    ),
  )
}
```

- [ ] **Step 2: menu.ts を実装する**

`source/menu.ts` を新規作成:

```ts
import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { canvas, terminal_el } from './dom'
import { meta, meta_buy, meta_max_level, meta_upgrade_cost } from './meta'
import type { meta_upgrade_id_t } from './meta'
import { terminal_hide, terminal_show } from './terminal'

// 自席の端末から繋がる愛煙家の闇サイト。吸い殻（禁制品）を送ると
// 物資（火力・予備の一本）や怪しい訓練プログラム（肺活量・耐性・嗅覚）が
// 届く、という理屈で全項目を説明する（docs/story.md）。
// terminal_el の見た目をそのまま使うが、購入のたびに全文をタイピングし直すと
// 操作感が悪いので、メニューは DOM を直接組むクリック式にする。

interface menu_item_t {
  id: meta_upgrade_id_t
  name: string
  describe: (level: number) => string // 現在レベルの効果
}

const menu_items: menu_item_t[] = [
  { id: 'lung', name: '肺活量', describe: (lv) => '最大ゲージ ' + (100 + 10 * lv) },
  { id: 'tolerance', name: 'ニコチン耐性', describe: (lv) => '減少速度 -' + 6 * lv + '%' },
  {
    id: 'sniff', name: '嗅覚',
    describe: (lv) => [
      'なし',
      'ゲージ30%以下で残り香の方向が分かる',
      'ゲージ60%以下から発動する',
      '距離も分かる',
    ][lv],
  },
  { id: 'power', name: '火力', describe: (lv) => '射撃間隔 -' + 12 * lv + '%' },
  {
    id: 'spare', name: '予備の一本',
    describe: (lv) => 'ラン中 ' + lv + ' 回まで隠れて一服できる [E]',
  },
]

export function menu_show(on_start: () => void): void {
  canvas.style.opacity = '0.3'
  terminal_show()
  menu_render(on_start)
}

function menu_row(html: string, on_click?: () => void, dim = false): HTMLDivElement {
  const row = document.createElement('div')
  row.innerHTML = '&gt; ' + html
  if (on_click) {
    row.style.cursor = 'pointer'
    row.onclick = on_click
  }
  if (dim) { row.style.opacity = '0.4' }
  return row
}

function menu_render(on_start: () => void): void {
  terminal_el.innerHTML = ''
  terminal_el.appendChild(menu_row('闇サイト「Y-EXCHANGE」 接続確立'))
  terminal_el.appendChild(menu_row('ヤニ残高: ' + meta.yani))
  if (!meta.persistent) {
    terminal_el.appendChild(
      menu_row('警告: ストレージ利用不可。強化はこのセッション限りで消える'),
    )
  }
  terminal_el.appendChild(menu_row(' '))

  for (const item of menu_items) {
    const level = meta.levels[item.id]
    const maxed = level >= meta_max_level[item.id]
    const cost = meta_upgrade_cost(level)
    const label = item.name + ' Lv' + level + '/' + meta_max_level[item.id] +
      '（' + item.describe(level) + '） ' +
      (maxed ? 'MAX' : '[ヤニ ' + cost + ' で強化]')
    if (maxed) {
      terminal_el.appendChild(menu_row(label))
    } else {
      terminal_el.appendChild(menu_row(label, () => {
        if (meta_buy(item.id)) {
          audio_play(audio_sfx_pickup)
          menu_render(on_start)
        }
      }, meta.yani < cost))
    }
  }

  terminal_el.appendChild(menu_row(' '))
  terminal_el.appendChild(menu_row('[降下開始]', () => {
    audio_play(audio_sfx_beep)
    terminal_el.innerHTML = ''
    terminal_hide()
    canvas.style.opacity = '1'
    on_start()
  }))
}
```

- [ ] **Step 3: game.ts の run_end をメニューへつなぐ**

import に追加: `import { menu_show } from './menu'`

`run_end()` の最終行を置き換え:

```ts
  terminal_show_result(
    state.depth, state.kills, state.yani_run, meta.best_depth,
    () => menu_show(run_start),
  )
```

- [ ] **Step 4: main.ts の起動フローを変える**

`source/main.ts` を次に置き換え（イントロのクリック → メニュー → 降下開始。rAF ループは初回だけ回す）:

```ts
import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, run_start } from './game'
import { hero_el } from './dom'
import { input_init } from './input'
import { menu_show } from './menu'
import { meta_load } from './meta'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_run_intro, terminal_write_line } from './terminal'

input_init()
meta_load()

terminal_write_line('起動中...')

// rAF ループは起動時に一度だけ回し始める（ラン再開では回し直さない）
let game_started = false

function start_run(): void {
  run_start()
  if (!game_started) {
    game_started = true
    game_tick()
  }
}

audio_init(() => {
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    hero_el.style.opacity = '0'
    setTimeout(() => {
      hero_el.style.display = 'none'
    }, 1000)
    terminal_write_line('起動中...', () => {
      renderer_init()

      const atlas = new Image()
      atlas.src = atlas_url
      atlas.onload = () => {
        renderer_bind_image(atlas)
        // 初回もメニュー（自席の端末）を経由する。前セッションの残高が
        // あれば降下前に使えるし、初回プレイでも操作の予告になる
        menu_show(start_run)
      }
    })
  }

  terminal_run_intro()
})
```

- [ ] **Step 5: 型チェックと全テスト**

Run: `npm run typecheck && npm test`
Expected: エラーなし

- [ ] **Step 6: 手動スモークテスト**

`.claude/launch.json` が無ければ作成:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

preview_start（`{name: "dev"}`）でブラウザを開き、以下を確認:

1. イントロ → クリック → メニューが出る（残高 0、全項目 Lv0）
2. [降下開始] → ラン開始。吸い殻（白点＋オレンジの光）を拾える。敵撃破でも落ちる
3. わざと死ぬ → リザルトに深度・撃破数・回収したヤニ・自己ベストが出る → クリックでメニュー → 残高が増えている → 購入できる（残高が減り Lv が上がる）
4. ブラウザのコンソールで強化を仕込んで再読み込みし、嗅覚と予備の一本を確認:

```js
localStorage.setItem('takagi_meta', JSON.stringify({
  yani: 2000, best_depth: 0,
  levels: { lung: 0, tolerance: 0, sniff: 3, power: 0, spare: 2 },
}))
```

- ゲージ 60% 以下でミニマップに矢印と「残り香 Nm」が出る。61% 以上で消える
- E キーで 50% 回復し「隠れて一服した（残り 1 本）」が出る。押しっぱなしでも 1 回だけ
- リロードしても残高・レベルが残っている

5. read_console_messages でエラーが無いことを確認

- [ ] **Step 7: コミット**

```bash
git add source/menu.ts source/terminal.ts source/game.ts source/main.ts
git commit -m "feat: 闇サイトメニューとリザルトのヤニ表示を追加する"
```

---

### Task 9: docs への蒸留と作業ファイルの削除

**Files:**
- Create: `docs/meta-progression.md`
- Modify: `docs/gameplay.md`（末尾のスコープ節）
- Delete: `docs/superpowers/specs/2026-08-20-plan-b-yani-meta-progression.md`、`docs/superpowers/plans/2026-08-20-yani-meta-progression.md`

- [ ] **Step 1: docs/meta-progression.md を書く**

設計書から「実装後も残る判断」だけを現在形で蒸留する。実装手順・移行の経緯は書かない。含める内容:

```markdown
# メタプログレッション（通貨「ヤニ」と恒久強化）

ラン間で持ち越すのはヤニ残高・強化レベル・ベスト深度のみで、`source/meta.ts` に置く。ラン状態（`state.ts`）と寿命が違うため分離している。`meta.ts` も実行時 import を持たない葉モジュールで、Node（Vitest）でモックなしに評価できる。

## 通貨「ヤニ」

喫煙が非合法化された世界では吸い殻そのものが闇で価値を持つ（docs/story.md）。入手は敵ドロップ（撃破ごとに 50% で 1）・床への散在（フロアあたり 1〜3）・フロア到達ボーナス（深度と同数）の 3 経路。

**死亡時も全額持ち帰り、ロストなし。** ランごとに通貨を失う設計は「損した」感覚を残すだけで、深度を伸ばす動機にはならない。

## 強化テーブル

コストは `20 << level`（20/40/80/160/320）。3 段の項目は先頭 3 つを使い、全解放の合計は 1660。効果値と段階は `meta.ts` が持つ。射撃間隔は 基礎 0.1 秒 × 火力係数（強化） × ニコチン係数 の順に掛ける。耐性の全強化 0.70 と最大ゲージ 1.5 倍の実効 2.143 倍が、√ 減少式と深度 37 で釣り合う（docs/gameplay.md「減少速度が平方根である理由」）。

## 嗅覚が低ゲージ時のみである理由

恒久的な方向ナビは中核の問い（ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化する。そのため嗅覚は追い詰められたときだけ働く救済に限定する（1 段 = 30% 以下、2 段 = 60% 以下に緩和、3 段 = 距離表示）。「切羽詰まるほど鼻が利く」というフレーバーで離脱症状と噛み合う。

矢印は本物とダミーを区別せず、最寄り（自機からの BFS タイル距離）の「残り香」を指す。跡地にも残り香はある、という理屈で、嗅覚を積んでもダミーの緊張は残る。ダミー判別の強化は意図して置かない。BFS は 1 秒間隔で再計算する（毎フレームは過剰）。

## 予備の一本と煙感知器

世界のルールは「一服すると煙感知器が作動し、非常口が開く」。予備の一本は**こっそり浅く吸うので感知器に届かない** — だから回復は 50% 止まりで、非常口も開かない。警報リスク（吸うと敵が寄る）案は緊急回復という主目的を濁すため見送った。

E キーはエッジ検出（非リピート keydown で 1、使用側が 0 に戻す）。押しっぱなしで毎フレーム発動させないため。

## メニュー（闇サイト）とスコア

自席の端末が闇サイトに繋がっている、という一つの理屈で全項目の購入を説明する（物資と怪しい訓練プログラム）。UI は terminal の要素を流用した DOM クリック式。スコアは到達深度のみで、リザルトに深度・撃破数・獲得ヤニを表示し、ベスト深度だけ保存する。

## 保存

localStorage に 1 オブジェクト（キー `takagi_meta`）。使えない環境では try/catch でメモリ内フォールバックし、`meta.persistent = false` を見てメニューが「このセッション限り」と警告する。読み込み時は範囲外の値を最大レベルに丸め、壊れた JSON は捨てて初期値で始める。
```

- [ ] **Step 2: docs/gameplay.md の末尾を更新する**

「スコープに含めていないもの」の節を次に置き換え:

```markdown
## スコープに含めていないもの

装備システム、ボス戦、難易度選択、セーブスロット、実績、予備の一本への警報ペナルティ、嗅覚のダミー判別。通貨「ヤニ」と恒久強化は docs/meta-progression.md を参照。
```

- [ ] **Step 3: 作業ファイルを削除してコミット**

```bash
git rm docs/superpowers/specs/2026-08-20-plan-b-yani-meta-progression.md
git rm docs/superpowers/plans/2026-08-20-yani-meta-progression.md
git add docs/meta-progression.md docs/gameplay.md
git commit -m "docs: 計画Bの結論を docs/meta-progression.md に蒸留する"
```

- [ ] **Step 4: 最終確認**

Run: `npm run typecheck && npm test`
Expected: 全テスト PASS
