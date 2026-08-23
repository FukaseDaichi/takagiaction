# 嗅覚の機能解放化（Max5）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 嗅覚トラックを「10 段のしきい値スケーリング」から「5 段の機能解放」へ組み替え、段ごとに別の能力（経路方向・距離・非常口・ヤニとドローンの点灯）が解放されるようにする。

**Architecture:** 効果値の判定はすべて `meta.ts` の getter（`level` を引数で受ける葉モジュール）に置く。`sniff.ts` はユークリッド角と経路の第一歩の角度を常に両方返す純粋関数のままで、段による選択は消費側の `minimap.ts` が行う。生存系（残り香・非常口）はしきい値ゲート付きの光跡、収入系（ヤニ・清掃ドローン）はしきい値を持たないミニマップ上の点として、2 つの別の感覚に分ける。

**Tech Stack:** TypeScript 5.7 / Vite 6 / Vitest 2。`npm test` と `npm run typecheck`。DOM やレンダラに触るモジュールは Node で評価できないためテストしない（`minimap.ts` / `death-screen.ts`）。

**Spec:** `docs/superpowers/specs/2026-08-23-sniff-unlocks-design.md`

## Global Constraints

- しきい値は `level >= 2 ? 0.6 : 0.3` の 2 値。**上限 0.6 を超えてはならない**（恒久ナビ化は中核の問いを無効化する）
- 嗅覚の段の価格は 15 / 55 / 135 / 255 / 415、合計 **875**
- `meta_max_level.sniff` は **5**
- 全解放の合計コストは **9300**（10 段 4 本 × 2025 ＋ 嗅覚 875 ＋ 予備 325）
- `meta.ts` は実行時 import を 1 つも持たない葉モジュールを維持する（Node でモックなしに評価できること）
- `sniff.ts` はエンティティを知らない純粋関数を維持する。目標リストの組み立ては呼び出し側の責務
- ミニマップの色: ヤニ `(215, 195, 110)`、清掃ドローン `(140, 200, 240)`。**どちらも明滅させない**
- 既存の色と衝突させない: 喫煙所 `(238, 153, 0)`、開示済みダミー `(110, 110, 110)`、非常口 `(0, 220, 120)`、自機 `(255, 255, 255)`、光跡 `(255, 220, 100)`
- ダミー判別は追加しない
- 後方互換・移行処理は置かない（`meta_load` が保存済みの `sniff: 10` を 5 に丸めるのに任せる）
- `state.game_running` のガードは生存系・収入系の両方で維持する（リザルト表示中に前のランの情報を映さない）
- 実装は **main 上で直接コミットする**。**push はしない**（GitHub Actions が Pages にデプロイするため、push は毎回ユーザーの確認が必要）
- テストの基準値: 着手前は `23 test files / 254 tests passed`

**作業ツリーの注意:** `source/entity-yani.ts` / `source/entity-drone.ts` / それぞれの `.test.ts` / `docs/meta-progression.md` に、清掃ドローンのヤニ価値（深度 × 30）に関する**別の未コミット変更が同居している**。本計画のタスクはこれらのファイルの当該変更に触れない。`git add` は各タスクが列挙したファイルのみを対象にし、`git commit -a` は使わないこと。

---

### Task 1: 嗅覚を 5 段にし、価格を 1 段飛ばしでサンプルする

**Files:**
- Modify: `source/meta.ts`
- Modify: `source/death-screen.ts`
- Test: `source/meta.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `meta_upgrade_price(id: meta_upgrade_id_t, level: number): number`。`meta_upgrade_cost` は export をやめてモジュール private にする。`meta_max_level.sniff === 5`

- [ ] **Step 1: 失敗するテストを書く**

`source/meta.test.ts` の import 文で `meta_upgrade_cost` を `meta_upgrade_price` に差し替える。

```ts
import {
  meta, meta_buy, meta_drain_factor, meta_load, meta_max_level,
  meta_nicotine_max, meta_power_factor, meta_save, meta_sniff_active,
  meta_sniff_distance, meta_sniff_threshold, meta_spare_count,
  meta_speed_factor, meta_upgrade_ids, meta_upgrade_price,
} from './meta'
```

`describe('強化テーブル')` の中の `it('コストは 15 + 10lv + 5lv²', ...)` を次の 3 つに置き換える。

```ts
  it('嗅覚以外は共通曲線 15 + 10lv + 5lv² そのもの', () => {
    expect([0, 1, 2, 9].map((level) => meta_upgrade_price('lung', level)))
      .toEqual([15, 30, 55, 510])
  })

  it('嗅覚は共通曲線を 1 段飛ばしでサンプルする', () => {
    expect([0, 1, 2, 3, 4].map((level) => meta_upgrade_price('sniff', level)))
      .toEqual([15, 55, 135, 255, 415])
  })

  it('嗅覚は 5 段', () => {
    expect(meta_max_level.sniff).toBe(5)
  })
```

同じ `describe` の中の `it('全解放の合計コストは 10450', ...)` を次に置き換える。

```ts
  it('全解放の合計コストは 9300', () => {
    let total = 0
    for (const id of meta_upgrade_ids) {
      for (let level = 0; level < meta_max_level[id]; level++) {
        total += meta_upgrade_price(id, level)
      }
    }
    expect(total).toBe(9300)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/meta.test.ts
```

Expected: FAIL。`meta_upgrade_price` が `./meta` から export されていないため、インポートエラーか `meta_upgrade_price is not a function` になる。

- [ ] **Step 3: `meta.ts` の最大レベルを変える**

```ts
export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 10, tolerance: 10, sniff: 5, leg: 10, power: 10, spare: 5,
}
```

- [ ] **Step 4: `meta.ts` の価格を `meta_upgrade_price` に一本化する**

既存のこのブロックを

```ts
// コストは 15 + 10lv + 5lv²（15〜510）。10 段の項目は 2025、予備（5 段）は 325 で
// 全解放の合計は 10450。倍々（20 << lv）は 10 段だと最終段 10240 になり破綻する
export function meta_upgrade_cost(level: number): number {
  return 15 + 10 * level + 5 * level * level
}
```

次に置き換える。

```ts
// 全トラック共通の価格曲線（15/30/55/90/135/190/255/330/415/510）。
// 倍々（20 << lv）は 10 段だと最終段 10240 になり破綻する
function meta_upgrade_cost(level: number): number {
  return 15 + 10 * level + 5 * level * level
}

// 段の価格。嗅覚だけ共通曲線を 1 段飛ばしでサンプルして 15/55/135/255/415
// （合計 875）にする。段ごとに機能が解放される 5 段トラックなので、曲線
// どおりの合計 325 では全トラック中で最安になってしまう。曲線そのものは
// 1 本のままで、サンプリング位置だけを変える。
// 10 段の項目 1 本が 2025、予備（5 段）が 325、全解放の合計は 9300
export function meta_upgrade_price(
  id: meta_upgrade_id_t, level: number,
): number {
  return meta_upgrade_cost(level * (id === 'sniff' ? 2 : 1))
}
```

`meta_buy()` の中の価格取得も差し替える。

```ts
  const cost = meta_upgrade_price(id, level)
```

- [ ] **Step 5: `death-screen.ts` の呼び出しを差し替える**

import 文（8〜11 行目付近）の `meta_upgrade_cost` を `meta_upgrade_price` に変える。

```ts
import {
  meta, meta_buy, meta_drain_factor, meta_max_level, meta_nicotine_max,
  meta_power_factor, meta_sniff_distance, meta_sniff_threshold,
  meta_spare_count, meta_speed_factor, meta_upgrade_price,
} from './meta'
```

強化行を組む `for` ループの中（218 行目付近）を差し替える。

```ts
    const cost = meta_upgrade_price(row.id, level)
```

- [ ] **Step 6: テストと型チェックを通す**

```bash
npm test && npm run typecheck
```

Expected: PASS。テスト数は 254 から **256** に増える（`it('コストは 15 + 10lv + 5lv²')` の 1 件を 3 件に置き換えるので +2。合計コストの 1 件は置き換えなので ±0）。`typecheck` はエラーなしで終了する。

- [ ] **Step 7: コミット**

```bash
git add source/meta.ts source/meta.test.ts source/death-screen.ts
git commit -m "嗅覚を 5 段にし、価格を共通曲線の 1 段飛ばしでサンプルする"
```

---

### Task 2: 段ごとの効果値（しきい値 2 値と解放 getter 4 つ）

**Files:**
- Modify: `source/meta.ts`
- Test: `source/meta.test.ts`

**Interfaces:**
- Consumes: Task 1 の `meta_max_level.sniff === 5`
- Produces:
  - `meta_sniff_threshold(level: number): number` — `level >= 2 ? 0.6 : 0.3`
  - `meta_sniff_path(level?: number): boolean` — `level >= 3`
  - `meta_sniff_distance(level?: number): boolean` — `level >= 3`
  - `meta_sniff_exit(level?: number): boolean` — `level >= 4`
  - `meta_sniff_loot(level?: number): boolean` — `level >= 5`
  - 4 つの boolean getter はすべて省略時に `meta.levels.sniff` を読む

- [ ] **Step 1: 失敗するテストを書く**

`source/meta.test.ts` の import に 3 つ足す。

```ts
import {
  meta, meta_buy, meta_drain_factor, meta_load, meta_max_level,
  meta_nicotine_max, meta_power_factor, meta_save, meta_sniff_active,
  meta_sniff_distance, meta_sniff_exit, meta_sniff_loot, meta_sniff_path,
  meta_sniff_threshold, meta_spare_count, meta_speed_factor,
  meta_upgrade_ids, meta_upgrade_price,
} from './meta'
```

`describe('嗅覚の発動条件')` ブロック**全体**を次に置き換える。

```ts
describe('嗅覚の段ごとの効果', () => {
  beforeEach(meta_reset)

  it('未購入では発動しない', () => {
    expect(meta_sniff_active(0)).toBe(false)
  })

  it('しきい値は 30% と 60% の 2 値（ニコチン段階の境界）', () => {
    expect(meta_sniff_threshold(1)).toBeCloseTo(0.3, 6)
    expect(meta_sniff_threshold(2)).toBeCloseTo(0.6, 6)
    expect(meta_sniff_threshold(5)).toBeCloseTo(0.6, 6)
  })

  it('1 段はゲージ 30% 以下で発動する', () => {
    meta.levels.sniff = 1
    expect(meta_sniff_active(0.31)).toBe(false)
    expect(meta_sniff_active(0.3)).toBe(true)
    expect(meta_sniff_active(0)).toBe(true)
  })

  it('2 段からはゲージ 60% 以下で発動する', () => {
    meta.levels.sniff = 2
    expect(meta_sniff_active(0.61)).toBe(false)
    expect(meta_sniff_active(0.6)).toBe(true)
  })

  it('経路方向と距離は 3 段から', () => {
    expect(meta_sniff_path(2)).toBe(false)
    expect(meta_sniff_path(3)).toBe(true)
    expect(meta_sniff_distance(2)).toBe(false)
    expect(meta_sniff_distance(3)).toBe(true)
  })

  it('非常口は 4 段から', () => {
    expect(meta_sniff_exit(3)).toBe(false)
    expect(meta_sniff_exit(4)).toBe(true)
  })

  it('ヤニと清掃ドローンの点灯は 5 段から', () => {
    expect(meta_sniff_loot(4)).toBe(false)
    expect(meta_sniff_loot(5)).toBe(true)
  })

  it('解放 getter は既定で現在の段を読む', () => {
    expect(meta_sniff_path()).toBe(false)
    meta.levels.sniff = 5
    expect(meta_sniff_path()).toBe(true)
    expect(meta_sniff_distance()).toBe(true)
    expect(meta_sniff_exit()).toBe(true)
    expect(meta_sniff_loot()).toBe(true)
  })
})
```

`describe('強化の効果値')` の中の `it('効果 getter は段数引数で任意の段の値を返す（次段プレビュー用）', ...)` にある嗅覚の 2 行を差し替える。

```ts
    expect(meta_sniff_distance(3)).toBe(true)
    expect(meta_sniff_distance(2)).toBe(false)
```

`describe('保存と読み込み')` の中の `it('範囲外の値は最大レベルに丸める', ...)` を次に置き換える。

```ts
  it('範囲外の値は最大レベルに丸める', () => {
    const store = stub_storage()
    store['takagi_meta'] = JSON.stringify({
      yani: -5, best_depth: 3.7, levels: { lung: 99, sniff: 10, tolerance: 2 },
    })
    meta_load()
    expect(meta.yani).toBe(0)
    expect(meta.best_depth).toBe(3)
    expect(meta.levels.lung).toBe(meta_max_level.lung)
    // 嗅覚が 10 段だった時代の保存データは 5 に丸まる（移行処理は置かない）
    expect(meta.levels.sniff).toBe(5)
    expect(meta.levels.tolerance).toBe(2)
    expect(meta.levels.power).toBe(0)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/meta.test.ts
```

Expected: FAIL。`meta_sniff_path` / `meta_sniff_exit` / `meta_sniff_loot` が存在しないためインポートエラー。

- [ ] **Step 3: `meta.ts` のしきい値と解放 getter を書く**

既存のこのブロックを

```ts
// 発動しきい値（ニコチン比率）。Lv1 = 30% から等間隔で Lv10 = 60% まで上がる。
// 上限を 60% に留めるのは、恒久ナビ化すると中核の問い（ゲージが尽きる前に
// 喫煙所を見つけられるか）を恒久的に無効化するため（従来設計を維持）
export function meta_sniff_threshold(level: number): number {
  return 0.3 + (level - 1) * (0.3 / 9)
}

// 嗅覚は「追い詰められたときだけ働く救済」。ratio は state.nicotine / state.nicotine_max
export function meta_sniff_active(ratio: number): boolean {
  const level = meta.levels.sniff
  return level > 0 && ratio <= meta_sniff_threshold(level)
}

// 最終段は方向に加えて距離も出す。効果値の判定はすべてこのモジュールに置く
export function meta_sniff_distance(level = meta.levels.sniff): boolean {
  return level >= 10
}
```

次に置き換える。

```ts
// 発動しきい値（ニコチン比率）。Lv1 = 30%、Lv2 以降 = 60%。どちらもニコチン
// 段階の境界そのもの（nicotine.ts の nicotine_withdrawal_ratio /
// nicotine_edgy_ratio）で、「離脱症状になったら」「そわそわし始めたら」と
// 1 文で言える。上限を 60% に留めるのは、恒久ナビ化すると中核の問い
// （ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化するため
export function meta_sniff_threshold(level: number): number {
  return level >= 2 ? 0.6 : 0.3
}

// 生存系（残り香・非常口）の方向は「追い詰められたときだけ働く救済」。
// ratio は state.nicotine / state.nicotine_max。
// 収入系（meta_sniff_loot）はこの判定を通さない
export function meta_sniff_active(ratio: number): boolean {
  const level = meta.levels.sniff
  return level > 0 && ratio <= meta_sniff_threshold(level)
}

// Lv3: 光跡が経路方向（BFS の第一歩）になり、距離も出る。どちらも同じ BFS の
// 情報を読めるようになったこと 1 つの解放なので、同じ段に置く
export function meta_sniff_path(level = meta.levels.sniff): boolean {
  return level >= 3
}

export function meta_sniff_distance(level = meta.levels.sniff): boolean {
  return level >= 3
}

// Lv4: 開通済みの非常口も嗅ぐ。一服後に非常口を探して歩き回りゲージが再び
// 落ちた局面では目標リストが空になり、それまで嗅覚が沈黙していた
export function meta_sniff_exit(level = meta.levels.sniff): boolean {
  return level >= 4
}

// Lv5: ヤニと清掃ドローンがミニマップに点灯する。しきい値を持たないのは、
// 追い詰められている最中に拾いに行く余裕がなく狩りの道具にならないため。
// 中核の問いを握っているのは喫煙所への方向だけなので、常時でも触れない
export function meta_sniff_loot(level = meta.levels.sniff): boolean {
  return level >= 5
}
```

- [ ] **Step 4: テストと型チェックを通す**

```bash
npm test && npm run typecheck
```

Expected: PASS。`meta.test.ts` の嗅覚関連は 8 件になる。`typecheck` はエラーなしで終了する。

- [ ] **Step 5: コミット**

```bash
git add source/meta.ts source/meta.test.ts
git commit -m "嗅覚のしきい値を段階境界の 2 値にし、解放 getter を 4 つ足す"
```

---

### Task 3: `sniff.ts` が経路方向も返す

**Files:**
- Modify: `source/sniff.ts`
- Test: `source/sniff.test.ts`

**Interfaces:**
- Consumes: なし（`meta.ts` には依存しない）
- Produces: `sniff_result_t { angle: number, path_angle: number, dist: number }`。`path_angle` は経路の第一歩の方角で、経路に一歩もない場合（自機が目標に隣接）は `angle` と同値

- [ ] **Step 1: 失敗するテストを書く**

`source/sniff.test.ts` の 1 つ目のテスト `it('通路の先の目標への方角と BFS 距離を返す', ...)` の末尾に 1 行足す。

```ts
    expect(r.path_angle).toBeCloseTo(0, 6) // 一直線なので angle と一致する
```

`describe` の末尾（`it('目標が空なら null', ...)` の前）に次の 2 つを足す。

```ts
  // Lv3 の価値そのもの: ユークリッド角は壁を指すが、経路の第一歩は通路を指す
  it('L 字の通路では path_angle が通路の入口を指し、angle と食い違う', () => {
    const tiles = make_tiles()
    // 自機 (1,1) → 東へ (10,1) → 南へ (10,5) → 西へ (2,5) の 3 辺の通路。
    // 目標 (1,5) は直線では真南だが、経路の第一歩は真東になる
    for (let x = 1; x <= 10; x++) { tiles[x + 1 * level_width] = 1 }
    for (let z = 1; z <= 5; z++) { tiles[10 + z * level_width] = 1 }
    for (let x = 2; x <= 10; x++) { tiles[x + 5 * level_width] = 1 }
    tiles[1 + 5 * level_width] = 8 // 目標は生成器と同じく壁

    const r = sniff_find(tiles, 1, 1, [{ x: 1, z: 5 }])!
    expect(r.dist).toBe(22) // 隣接床 (2,5) まで 21 歩 + 1
    expect(r.angle).toBeCloseTo(Math.PI / 2, 6) // 真南（壁の向こう）
    expect(r.path_angle).toBeCloseTo(0, 6) // 真東（通路の入口）
  })

  it('自機が目標に隣接していると path_angle は angle にフォールバックする', () => {
    const tiles = make_tiles()
    tiles[1 + level_width] = 1 // 自機 (1,1)
    tiles[2 + level_width] = 8 // 目標 (2,1)。周囲の床は自機タイルだけ

    const r = sniff_find(tiles, 1, 1, [{ x: 2, z: 1 }])!
    expect(r.dist).toBe(1)
    expect(r.angle).toBeCloseTo(0, 6)
    expect(r.path_angle).toBe(r.angle)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/sniff.test.ts
```

Expected: FAIL。`path_angle` が `sniff_result_t` に存在しないため型エラー、実行時は `undefined` との比較で落ちる。

- [ ] **Step 3: `source/sniff.ts` を丸ごと差し替える**

```ts
import { bfs_distances } from './level-generator'
import { level_height, level_width } from './state'

// 嗅覚の残り香探索。自機タイルから床タイルを BFS し、最も近い目標
// （本物とダミーを区別しない。跡地にも残り香はある、という理屈）への
// 方角と距離を返す。到達不能なら null。
// BFS は毎フレーム回すには重いので、呼び出し側（minimap.ts）が
// 1 秒間隔に律速する。
//
// 目標タイルは床でも壁でもよい。距離は「目標の 4 近傍の床までの最小距離 + 1」で、
// 喫煙所のタイルは壁（生成器が 8 を書く）、非常口は開通の瞬間に entity-exit.ts が
// level_data へ 1 を書いて床になる。床の目標が BFS 距離 D にあるとき、経路上の
// 先行タイルが D − 1 を持つので最小近傍 + 1 は D に一致する。分岐は要らない。

export interface sniff_result_t {
  angle: number // 自機から目標へのユークリッド方角（ラジアン）
  // 経路の第一歩の方角。壁を指さない。嗅覚 Lv3 以上（meta_sniff_path）が使う
  path_angle: number
  dist: number // BFS タイル距離
}

const neighbor_offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// 経路の第一歩のタイル。自機起点の距離場を、目標に隣接する床タイル（entry）から
// 1 ずつ下って辿る。entry が自機タイル自身なら経路に一歩もないので null。
// 距離場では距離 > 0 のタイルが必ず距離 − 1 の近傍を持つので、d を毎周無条件に
// 1 減らす for ループで必ず終わる（無限ループの余地を構造で消している）
function sniff_first_step(
  dist: Int32Array, entry_x: number, entry_z: number,
): { x: number, z: number } | null {
  let x = entry_x
  let z = entry_z
  let d = dist[x + z * level_width]
  if (d === 0) { return null }

  for (; d > 1; d--) {
    for (const [dx, dz] of neighbor_offsets) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      if (dist[nx + nz * level_width] === d - 1) {
        x = nx
        z = nz
        break
      }
    }
  }
  return { x, z }
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
    let entry_x = -1
    let entry_z = -1
    for (const [dx, dz] of neighbor_offsets) {
      const nx = target.x + dx
      const nz = target.z + dz
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      const n = dist[nx + nz * level_width]
      if (n === -1) { continue }
      if (d === -1 || n < d) { d = n; entry_x = nx; entry_z = nz }
    }
    if (d === -1) { continue }
    if (!best || d + 1 < best.dist) {
      const angle = Math.atan2(target.z - player_z, target.x - player_x)
      const step = sniff_first_step(dist, entry_x, entry_z)
      best = {
        angle,
        // 経路に一歩もないときはユークリッド角に落とす
        path_angle: step
          ? Math.atan2(step.z - player_z, step.x - player_x)
          : angle,
        dist: d + 1,
      }
    }
  }
  return best
}
```

- [ ] **Step 4: テストと型チェックを通す**

```bash
npm test && npm run typecheck
```

Expected: PASS。`sniff.test.ts` は 5 件から 7 件になる。既存の「左端の目標では隣接候補が前の行へ回り込まない」も引き続き通る（範囲チェックは `neighbor_offsets` 経由でも同じ位置にある）。

- [ ] **Step 5: コミット**

```bash
git add source/sniff.ts source/sniff.test.ts
git commit -m "嗅覚の探索に経路の第一歩の方角を足す"
```

---

### Task 4: ミニマップの光跡を Lv3 で経路方向に切り替える

**Files:**
- Modify: `source/minimap.ts`

**Interfaces:**
- Consumes: Task 2 の `meta_sniff_path()` / `meta_sniff_distance()`、Task 3 の `sniff_result_t.path_angle`
- Produces: なし

**このタスクにテストは無い。** `minimap.ts` は `dom.ts` を import し、`dom.ts` はモジュール初期化時に `getElementById` を呼ぶため Node（Vitest）で評価できない。検証は型チェックと既存スイートの無回帰、および実プレイ（ユーザーに委ねる）である。

- [ ] **Step 1: import に `meta_sniff_path` を足す**

```ts
import { meta_sniff_active, meta_sniff_distance, meta_sniff_path } from './meta'
```

- [ ] **Step 2: 距離表示のコメントを段に合わせる**

`minimap_sniff()` の末尾のコメントを直す（コードは変えない）。

```ts
  // Lv3 以上: 距離も表示する（1 タイル = 1m と読む）
  if (sniff_result && meta_sniff_distance()) {
```

- [ ] **Step 3: 光跡の角度を段で選ぶ**

`minimap_draw()` の末尾、`putImageData` の直前のブロックを差し替える。

```ts
  // 嗅覚: 自機から残り香の方角へ短い光跡を描く。Lv3 以上は経路の第一歩
  // （path_angle）を指すので壁を指さない。Lv1〜2 はユークリッド角のままで、
  // 「近いのに矢印が壁を指す」ことが粗い鼻であることの表現になる
  if (sniff_result) {
    const angle = meta_sniff_path() ? sniff_result.path_angle : sniff_result.angle
    for (let r = 2; r <= 4; r++) {
      const x = (player.x >> 3) + Math.round(Math.cos(angle) * r)
      const z = (player.z >> 3) + Math.round(Math.sin(angle) * r)
      if (x >= 0 && x < level_width && z >= 0 && z < level_height) {
        minimap_set_pixel(x + z * level_width, 255, 220, 100)
      }
    }
  }
```

- [ ] **Step 4: 型チェックと既存スイートに回帰がないことを確認する**

```bash
npm run typecheck && npm test
```

Expected: どちらも PASS。テスト数は Task 3 終了時点から変わらない。

- [ ] **Step 5: コミット**

```bash
git add source/minimap.ts
git commit -m "嗅覚 Lv3 でミニマップの光跡を経路方向に切り替える"
```

---

### Task 5: 開通済みの非常口も嗅ぐ

**Files:**
- Modify: `source/minimap.ts`

**Interfaces:**
- Consumes: Task 2 の `meta_sniff_exit()`
- Produces: なし

**このタスクにテストは無い**（Task 4 と同じ理由）。目標の**選択**ロジックは `sniff.test.ts` が既にカバーしており、未検証なのは「リストへ何を入れるか」の数行である。切り出すには entity クラスを import する新モジュールが必要で、`sniff.ts` の純粋関数という性質を壊すため、テストしないほうを取る（spec の決定）。

- [ ] **Step 1: import に `meta_sniff_exit` を足す**

```ts
import {
  meta_sniff_active, meta_sniff_distance, meta_sniff_exit, meta_sniff_path,
} from './meta'
```

`entity_exit_t` は既に `minimap.ts` の 2 行目で import 済みなので追加は要らない。

- [ ] **Step 2: 目標リストの組み立てに非常口を足す**

`minimap_sniff()` の中の `for (const e of state.entities)` を差し替える。

```ts
    for (const e of state.entities) {
      // 本物もダミーも「残り香」。消費済み（吸い終わり・灰皿撤去判明）は外す
      if (e instanceof entity_smoking_area_t && !e._done) {
        targets.push({ x: e.x >> 3, z: e.z >> 3 })
      }
      // 嗅覚 Lv4: 開通済みの非常口も嗅ぐ。「残り香 > 非常口」の優先順位は
      // 分岐なしで成り立つ — 目標が空になるのは本物を吸い終えたときだけ
      // （フロアには本物が必ず 1 つある）なので、残り香が残っている間は
      // BFS 距離の比較で残り香が勝つ。埋まるのは「一服後に非常口を探して
      // 歩き回り、ゲージが再び落ちた」局面で、それまで嗅覚は沈黙していた
      else if (
        e instanceof entity_exit_t && state.exit_open && meta_sniff_exit()
      ) {
        targets.push({ x: e.x >> 3, z: e.z >> 3 })
      }
    }
```

- [ ] **Step 3: 型チェックと既存スイートに回帰がないことを確認する**

```bash
npm run typecheck && npm test
```

Expected: どちらも PASS。テスト数は変わらない。

- [ ] **Step 4: コミット**

```bash
git add source/minimap.ts
git commit -m "嗅覚 Lv4 で開通済みの非常口も嗅ぐ"
```

---

### Task 6: ヤニと清掃ドローンをミニマップに点灯する

**Files:**
- Modify: `source/minimap.ts`

**Interfaces:**
- Consumes: Task 2 の `meta_sniff_loot()`
- Produces: なし

**このタスクにテストは無い**（Task 4 と同じ理由）。

**注意:** `source/entity-yani.ts` と `source/entity-drone.ts` には別の未コミット変更が同居している。このタスクはクラスを import するだけで、両ファイルを編集しない。

- [ ] **Step 1: import を足す**

```ts
import { entity_drone_t } from './entity-drone'
import { entity_yani_t } from './entity-yani'
import {
  meta_sniff_active, meta_sniff_distance, meta_sniff_exit, meta_sniff_loot,
  meta_sniff_path,
} from './meta'
```

`minimap.ts` は既に `entity-smoking-area.ts` 経由で `audio.ts` を読み込んでいるので、モジュール初期化の副作用は増えない。

- [ ] **Step 2: エンティティ描画ループの先頭に収入系を足す**

`minimap_draw()` の `const blink = ...` から `for` ループの先頭までを差し替える。

```ts
  const blink = blink_timer < blink_period / 2
  // 嗅覚 Lv5: ヤニと清掃ドローンは未探索タイルでも点灯する。しきい値は
  // 持たない（meta.ts）が、リザルト表示中に前のランの分を映さないため
  // game_running のガードは生存系と同じく通す
  const loot = state.game_running && meta_sniff_loot()
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i]
    const index = (e.x >> 3) + (e.z >> 3) * level_width

    // 収入系は明滅させない。喫煙所のオレンジ（238,153,0）と色相が近いので、
    // 明滅の有無が 1 ピクセルでも読める区別になる
    if (e instanceof entity_yani_t) {
      if (loot) { minimap_set_pixel(index, 215, 195, 110) }
      continue
    }
    if (e instanceof entity_drone_t) {
      if (loot) { minimap_set_pixel(index, 140, 200, 240) }
      continue
    }

    if (!minimap_explored[index]) { continue }

    if (e instanceof entity_smoking_area_t) {
```

以降（喫煙所と非常口の分岐）は変えない。**`if (!minimap_explored[index]) { continue }` を元の位置から移動させたことを確認する** — 収入系の 2 分岐より後ろにあると、未探索タイルの点が出ない。

- [ ] **Step 3: 型チェックと既存スイートに回帰がないことを確認する**

```bash
npm run typecheck && npm test
```

Expected: どちらも PASS。テスト数は変わらない。

- [ ] **Step 4: コミット**

```bash
git add source/minimap.ts
git commit -m "嗅覚 Lv5 でヤニと清掃ドローンをミニマップに点灯する"
```

---

### Task 7: 死亡画面の嗅覚行を解放表示にする

**Files:**
- Modify: `source/death-screen.ts`

**Interfaces:**
- Consumes: Task 2 の段の定義（getter は呼ばず、解放名の文字列だけを持つ）
- Produces: なし

**このタスクにテストは無い。** `death-screen.ts` は `dom.ts` と `audio.ts` を import するため Node で評価できない。ただし死亡画面は DOM なので、Browser ペインで目視確認できる可能性がある（Step 4 参照）。

- [ ] **Step 1: 嗅覚行を差し替える**

`upgrade_rows` の中の `id: 'sniff'` のオブジェクトを次に置き換える。

```ts
  {
    id: 'sniff', name: '嗅覚', icon: icon_nose_url, color: '#3af08a',
    flavor: '利き煙草。段ごとに嗅げるものが増える', stat: '解放',
    // 段ごとに別の能力が解放されるトラックなので、スカラーの「現在値」ではなく
    // その段で解放されるものの名前を出す。効果は累積で前の段の分は消えないが、
    // 行の形（現在値 → 次の段の値）はスカラー向けなので stat を「解放」にして読ませる
    value: (level) => [
      'なし', '方向', 'ゲージ60%以下', '経路＋距離', '非常口', 'ヤニ・ドローン',
    ][level],
  },
```

- [ ] **Step 2: 使わなくなった import を外す**

`meta_sniff_distance` と `meta_sniff_threshold` は嗅覚行が唯一の利用者だったので、import から外す。

```ts
import {
  meta, meta_buy, meta_drain_factor, meta_max_level, meta_nicotine_max,
  meta_power_factor, meta_spare_count, meta_speed_factor, meta_upgrade_price,
} from './meta'
```

外す前に、ファイル内に他の利用箇所がないことを確認する。

```bash
grep -n "meta_sniff_distance\|meta_sniff_threshold" source/death-screen.ts
```

Expected: Step 1 の差し替え後は何も出ない（出た場合はその行を先に処理する）。

- [ ] **Step 3: 型チェックと既存スイートに回帰がないことを確認する**

```bash
npm run typecheck && npm test
```

Expected: どちらも PASS。

- [ ] **Step 4: 死亡画面を目視で確認する（できる範囲で）**

`.claude/launch.json` に dev サーバの設定があれば `preview_start` で開き、画面をクリックして起動シーケンスを進める。初回起動時も `death_screen_show(null, run_start)` を通る（`main.ts:36`）ので、闇サイトの 6 行が DOM として出る。`read_page` で嗅覚行に `解放 なし → 方向` と `Lv. 0 / 5`、ピップが 5 個出ていることを確認する。

**Browser ペインでは `requestAnimationFrame` が動かないため、3D ビューは真っ黒になる。これは不具合ではない。** ミニマップの光跡や点灯（Task 4〜6）はこの経路では確認できない。到達できない場合は型チェックとスイートの結果をもって次へ進み、見た目の確認はユーザーの実プレイに委ねる。

- [ ] **Step 5: コミット**

```bash
git add source/death-screen.ts
git commit -m "死亡画面の嗅覚行を段ごとの解放表示にする"
```

---

### Task 8: docs をコードの現状に合わせる

**Files:**
- Modify: `docs/meta-progression.md`
- Modify: `docs/gameplay.md`
- Modify: `docs/architecture.md`
- Modify: `docs/story.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1〜7 の実装
- Produces: なし

**注意:** `docs/meta-progression.md` には清掃ドローンのヤニ価値（深度 × 30）に関する別の未コミット変更が同居している。**行番号ではなく見出しと本文の内容で該当箇所を探すこと。** ドローンのヤニ価値に関する記述（「通貨『ヤニ』」節と「移動速度は…」の段落）には触れない。

- [ ] **Step 1: `docs/meta-progression.md` の「強化テーブル」節の第 1 段落を差し替える**

「最大レベルは肺活量・…全解放の合計は 10450。効果値と段階は `meta.ts` が持つ。」で始まる段落を次に置き換える。

```markdown
最大レベルは肺活量・ニコチン耐性・脚力・火力が 10 段、嗅覚と予備の一本が 5 段。コストは `15 + 10lv + 5lv²`（15/30/55/90/135/190/255/330/415/510）で、10 段の項目 1 本が 2025、予備が 325。**嗅覚だけはこの曲線を 1 段飛ばしでサンプルして 15/55/135/255/415（合計 875）にする** — 段ごとに機能が解放される 5 段トラックなので、曲線どおりの合計 325 では全トラック中で最安になってしまう。曲線そのものは 1 本のままで、サンプリング位置だけを変える（`meta_upgrade_price`）。全解放の合計は 9300。効果値と段階は `meta.ts` が持つ。
```

- [ ] **Step 2: 前提が消えた段落を削除する**

「ただしこれは曲線が全トラック共通であることの効果で、…」で始まる段落を**丸ごと削除する**。嗅覚が「+3.33pt/段動くだけの贅沢枠」という前提そのものが無くなるため。

- [ ] **Step 3: 「嗅覚が低ゲージ時のみである理由」節を全面差し替える**

見出しとそれに続く 4 段落（「恒久的な方向ナビは…」から「矢印の向き自体は…行わない。」まで）を次に置き換える。

```markdown
## 嗅覚は段ごとに機能が解放される

嗅覚は 5 段で、段ごとに別の能力が解放される。効果は累積で、前の段の分は消えない。

| 段 | 解放 | 効果 |
| --- | --- | --- |
| 1 | 方向 | ゲージ 30% 以下で、最寄りの残り香へ向かう光跡。角度はユークリッドで、壁を指すことがある |
| 2 | 早さ | しきい値が 60% 以下へ |
| 3 | 筋 | 光跡が経路方向（BFS の第一歩）になり、`残り香 Nm` の距離表示が出る |
| 4 | 抜け道 | 残り香が尽きたあと、開通済みの非常口も嗅ぐ |
| 5 | 金 | ヤニと清掃ドローンが、未探索タイルでもミニマップに点灯する。しきい値と無関係に常時 |

**しきい値は 30% / 60% の 2 値である。** どちらもニコチン段階の境界そのもの（`nicotine.ts` の `nicotine_withdrawal_ratio` / `nicotine_edgy_ratio`）で、Lv1 は「離脱症状になったら鼻が利く」、Lv2 は「そわそわし始めたら鼻が利く」と 1 文で言える。段あたり 3.33pt の連続値は、どの段階とも対応しない中間値を 8 つ並べるだけだった。

**上限を 60% に留めるのは、恒久的な方向ナビが中核の問い（ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化するため。** 嗅覚の設計で最も動かせない一点である。

しきい値を段ではなく**比率**で受けるのは、判定に使う値（`state.nicotine / state.nicotine_max`）を呼び出し側が既に持っており、`meta.ts` がニコチンの段階判定を知る必要がないため。この形にしてあるおかげで `meta.ts` は実行時 import を 1 つも持たない。

### 生存系と収入系は別の感覚である

| 系 | 対象 | 表現 | 発動条件 |
| --- | --- | --- | --- |
| 生存系 | 喫煙所の残り香、開通済みの非常口 | ミニマップの光跡（方向） | しきい値以下 |
| 収入系 | ヤニ、清掃ドローン | ミニマップの点（位置） | 常時 |

**収入系はしきい値で縛らない。** 追い詰められている最中にヤニの位置を教えられても拾いに行く余裕はなく、狩りの道具として使う場面が消える。中核の問いを握っているのは喫煙所への方向だけなので、収入系を常時にしても問いには触れない。

**収入系は矢印ではなく点である。** 矢印 1 本の取り合いが原理的に起きない。「生存系＝方向、収入系＝位置」という表現の違い自体が、なぜ扱いが違うのかの説明になる。ヤニは淡い黄（215,195,110）、清掃ドローンは淡い青（140,200,240）で、**どちらも明滅させない** — 喫煙所のオレンジ（238,153,0）と色相が近いため、明滅の有無が 1 ピクセルでも読める区別になる（「明滅は行き先を意味する」の規約をそのまま使う）。

清掃ドローンを対象に含めるのは脚力とのシナジーのため。脚力 Lv4（速度 156.8）でドローンの逃走終端速度 150 を追い越して狩りが解禁されるが、獲物を見つける手段は素の探索しかなかった。

### 矢印が指すもの

矢印は本物とダミーを区別せず、最寄り（自機からの BFS タイル距離）の「残り香」を指す。跡地にも残り香はある、という理屈で、嗅覚を積んでもダミーの緊張は残る。**ダミー判別の強化は意図して置かない。** BFS は 1 秒間隔で再計算する（毎フレームは過剰）。

Lv1〜2 の矢印はユークリッド角なので、通路が入り組んだフロアでは「短い距離が表示されているのに矢印は壁を指す」が起こる。**これは粗い鼻の仕様であり、Lv3 の経路方向がその解放にあたる。** `sniff.ts` は `angle`（ユークリッド）と `path_angle`（経路の第一歩）を常に両方返し、どちらを使うかは `minimap.ts` が段で選ぶ。`path_angle` の計算は O(距離) で BFS 本体（O(4096)）に対して無視できるので、段による分岐を `sniff.ts` に持ち込まない。

Lv4 は分岐を書かずに「本物の残り香 > 非常口」になる。`entity-smoking-area.ts` の `_complete()` が `_done` と `state.exit_open` を同じ呼び出しで立てるため、**まだ吸っていない本物と開通済みの非常口が同時に候補になることはない。** 一方、開示していないダミーは本物を吸い終えたあとも候補に残るので、**ダミーと非常口は BFS 距離で素直に競い、近いほうが勝つ。** これはそのまま採る — 一服後に意味があるのは非常口だけなので非常口が勝つのは望ましく、ダミーが勝ったときの損も歩いた時間（ダミーの回復は 5%）に収まり、ダミー判別を置かない方針と矛盾しない。Lv4 が埋めるのは「一服後に非常口を探して歩き回り、ゲージが再び 60% を割った」局面で、それまでは目標リストが空になって嗅覚が沈黙していた。

目標タイルは床でも壁でもよい。距離は「目標の 4 近傍の床までの最小距離 + 1」で、喫煙所は壁（生成器が 8 を書く）、非常口は開通の瞬間に `entity-exit.ts` が `level_data` へ 1 を書いて床になる。床の目標が BFS 距離 D にあるとき経路上の先行タイルが D − 1 を持つので、最小近傍 + 1 は D に一致する。
```

- [ ] **Step 4: 死亡画面の節に嗅覚行の例外を書き足す**

「強化行は種別の一言（フレーバー）と、効果の『現在値 → 次の段の値』を出す…」の段落の直後に、次の段落を挿入する。

```markdown
**嗅覚行だけは値がスカラーではない。** 段ごとに別の能力が解放されるトラックなので、その段で解放されるものの名前（`方向` / `ゲージ60%以下` / `経路＋距離` / `非常口` / `ヤニ・ドローン`）を出し、ラベルも `発動` ではなく `解放` にする。効果は累積で前の段の分は消えないが、行の形（現在値 → 次の段の値）はスカラー向けなので、`解放` というラベルで読ませている。累積の全リストを出す案は行に収まらない長さになる。
```

- [ ] **Step 5: `docs/gameplay.md` の 2 か所を直す**

「HUD は安全なときに黙る」節の表の残り香の行を差し替える。

```markdown
| 残り香の距離 | 嗅覚 Lv3 以上が発動している間 | 発動条件から外れたら |
```

「スコープに含めていないもの」節の本文を差し替える（嗅覚のダミー判別は残し、常時発動を足す）。

```markdown
装備システム、ボス戦、難易度選択、セーブスロット、実績、予備の一本への警報ペナルティ、嗅覚のダミー判別と常時発動。通貨「ヤニ」と恒久強化は docs/meta-progression.md を参照。
```

- [ ] **Step 6: `docs/architecture.md` の `sniff.ts` の行を差し替える**

```markdown
- `sniff.ts` — 嗅覚の残り香探索。`level-generator.ts` の `bfs_distances` を自機タイル起点で呼ぶ純粋関数。ユークリッド角（`angle`）と経路の第一歩の方角（`path_angle`）を常に両方返し、段による選択は `minimap.ts` が行う。エンティティを知らないため、目標リストの組み立ては呼び出し側の責務
```

- [ ] **Step 7: `docs/story.md` の嗅覚の行を差し替える**

```markdown
| 嗅覚 | 闇サイトの怪しい訓練プログラム（利き煙草）。切羽詰まるほど煙の残り香が分かり、鍛えれば吸い殻の在り処まで嗅ぎ分ける |
```

- [ ] **Step 8: `README.md` の HUD 表を 2 行直す**

```markdown
| マップ（右上） | 常時。右下の `B12` は現在の深度（地下 12 階）。嗅覚 Lv5 では吸い殻と清掃ドローンの点も出ます |
```

```markdown
| 残り香の距離 | 嗅覚 Lv3 以上が発動している間 |
```

- [ ] **Step 9: `source/minimap.ts` の同じ過大主張を狭める**

`minimap_sniff()` の Lv4 のコメントは docs と同じ不変条件を主張しているので、同じ内容に狭める。「残り香が残っている間は BFS 距離の比較で残り香が勝つ」は**本物についてだけ**正しく、開示していないダミーは本物を吸い終えたあとも候補に残るため、ダミーと非常口は距離で競う。次に差し替える。

```ts
      // 嗅覚 Lv4: 開通済みの非常口も嗅ぐ。分岐を書かずに「本物 > 非常口」に
      // なる — _complete() が _done と exit_open を同じ呼び出しで立てるので、
      // まだ吸っていない本物と開通済みの非常口は同時に候補にならない。
      // 開示していないダミーは吸い終えたあとも残るため、ダミーと非常口は
      // BFS 距離で素直に競う（一服後に意味があるのは非常口だけなので、
      // 非常口が勝つのは望ましい。docs/meta-progression.md）。埋まるのは
      // 「一服後に非常口を探して歩き回り、ゲージが再び落ちた」局面で、
      // それまで嗅覚は沈黙していた
```

このステップがあるため、Task 8 のコミットには `source/minimap.ts` も含める。

- [ ] **Step 10: `source/death-screen.ts` の `upgrade_row_t` のコメントに例外を書く**

`value` フィールドのコメントが「式は meta.ts の getter（段数引数）から引き、画面側に書き写さない」と全 6 行について主張しているが、Task 7 以降これは 5 行にしか当てはまらない。嗅覚行は解放名の文字列を `death-screen.ts` 内に持つ（`meta.ts` は真偽値と数値の機構だけを公開する葉モジュールで、人間向けラベルの getter を持たない）。次に差し替える。

```ts
  // 任意の段での効果値。現在値と次段プレビューの両方をこれで出す。
  // 式は meta.ts の getter（段数引数）から引き、画面側に書き写さない。
  // 例外は嗅覚行で、段ごとの解放名という人間向けラベルはここが持つ
  // （meta.ts は真偽値と数値の機構だけを公開する葉モジュールなので、
  // 呼び出し元 1 か所のためにラベルの getter を足さない）
  value: (level: number) => string
```

このステップがあるため、Task 8 のコミットには `source/death-screen.ts` も含める。

- [ ] **Step 11: 数値の整合を確認する**

```bash
grep -rn "10450\|Lv10\|0.3 / 9" docs/ README.md
```

Expected: 1 件も出ない。`3.33pt` と `10 段` は grep しない — Step 3 の新しい文面が「段あたり 3.33pt の連続値は…だった」と旧設計を説明するために意図して前者を含み、「10 段の項目 1 本が 2025」として後者も正しく残るため。あわせて、嗅覚を「10 段」の列挙に含めた記述が残っていないことを目で確認する。

- [ ] **Step 12: コミット**

```bash
git add docs/meta-progression.md docs/gameplay.md docs/architecture.md docs/story.md README.md source/minimap.ts source/death-screen.ts
git commit -m "嗅覚の機能解放化に合わせて docs を更新する"
```

---

### Task 9: 作業用ドキュメントを片付ける

**Files:**
- Delete: `docs/superpowers/specs/2026-08-23-sniff-unlocks-design.md`
- Delete: `docs/superpowers/plans/2026-08-23-sniff-unlocks.md`

**Interfaces:**
- Consumes: Task 1〜8 の完了
- Produces: なし

AGENTS.md の規約: 作業が完了したら設計の結論を `docs/` 直下に蒸留して反映し、元ファイルは削除する。実装手順・チェックボックス・移行前の状況説明は `docs/` に持ち込まない。

- [ ] **Step 1: 蒸留漏れがないことを確認する**

spec の各節（段の定義 / しきい値 / 生存系と収入系 / 価格 / モジュール契約 / 表示 / 採らない案）が `docs/meta-progression.md` と `docs/architecture.md` のどこに反映されたかを 1 つずつ指差し確認する。反映されていない結論があれば Task 8 に戻る。

- [ ] **Step 2: 全体を最終確認する**

```bash
npm run typecheck && npm test
```

Expected: どちらも PASS。テストは 23 files で、着手前の 254 件から Task 1 で +2、Task 2 で +4、Task 3 で +2 増えて **262 件**になる。

- [ ] **Step 3: 削除してコミット**

```bash
git rm docs/superpowers/specs/2026-08-23-sniff-unlocks-design.md docs/superpowers/plans/2026-08-23-sniff-unlocks.md
git commit -m "完了した嗅覚の機能解放化の作業用ドキュメントを削除する"
```

- [ ] **Step 4: push はしない**

`main` への push は GitHub Actions が GitHub Pages にデプロイするため、**ユーザーの確認を取ってから**行う。Browser ペインでは `requestAnimationFrame` が止まるためミニマップと 3D ビューの見た目を自動で確認できない。ユーザーに次の 3 点を実プレイで確かめてもらうよう伝える。

1. 嗅覚 Lv3 で光跡が壁ではなく通路の方向を指すこと
2. 嗅覚 Lv4 で、一服後にゲージが 60% を割ったとき光跡が非常口を指すこと
3. 嗅覚 Lv5 で、ヤニと清掃ドローンの点が未探索の暗い領域にも出て、喫煙所のオレンジと見分けられること（明滅の有無）
