# ニコチン・ローグライト化 コア実装計画（計画A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TAKAGI ACTION を、手続き生成されたフロアを無限に潜りながらニコチンゲージの枯渇と戦うローグライトのランに作り替える。

**Architecture:** レベルは PNG ではなく `level-generator.ts` の純粋関数が生成し、`game.ts` がその結果を頂点バッファとエンティティに変換する。ニコチンの数値ロジックは副作用のない `nicotine.ts` に切り出し、ラン状態は葉モジュールである `state.ts` に集約する。CPU 端末の再起動という概念は、喫煙所での一服と非常口の開通に丸ごと置き換わる。

**Tech Stack:** TypeScript 5.7 / Vite 6 / Vitest 2 / WebGL（既存の `renderer.ts` に手を入れない）

## 対象の仕様

- 設計書: [2026-08-18-nicotine-roguelite-design.md](../specs/2026-08-18-nicotine-roguelite-design.md)
- レビュー: [2026-08-19-nicotine-roguelite-design-review.md](../specs/2026-08-19-nicotine-roguelite-design-review.md)

この計画は設計書のうち **フロア生成・ニコチンゲージ・一服・無限深度・既存コードの削除** を対象とする。
**ヤニ（通貨）・恒久強化・ターミナル強化メニュー・ベスト深度の localStorage 保存は計画B（別ファイル）** で扱う。計画A 単体で「ゲージが尽きるまで潜り続ける」ランとして遊べる状態になる。

## 着手前に確定した設計判断

レビューが挙げた 9 項目とバランス所見への回答。**実装中にこれらを再検討しないこと。**

| # | レビュー項目 | 確定した判断 |
| --- | --- | --- |
| 1 | A-1 / A-2 壁生成 | 床タイルに 8 近傍で隣接する非床タイルだけを壁にする。加えて生成器が頂点コストを自己検査し、超過したシードは棄却する |
| 2 | A-3 敵密度 | 床タイルごとの確率抽選をやめ、深度から**総数**を決めて床タイルから抽選配置する。`enemy_budget(depth) = min(30 + depth*4, 100)`、うち `sentry_count(depth) = min(1 + floor(depth/2), 10)` |
| 3 | A-4 非常口 | `entity_exit_t` を新規作成し、閉じている間だけ毎フレーム `push_block()` する。開通時に自分のタイルだけ `level_data` を床に戻す |
| 4 | A-5 一服の中断 | 進捗はリセットされるが**喫煙所は消費されない**（吸い直せる）。ゲージは吸っている間ずっと連続回復するので「吸えた時間に比例」は満たされる。自機の 2 秒無敵は既存のまま触らない |
| 5 | B-1 シード | ラン開始時に `Math.random()` で `state.run_seed` を引き、フロアのシードは `run_seed + depth * 7919`。テストは `generate_level(depth, seed)` に直接シードを渡す |
| 6 | B-3 ラン状態 | すべて `state.ts` に置く。`game.ts` にはモジュールローカルなタイマーだけ残す |
| 7 | B-6 / B-7 実装先 | 撃破数は `entity-spider.ts` / `entity-sentry.ts` の `_kill()` で数える。セントリーは生成器が配置する。ヤニの拾得エンティティは計画B |
| 8 | B-9 距離 | 部屋の選定はすべて**開始部屋中心からの BFS タイル距離**に統一する |
| 9 | C-3 嗅覚 | 全 3 段を「ゲージ 30% 以下のときだけ有効」に限定する（計画B で実装） |
| 10 | C-2 深度スケール | 減少速度を線形から √ 曲線に変更する。`1 + 0.19 * sqrt(depth - 1)` |
| 11 | B-4 視界 | ライトの RGB ではなく **falloff（第 7 引数）** を上げて半径を縮める。`renderer.ts` には手を入れない |
| 12 | B-5 ミニマップ半径 | 段階で可変にする。既に開いた領域が閉じないことは仕様として受け入れる |
| 13 | C-4 深度の起点 | 最初のフロアが深度 1。減少速度は `depth - 1`、部屋の選定は `floor(depth/3)` / `floor(depth/4)`。**起点が違うのは意図的**（減少速度は深度 1 で係数 1.0、部屋の選定は深度 1 で最低ラインから始める） |

### `1 + 0.19 * sqrt(depth - 1)` の根拠

設計書 §1 が挙げる 2 つのアンカーを満たす係数を選んだ。

| 深度 | 係数 | 実時間（ゲージ 100） | 設計書の目安 |
| --- | --- | --- | --- |
| 1 | 1.000 | 100.0 秒 | 約 100 秒 ✓ |
| 11 | 1.601 | 62.5 秒 | 約 62 秒 ✓ |
| 21 | 1.850 | 54.1 秒 | （線形なら 45 秒） |
| 51 | 2.343 | 42.7 秒 | — |
| 101 | 2.900 | 34.5 秒 | — |

計画B の全強化（最大 150 / 耐性 −30%）の実効倍率 2.143 と釣り合うのは深度 37。線形の深度 20 から大きく後ろに動くため、レビュー C-2 が指摘した「全員の壁が深度 25〜35 に集中する」問題が緩和される。

### 生成器の実測値（1000 シード）

本計画のパラメータで生成器を試作して測った値。実装後にテストが落ちたら、まずここと突き合わせる。

| 指標 | 実測 | 判定 |
| --- | --- | --- |
| 部屋数 | 8〜12 がほぼ一様（各 20%） | 最低 3 部屋の保証は一度も発動しない |
| 床タイル | 最大 1567 | — |
| 壁タイル | 最大 894（床の約 0.6 倍） | 既存 PNG レベルと同じ比率 |
| 頂点コスト | 12,438 〜 30,858（中央値 20,964） | 予算 60,000 に対して十分な余裕 |
| 湧き先候補タイル | 最小 585 | 必要数（敵 100 + アイテム 4）を大きく上回る |
| 非常口 = 開始地点 | 0 件 | — |
| 床に露出した空タイル | 0 件 | レビュー A-1 が解消されている |
| 喫煙所までの BFS 距離 | 深度 1: 中央値 30 / 深度 30: 中央値 70 | 深度で遠くなっている |

**RNG のウォームアップが必要。** `random.ts` の LCG は `random_seed()` 直後の数回の出力がシードと強く相関する。ウォームアップ無しだと 1 ラン内の連続する深度（`run_seed + depth * 7919`）で最初の部屋の幅と x 座標がほぼ同じ値に張り付き、部屋数も 1 種類に固定される（実測で 1000 シードすべて 9 部屋）。`build_layout` の先頭で 8 回捨てると上表の分布になる。`random.ts` 自体は変えない（`random.test.ts` が旧実装との出力一致を固定しており、レベル生成の再現性がそこに乗っている）。

## ファイル構成

### 新規

| ファイル | 責務 |
| --- | --- |
| `source/nicotine.ts` | ニコチンの数値ロジック。**副作用も実行時 import も持たない純粋関数だけ**。Node 環境でモックなしに評価できることが条件 |
| `source/nicotine.test.ts` | 上のテスト |
| `source/level-generator.ts` | フロアの間取り生成。`random.ts` と `state.ts`（定数のみ）以外を import しない |
| `source/level-generator.test.ts` | 上のテスト。1000 シードの連結性検証を含む |
| `source/hud.ts` | ニコチンゲージの DOM 更新。`dom.ts` と `nicotine.ts` 以外を import しない |
| `source/entity-smoking-area.ts` | 喫煙所（本物・ダミー共通）。一服の状態機械を持つ |
| `source/entity-smoking-area.test.ts` | 一服の状態機械のテスト（中断・再開・ダミー・ロック） |
| `source/entity-exit.ts` | 非常口 |
| `source/entity-exit.test.ts` | 非常口のテスト（動的ブロックの出し分け・当たり判定の復帰・遷移の一回性） |
| `source/entity-player.test.ts` | 自機のニコチン反映のテスト |

### 改修

| ファイル | 内容 |
| --- | --- |
| `source/state.ts` | `current_level` / `cpus_total` / `cpus_rebooted` を削除し、ラン状態を追加 |
| `source/game.ts` | PNG 読み込みを削除し生成器に載せ替え。`run_start` / `run_end` / `next_level`。ゲージ減少と HUD 更新 |
| `source/entity-player.ts` | 速度・射撃間隔・拡散・ライト falloff をニコチン段階から算出。一服中の凍結。死＝ラン終了 |
| `source/entity-spider.ts` / `source/entity-sentry.ts` | `_kill()` で `state.kills++` |
| `source/minimap.ts` | CPU の分岐を削除し喫煙所・非常口を描く。半径を段階で可変に |
| `source/terminal.ts` | ストーリー文面の差し替え。`terminal_run_outro` を `terminal_show_result` に置換 |
| `source/main.ts` | `next_level(game_tick)` のコールバック plumbing を廃止 |
| `source/dom.ts` | ゲージ要素の取得を追加 |
| `source/entity-init.test.ts` | CPU のテストを削除し、新エンティティのテストを追加 |
| `index.html` | ゲージ用の DOM 要素と CSS |

### 削除

`source/entity-cpu.ts` / `m/l1.png` / `m/l2.png` / `m/l3.png`

## Global Constraints

これらは全タスクの要件に暗黙に含まれる。

- 各タスクの最後に `npm run typecheck` と `npm test` の両方が通ること。片方だけでは不十分
- **後方互換レイヤーを作らない**（AGENTS.md）。置き換えたコードパスはそのタスク内で削除する。「一応残す」は禁止
- **最もシンプルな実装を選ぶ**（AGENTS.md）。使う予定のないオプション・フラグ・抽象化レイヤーを足さない。ただし要件は完全に満たす
- ESM モジュールとして書き、`index.html` に `<script>` タグを足さない。エントリは `source/main.ts` の 1 本
- **`entity.ts` は `entity_t` のサブクラスを宣言するモジュールに（推移的にも）到達してはならない**（`docs/architecture.md`）。`entity.ts` の import を増やさない
- **`entity_t` のサブクラスで、サブクラス固有のフィールドを `_init()` 内で代入してはならない。** `useDefineForClassFields` によりフィールド初期化子が基底 constructor の後に走り、代入がサイレントに `undefined` で上書きされる。`_init()` に書けるのは基底クラス（`entity_t`）のフィールド（`h` など）だけ
- `renderer.ts` には手を入れない。`max_verts = 1024 * 64 = 65536`、`push_floor()` = 6 verts、`push_block()` = 24 verts。この予算を超えると `buffer_data.set()` が RangeError で落ちる
- タイル値の意味は現行のまま: `0` = 空（**通行可能**）/ `1〜7` = 床 / `8 以上` = 壁。`entity.ts` の `_collides()` は `> 7` だけを壁とみなす
- 数値リテラルは本計画に書かれた値をそのまま使う。体感調整は Task 10 の手動確認で行う
- ドキュメントは日本語。コード内コメントも既存に合わせて日本語
- Python を使う場合は必ず `uv run` 経由（AGENTS.md）

---

## Task 1: ニコチンの数値ロジック（純粋関数）

**Files:**
- Create: `source/nicotine.ts`
- Test: `source/nicotine.test.ts`

**Interfaces:**
- Consumes: なし（このモジュールは何も import しない）
- Produces:
  - `nicotine_stage_normal: 0` / `nicotine_stage_edgy: 1` / `nicotine_stage_withdrawal: 2` / `nicotine_stage_limit: 3`
  - `nicotine_stage(nicotine: number, nicotine_max: number): number`
  - `nicotine_drain_rate(depth: number): number`
  - `player_speed(stage: number): number`
  - `shot_interval(stage: number): number`
  - `shot_spread(stage: number): number`
  - `player_light_falloff(stage: number): number`
  - `minimap_radius(stage: number): number`
  - `camera_shake_amount(stage: number): number`
  - `stage_color(stage: number): string`

恒久強化（ニコチン耐性・火力）の段数を受け取る引数は**足さない**。計画A には強化が存在せず、常に `0` を渡すだけの引数は死んだ設定になる（AGENTS.md「使う予定のないオプションやフラグを増やさない」）。計画B が `meta.ts` を作る時点で `nicotine_drain_rate` と `shot_interval` にそれぞれ第 2 引数を足す。

- [ ] **Step 1: 失敗するテストを書く**

`source/nicotine.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import {
  camera_shake_amount, minimap_radius, nicotine_drain_rate, nicotine_stage,
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_normal,
  nicotine_stage_withdrawal, player_light_falloff, player_speed,
  shot_interval, shot_spread, stage_color,
} from './nicotine'

describe('nicotine_stage', () => {
  // 設計書 §1 の段階効果: 100〜61% 通常 / 60〜31% そわそわ / 30〜1% 離脱 / 0% 限界
  it('61% は通常、60% はそわそわ', () => {
    expect(nicotine_stage(61, 100)).toBe(nicotine_stage_normal)
    expect(nicotine_stage(60, 100)).toBe(nicotine_stage_edgy)
  })

  it('31% はそわそわ、30% は離脱症状', () => {
    expect(nicotine_stage(31, 100)).toBe(nicotine_stage_edgy)
    expect(nicotine_stage(30, 100)).toBe(nicotine_stage_withdrawal)
  })

  it('1% は離脱症状、0% は限界', () => {
    expect(nicotine_stage(1, 100)).toBe(nicotine_stage_withdrawal)
    expect(nicotine_stage(0, 100)).toBe(nicotine_stage_limit)
  })

  // 境界は「その比率より上」で切る。90/150 と 45/150 は IEEE の除算が
  // 正しく丸めるので、リテラルの 0.6 / 0.3 と厳密に同じ double になる。
  it('最大値が 100 以外でも比率で判定する', () => {
    expect(nicotine_stage(91, 150)).toBe(nicotine_stage_normal) // 60.7%
    expect(nicotine_stage(90, 150)).toBe(nicotine_stage_edgy) // ちょうど 60%
    expect(nicotine_stage(46, 150)).toBe(nicotine_stage_edgy) // 30.7%
    expect(nicotine_stage(45, 150)).toBe(nicotine_stage_withdrawal) // ちょうど 30%
  })
})

describe('nicotine_drain_rate', () => {
  it('深度 1 は係数 1.0（ゲージ 100 で 100 秒）', () => {
    expect(nicotine_drain_rate(1)).toBeCloseTo(1.0, 6)
  })

  // 設計書 §1 の「深度11で約62秒」に対応する。√ 曲線の係数 0.19 はこの点を通るよう選んだ
  it('深度 11 は約 1.60（62.5 秒）', () => {
    expect(nicotine_drain_rate(11)).toBeCloseTo(1.6008, 3)
    expect(100 / nicotine_drain_rate(11)).toBeCloseTo(62.5, 1)
  })

  it('深度が上がると単調に増える', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(nicotine_drain_rate(depth + 1)).toBeGreaterThan(nicotine_drain_rate(depth))
    }
  })

  // レビュー C-2: 線形だと、計画B の全強化（最大 150 / 耐性 −30% = 2.143 倍）と
  // 深度 20 でちょうど相殺して伸びしろが消える。√ 曲線ならその点が深度 37 まで動く。
  // ここで見ているのは曲線の形そのもので、強化の実装には依存しない。
  it('係数が 2.143 に達するのは深度 37 付近', () => {
    expect(nicotine_drain_rate(36)).toBeLessThan(150 / 100 / 0.7)
    expect(nicotine_drain_rate(38)).toBeGreaterThan(150 / 100 / 0.7)
  })
})

describe('段階効果', () => {
  it('離脱症状で移動速度が 128 から 96 に落ちる', () => {
    expect(player_speed(nicotine_stage_normal)).toBe(128)
    expect(player_speed(nicotine_stage_edgy)).toBe(128)
    expect(player_speed(nicotine_stage_withdrawal)).toBe(96)
    expect(player_speed(nicotine_stage_limit)).toBe(96)
  })

  // 設計書 §1: 基礎 0.1 秒 × ニコチン係数。火力強化の係数は計画B で挟まる
  it('離脱症状では射撃間隔が 1.8 倍になる', () => {
    expect(shot_interval(nicotine_stage_normal)).toBeCloseTo(0.1, 6)
    expect(shot_interval(nicotine_stage_edgy)).toBeCloseTo(0.1, 6)
    expect(shot_interval(nicotine_stage_withdrawal)).toBeCloseTo(0.18, 6)
    expect(shot_interval(nicotine_stage_limit)).toBeCloseTo(0.18, 6)
  })

  it('離脱症状で弾の拡散が 2 倍になる', () => {
    expect(shot_spread(nicotine_stage_normal)).toBeCloseTo(0.2, 6)
    expect(shot_spread(nicotine_stage_edgy)).toBeCloseTo(0.2, 6)
    expect(shot_spread(nicotine_stage_withdrawal)).toBeCloseTo(0.4, 6)
  })

  // レビュー B-4: RGB を下げても見える範囲は変わらない。falloff を上げて半径を縮める
  it('ライトの falloff は段階が進むほど大きくなる（＝半径が縮む）', () => {
    expect(player_light_falloff(nicotine_stage_normal)).toBe(0.04)
    expect(player_light_falloff(nicotine_stage_edgy)).toBeGreaterThan(0.04)
    expect(player_light_falloff(nicotine_stage_withdrawal))
      .toBeGreaterThan(player_light_falloff(nicotine_stage_edgy))
  })

  it('ミニマップ半径は段階が進むほど小さくなる', () => {
    expect(minimap_radius(nicotine_stage_normal)).toBe(10)
    expect(minimap_radius(nicotine_stage_edgy)).toBeLessThan(10)
    expect(minimap_radius(nicotine_stage_withdrawal))
      .toBeLessThan(minimap_radius(nicotine_stage_edgy))
  })

  it('手の震えは離脱症状から発生する', () => {
    expect(camera_shake_amount(nicotine_stage_normal)).toBe(0)
    expect(camera_shake_amount(nicotine_stage_edgy)).toBe(0)
    expect(camera_shake_amount(nicotine_stage_withdrawal)).toBeGreaterThan(0)
  })

  it('段階ごとに色が定義されている', () => {
    for (const stage of [0, 1, 2, 3]) {
      expect(stage_color(stage)).toMatch(/^#[0-9a-f]{3}$/)
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/nicotine.test.ts
```

Expected: FAIL —「Failed to resolve import "./nicotine"」

- [ ] **Step 3: 実装を書く**

`source/nicotine.ts` を新規作成:

```ts
// ニコチンの数値ロジック。副作用を持たず、実行時 import も持たない。
// Node 環境（Vitest）でモックなしに評価できることがこのモジュールの条件。
// entity-player / game / minimap / hud の四者から読まれるため、式をここに一本化する。

export const nicotine_stage_normal = 0 // 100〜61%
export const nicotine_stage_edgy = 1 // 60〜31% そわそわ
export const nicotine_stage_withdrawal = 2 // 30〜1% 離脱症状
export const nicotine_stage_limit = 3 // 0% 限界

export function nicotine_stage(nicotine: number, nicotine_max: number): number {
  const ratio = nicotine / nicotine_max
  if (ratio > 0.6) { return nicotine_stage_normal }
  if (ratio > 0.3) { return nicotine_stage_edgy }
  if (ratio > 0) { return nicotine_stage_withdrawal }
  return nicotine_stage_limit
}

// 毎秒の減少量。深度が上がるほど速くなるが、線形だと計画B の恒久強化の実効倍率
// （最大 150 / 耐性 −30% = 2.143 倍）と深度 20 でちょうど相殺してしまい、
// それ以降は伸びしろがゼロになる。√ にすると釣り合う点が深度 37 まで動く。
// 係数 0.19 は設計書 §1 の目安（深度 1 で 100 秒 / 深度 11 で 62 秒）を通る値。
export function nicotine_drain_rate(depth: number): number {
  return 1 + 0.19 * Math.sqrt(depth - 1)
}

export function player_speed(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 96 : 128
}

// 基礎 0.1 秒 × ニコチン係数（離脱症状で 1.8）
export function shot_interval(stage: number): number {
  return 0.1 * (stage >= nicotine_stage_withdrawal ? 1.8 : 1)
}

// 射角に加算する乱数の幅。0.2 が既定（entity-player の元の実装と同じ）
export function shot_spread(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 0.4 : 0.2
}

// push_light() の第 7 引数。減衰は 1/(falloff * 距離) なので、
// falloff を上げるほど照らされる半径が縮む。RGB を下げても青く沈むだけで
// 見える範囲は変わらない（霧と環境光が別に効いているため）。
export function player_light_falloff(stage: number): number {
  if (stage === nicotine_stage_normal) { return 0.04 }
  if (stage === nicotine_stage_edgy) { return 0.07 }
  return 0.1
}

export function minimap_radius(stage: number): number {
  if (stage === nicotine_stage_normal) { return 10 }
  if (stage === nicotine_stage_edgy) { return 7 }
  return 5
}

// camera.shake は毎フレーム 0.9 倍に減衰するので、0.15 を足し続けると
// 1.5 付近で釣り合う（蜘蛛の撃破が 1、歩哨が 3）。フレームレート依存だが、
// 減衰側が既にそうなっているので合わせる。
export function camera_shake_amount(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 0.15 : 0
}

export function stage_color(stage: number): string {
  return ['#e90', '#f70', '#f30', '#f00'][stage]
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/nicotine.test.ts
```

Expected: PASS（15 tests）

- [ ] **Step 5: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add source/nicotine.ts source/nicotine.test.ts
git commit -m "feat: ニコチンの数値ロジックを純粋関数として切り出す"
```

---

## Task 2: フロア生成器 — 部屋・通路・壁

**Files:**
- Create: `source/level-generator.ts`
- Test: `source/level-generator.test.ts`

**Interfaces:**
- Consumes: `random.ts` の `array_rand` / `random_int` / `random_seed`、`state.ts` の `level_width` / `level_height`（定数のみ）
- Produces（このタスク時点）:
  - `interface tile_pos_t { x: number; z: number }`（タイル座標）
  - `interface room_t { x: number; z: number; w: number; h: number }`（左上のタイル座標と大きさ）
  - `interface level_layout_t { tiles: Uint8Array; rooms: room_t[]; start: tile_pos_t }`（Task 3 / 4 でフィールドが増える）
  - `generate_level(depth: number, seed: number): level_layout_t`
  - `level_vert_cost(tiles: Uint8Array): number`

**このモジュールは `renderer.ts` / `dom.ts` / `audio.ts` を import してはならない。** それらはモジュール初期化時に `canvas.getContext()` や `document.getElementById()` を実行するため、Node 環境で評価できない。1000 シード検証をモックなしで回せることがこの分割の目的（レビュー D-1）。

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { generate_level, level_vert_cost } from './level-generator'
import type { level_layout_t } from './level-generator'
import { level_height, level_width } from './state'

function tile_index(x: number, z: number): number {
  return x + z * level_width
}

function is_floor(tiles: Uint8Array, x: number, z: number): boolean {
  if (x < 0 || x >= level_width || z < 0 || z >= level_height) { return false }
  const t = tiles[tile_index(x, z)]
  return t > 0 && t < 8
}

// 生成器の内部 BFS とは独立に書く。同じバグを二重に持たないため。
function reachable_from(layout: level_layout_t): Uint8Array {
  const seen = new Uint8Array(level_width * level_height)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  seen[queue[0]] = 1
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (seen[n]) { continue }
      seen[n] = 1
      queue.push(n)
    }
  }
  return seen
}

describe('generate_level: 決定性', () => {
  it('同じ深度とシードからは同じ間取りが出る', () => {
    const a = generate_level(5, 12345)
    const b = generate_level(5, 12345)
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles))
    expect(b.rooms).toEqual(a.rooms)
    expect(b.start).toEqual(a.start)
  })

  it('シードが違えば間取りが変わる', () => {
    const a = generate_level(5, 1)
    const b = generate_level(5, 2)
    expect(Array.from(b.tiles)).not.toEqual(Array.from(a.tiles))
  })
})

describe('generate_level: 部屋', () => {
  it('部屋は互いに 1 タイル以上空いている', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { rooms } = generate_level(1, seed)
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i]
          const b = rooms[j]
          const separated =
            a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x ||
            a.z + a.h + 1 <= b.z || b.z + b.h + 1 <= a.z
          expect(separated).toBe(true)
        }
      }
    }
  }, 30000)

  it('部屋は必ず 3 つ以上ある', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(generate_level(1, seed).rooms.length).toBeGreaterThanOrEqual(3)
    }
  }, 30000)

  it('部屋は外周 1 タイルを空けて収まる', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const room of generate_level(1, seed).rooms) {
        expect(room.x).toBeGreaterThanOrEqual(1)
        expect(room.z).toBeGreaterThanOrEqual(1)
        expect(room.x + room.w).toBeLessThanOrEqual(level_width - 1)
        expect(room.z + room.h).toBeLessThanOrEqual(level_height - 1)
      }
    }
  }, 30000)
})

describe('generate_level: 連結性', () => {
  it('1000 シードすべてで全床タイルが開始地点から到達可能', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const layout = generate_level(1, seed)
      const seen = reachable_from(layout)
      for (let i = 0; i < layout.tiles.length; i++) {
        const t = layout.tiles[i]
        if (t > 0 && t < 8) {
          expect(seen[i]).toBe(1)
        }
      }
    }
  }, 60000)
})

describe('generate_level: 壁', () => {
  // レビュー A-1: タイル 0（空）は _collides() が通行可能とみなす。
  // 床に隣接する空タイルが 1 つでも残ると自機がマップ外へ歩いて出る。
  it('床に 8 近傍で隣接する非床タイルはすべて壁になっている', () => {
    // 300 シード × 約 1600 空タイル × 9 近傍を素の expect で回すと 430 万回を超え、
    // このテスト 1 本で 2 分近くかかる。走査範囲は変えず、違反を見つけたときだけ記録する。
    const violations: string[] = []
    for (let seed = 1; seed <= 300; seed++) {
      const { tiles } = generate_level(1, seed)
      for (let z = 0; z < level_height; z++) {
        for (let x = 0; x < level_width; x++) {
          if (tiles[tile_index(x, z)] !== 0) { continue }
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (is_floor(tiles, x + dx, z + dz) && violations.length < 5) {
                violations.push(
                  `seed ${seed}: 空タイル (${x},${z}) が床 (${x + dx},${z + dz}) に隣接`,
                )
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
  }, 30000)

  // レビュー A-2: 非床を全部壁で埋めると 2800〜3400 タイルになり
  // buffer_data.set() が RangeError を投げる（壁だけなら 2730 タイルが上限）
  it('頂点コストが renderer の予算を超えない', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(level_vert_cost(generate_level(1, seed).tiles)).toBeLessThanOrEqual(60000)
    }
  }, 60000)

  it('level_vert_cost は床 6 / 壁 24 で数える', () => {
    const tiles = new Uint8Array(level_width * level_height)
    tiles[0] = 1 // 床
    tiles[1] = 7 // 床
    tiles[2] = 8 // 壁
    tiles[3] = 17 // 壁
    expect(level_vert_cost(tiles)).toBe(6 * 2 + 24 * 2)
  })
})

describe('generate_level: 開始地点', () => {
  it('開始地点は床タイルの上にある', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(1, seed)
      expect(is_floor(layout.tiles, layout.start.x, layout.start.z)).toBe(true)
    }
  }, 30000)
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: FAIL —「Failed to resolve import "./level-generator"」

- [ ] **Step 3: 実装を書く**

`source/level-generator.ts` を新規作成:

```ts
import { array_rand, random_int, random_seed } from './random'
import { level_height, level_width } from './state'

// このモジュールは renderer / dom / audio を import しない。
// それらはモジュール初期化時に canvas.getContext() や document.getElementById() を
// 実行するため Node 環境で評価できない。1000 シード検証をモックなしで回すための分割。

export interface tile_pos_t {
  x: number // タイル座標
  z: number
}

export interface room_t {
  x: number // 左上のタイル座標
  z: number
  w: number
  h: number
}

export interface level_layout_t {
  tiles: Uint8Array
  rooms: room_t[]
  start: tile_pos_t
}

// renderer.ts の max_verts（1024*64 = 65536）から、エンティティのスプライトと
// 喫煙所・非常口のブロックぶんの余裕を引いた値。push_floor = 6 verts /
// push_block = 24 verts なので、輪郭壁だけにしてもタイル数次第では超えうる。
const max_level_verts = 60000

const room_count_min = 8
const room_count_max = 12
const room_size_min = 5
const room_size_max = 11
const room_place_attempts = 200 // 部屋ごとではなく 1 レベル全体での試行回数
const room_count_floor = 3 // これを下回るシードは棄却して次のシードで作り直す
const layout_attempts = 8
const rng_warmup = 8 // 下の build_layout のコメントを参照

function tile_index(x: number, z: number): number {
  return x + z * level_width
}

function room_center(room: room_t): tile_pos_t {
  return { x: room.x + (room.w >> 1), z: room.z + (room.h >> 1) }
}

// 1 タイル以上空ける = 片方を 1 タイル膨らませた矩形が重ならないこと
function rooms_overlap(a: room_t, b: room_t): boolean {
  return !(
    a.x + a.w + 1 <= b.x ||
    b.x + b.w + 1 <= a.x ||
    a.z + a.h + 1 <= b.z ||
    b.z + b.h + 1 <= a.z
  )
}

function place_rooms(): room_t[] {
  const rooms: room_t[] = []
  const target = random_int(room_count_min, room_count_max)

  for (let i = 0; i < room_place_attempts && rooms.length < target; i++) {
    const w = random_int(room_size_min, room_size_max)
    const h = random_int(room_size_min, room_size_max)
    // 外周 1 タイルは輪郭壁のために空けておく
    const room: room_t = {
      x: random_int(1, level_width - w - 2),
      z: random_int(1, level_height - h - 2),
      w,
      h,
    }
    if (!rooms.some((other) => rooms_overlap(room, other))) {
      rooms.push(room)
    }
  }
  return rooms
}

function carve_floor(tiles: Uint8Array, x: number, z: number): void {
  if (x < 1 || x >= level_width - 1 || z < 1 || z >= level_height - 1) { return }
  // 床のバリエーション抽選は既存の PNG 版と同じ重み
  tiles[tile_index(x, z)] =
    array_rand([1, 1, 1, 1, 1, 3, 3, 2, 5, 5, 5, 5, 5, 5, 7, 7, 6])
}

function carve_room(tiles: Uint8Array, room: room_t): void {
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      carve_floor(tiles, x, z)
    }
  }
}

// 幅 2 の L 字通路。横に掘ってから縦に掘る。
// 横の区間は行 from.z / from.z+1、縦の区間は列 to.x / to.x+1 なので、
// 両者は (to.x, from.z) を共有して必ずつながる。
function carve_corridor(tiles: Uint8Array, from: tile_pos_t, to: tile_pos_t): void {
  const step_x = from.x < to.x ? 1 : -1
  for (let x = from.x; x !== to.x + step_x; x += step_x) {
    carve_floor(tiles, x, from.z)
    carve_floor(tiles, x, from.z + 1)
  }
  const step_z = from.z < to.z ? 1 : -1
  for (let z = from.z; z !== to.z + step_z; z += step_z) {
    carve_floor(tiles, to.x, z)
    carve_floor(tiles, to.x + 1, z)
  }
}

function is_floor_tile(tiles: Uint8Array, x: number, z: number): boolean {
  if (x < 0 || x >= level_width || z < 0 || z >= level_height) { return false }
  const t = tiles[tile_index(x, z)]
  return t > 0 && t < 8
}

// 床に隣接する非床タイルだけを壁にする。「非床を全部壁にする」と
// 2800〜3400 タイルぶんの push_block になって頂点バッファが溢れる。
function build_walls(tiles: Uint8Array): void {
  const walls: number[] = []

  for (let z = 0; z < level_height; z++) {
    for (let x = 0; x < level_width; x++) {
      if (is_floor_tile(tiles, x, z)) { continue }
      let adjacent = false
      for (let dz = -1; dz <= 1 && !adjacent; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && is_floor_tile(tiles, x + dx, z + dz)) {
            adjacent = true
            break
          }
        }
      }
      if (adjacent) { walls.push(tile_index(x, z)) }
    }
  }

  // 走査しながら書き込むと読み手が混乱するので、収集してから書く
  for (const index of walls) {
    tiles[index] = random_int(0, 5) < 4 ? 8 : random_int(8, 17)
  }
}

// renderer.ts の push_floor / push_block が積む頂点数。
// 定数を変えるときは renderer.ts と必ず一緒に見ること。
export function level_vert_cost(tiles: Uint8Array): number {
  let cost = 0
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (t > 7) { cost += 24 } else if (t > 0) { cost += 6 }
  }
  return cost
}

function build_layout(depth: number, seed: number): level_layout_t | null {
  random_seed(seed)

  // random.ts の LCG は seed 直後の数回の出力がシードと強く相関する。
  // これを捨てないと、1 ラン内の連続する深度（run_seed + depth * 7919）で
  // 最初の部屋の幅と x 座標がほぼ同じ値に張り付き、部屋数も 1 種類に固定される。
  // 8 回捨てると部屋数 8〜12 がほぼ一様に散る（実測）。
  // random.ts 自体は変えない。random.test.ts が旧実装との出力一致を固定していて、
  // レベル生成の再現性がそこに乗っているため。
  for (let i = 0; i < rng_warmup; i++) { random_int(0, 1) }

  const tiles = new Uint8Array(level_width * level_height)
  const rooms = place_rooms()
  if (rooms.length < room_count_floor) { return null }

  for (const room of rooms) { carve_room(tiles, room) }

  // 一本鎖でつなぐので連結性は構築上保証される
  for (let i = 0; i + 1 < rooms.length; i++) {
    carve_corridor(tiles, room_center(rooms[i]), room_center(rooms[i + 1]))
  }

  // 袋小路だけだと引き返しが単調になるため、ループを 1〜2 本足す
  const shortcuts = random_int(1, 2)
  for (let i = 0; i < shortcuts; i++) {
    const a = random_int(0, rooms.length - 1)
    const b = random_int(0, rooms.length - 1)
    if (a !== b) {
      carve_corridor(tiles, room_center(rooms[a]), room_center(rooms[b]))
    }
  }

  build_walls(tiles)

  return { tiles, rooms, start: room_center(rooms[0]) }
}

export function generate_level(depth: number, seed: number): level_layout_t {
  for (let attempt = 0; attempt < layout_attempts; attempt++) {
    const layout = build_layout(depth, seed + attempt * 104729)
    if (layout && level_vert_cost(layout.tiles) <= max_level_verts) {
      return layout
    }
  }
  // 8 シード連続で条件を満たさないのは配置パラメータが壊れているとき。
  // 壊れたレベルを静かに返すより落とす。
  throw new Error('level generation failed')
}
```

`depth` はこのタスクではまだ使わない。Task 3 で `build_layout` が使い始めるが、`generate_level` の呼び出し規約を後から変えないよう、シグネチャは今の形で確定させる。TS の `noUnusedParameters` は有効化していないので未使用でも型チェックは通る。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: PASS（10 tests）

- [ ] **Step 5: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts
git commit -m "feat: 部屋と通路と輪郭壁を手続き生成する"
```

---

## Task 3: フロア生成器 — 喫煙所・ダミー・非常口の選定

**Files:**
- Modify: `source/level-generator.ts`
- Modify: `source/level-generator.test.ts`

**Interfaces:**
- Consumes: Task 2 の `build_layout` / `room_center` / `tile_index` / `is_floor_tile`
- Produces: `level_layout_t` に `smoking_area: tile_pos_t` / `dummies: tile_pos_t[]` / `exit: tile_pos_t` が加わる

**距離の定義は開始部屋中心からの BFS タイル距離に統一する。** 設計書 §2 手順 5 の「部屋[k]」は連結チェーン上の添字だったが、部屋は 64×64 にランダム配置されるので添字が大きい＝物理的に遠いにはならない。手順 3 のループ用ショートカットが入るとさらに崩れる。

喫煙所・ダミー・非常口のタイルは **`tiles` 上では壁（値 8）** にする。当たり判定は壁のまま、見た目はエンティティが毎フレーム `push_block()` で描く（レビュー A-4）。

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` のヘルパ群（`reachable_from` の直後）に追記:

```ts
import type { tile_pos_t } from './level-generator' // ファイル冒頭の type import に足す

// 開始地点から p の 8 近傍で最も近い床タイルまでの BFS 距離。
// 目標地点そのものは壁なので、隣接する床までの距離で測る。
function bfs_distance_near(layout: level_layout_t, p: tile_pos_t): number {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  dist[queue[0]] = 0
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = dist[index] + 1
      queue.push(n)
    }
  }
  // 直交 4 近傍だけを見る。BFS が 4 連結なので、壁になった目標地点の直交隣接
  // タイルの距離は必ず「そこが床だったときの距離 - 1」になる。対角を混ぜると
  // -2 のタイルが紛れ込んで測定値が ±1 ぶれ、深度ごとの単調性の検証が誤検出する。
  let best = Number.MAX_SAFE_INTEGER
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = dist[tile_index(p.x + dx, p.z + dz)]
    if (d >= 0 && d < best) { best = d }
  }
  return best
}
```

同ファイルの末尾に追記:

```ts
describe('generate_level: 目標地点', () => {
  it('喫煙所・ダミー・非常口は互いに別のタイル', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const depth of [1, 5, 12, 30]) {
        const layout = generate_level(depth, seed)
        const all = [layout.smoking_area, layout.exit, ...layout.dummies]
          .map((p) => tile_index(p.x, p.z))
        expect(new Set(all).size).toBe(all.length)
      }
    }
  }, 60000)

  // 設計書 §5: 非常口が開始部屋と同一になると詰む
  it('非常口は開始地点と別のタイル', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const depth of [1, 5, 12, 30]) {
        const layout = generate_level(depth, seed)
        expect(tile_index(layout.exit.x, layout.exit.z))
          .not.toBe(tile_index(layout.start.x, layout.start.z))
      }
    }
  }, 60000)

  // 設計書 §2「深度から整数を得ること」: floor を忘れると部屋[3.333] が
  // undefined になり深度 1 でランが詰む
  it('深度 1 でも喫煙所が定義されている', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(1, seed)
      expect(Number.isInteger(layout.smoking_area.x)).toBe(true)
      expect(Number.isInteger(layout.smoking_area.z)).toBe(true)
    }
  }, 30000)

  it('目標地点のタイルは壁になっている（見た目はエンティティが描く）', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(8, seed)
      for (const p of [layout.smoking_area, layout.exit, ...layout.dummies]) {
        expect(layout.tiles[tile_index(p.x, p.z)]).toBeGreaterThan(7)
      }
    }
  }, 30000)

  it('目標地点はすべて開始地点から到達できる', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const layout = generate_level(8, seed)
      for (const p of [layout.smoking_area, layout.exit, ...layout.dummies]) {
        expect(bfs_distance_near(layout, p)).toBeLessThan(Number.MAX_SAFE_INTEGER)
      }
    }
  }, 60000)

  // レビュー B-8: 空き部屋数でクランプしないと深度 12 以降で足りなくなる
  it('ダミー数は min(1 + floor(深度/4), 3) を上限とし、空き部屋数でも抑えられる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 4, 8, 12, 40]) {
        const layout = generate_level(depth, seed)
        const want = Math.min(1 + Math.floor(depth / 4), 3)
        const available = layout.rooms.length - 3 // 開始・喫煙所・非常口を除く
        expect(layout.dummies.length).toBe(Math.max(0, Math.min(want, available)))
      }
    }
  }, 60000)

  it('同一シード内では深度が上がるほど喫煙所が遠くなる（単調非減少）', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let last = -1
      for (const depth of [1, 3, 6, 9, 12, 15, 30]) {
        const layout = generate_level(depth, seed)
        const d = bfs_distance_near(layout, layout.smoking_area)
        expect(d).toBeGreaterThanOrEqual(last)
        last = d
      }
    }
  }, 60000)
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: FAIL — `level_layout_t` に `smoking_area` が存在しないという型エラー

- [ ] **Step 3: 実装を書く**

`source/level-generator.ts` の `level_layout_t` を差し替える:

```ts
export interface level_layout_t {
  tiles: Uint8Array
  rooms: room_t[]
  start: tile_pos_t
  smoking_area: tile_pos_t // 本物の喫煙所
  dummies: tile_pos_t[] // 灰皿撤去済みの空の喫煙所
  exit: tile_pos_t // 非常口
}
```

`level_vert_cost` の直前に BFS を追加:

```ts
// 開始タイルから床タイルだけを辿った距離。未到達は -1。
// 部屋の選定はすべてこの距離で行う。添字順やユークリッド距離を混ぜないこと。
function bfs_distances(tiles: Uint8Array, start: tile_pos_t): Int32Array {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(start.x, start.z)]
  dist[queue[0]] = 0

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    const next = dist[index] + 1

    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor_tile(tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = next
      queue.push(n)
    }
  }
  return dist
}
```

`build_layout` の `build_walls(tiles)` 以降を差し替える:

```ts
  build_walls(tiles)

  const start = room_center(rooms[0])
  const dist = bfs_distances(tiles, start)

  // 開始部屋からの BFS 距離で部屋を並べる。添字 0 が開始部屋。
  const ranked = rooms
    .map((room) => room_center(room))
    .map((center) => ({ center, d: dist[tile_index(center.x, center.z)] }))
    .filter((entry) => entry.d >= 0)
    .sort((a, b) => a.d - b.d)

  if (ranked.length < room_count_floor) { return null }

  // 深度が上がるほど遠くなる。Math.floor を省くと部屋[3.333] が undefined になり
  // 深度 1 でランが詰む。min を取る前に floor を適用すること。
  const k = Math.min(3 + Math.floor(depth / 3), ranked.length - 1)
  const smoking_area = ranked[k].center

  // 非常口は喫煙所の部屋を除いて最も遠い部屋。除外しないと深度が上がって
  // k が最終部屋を指したとき喫煙所と非常口が同室になる。
  // ranked.length >= 3 かつ k >= 2 なので、この探索は必ず添字 1 以上を返す
  // （= 非常口が開始部屋になることはない）。
  let exit_rank = 0
  for (let i = ranked.length - 1; i >= 1; i--) {
    if (i !== k) { exit_rank = i; break }
  }
  const exit = ranked[exit_rank].center

  // ダミーは開始・喫煙所・非常口を除いた部屋から。
  // 部屋数が足りないときは置ける数だけにする。
  const eligible: number[] = []
  for (let i = 1; i < ranked.length; i++) {
    if (i !== k && i !== exit_rank) { eligible.push(i) }
  }
  const dummy_target = Math.min(1 + Math.floor(depth / 4), 3)
  const dummies: tile_pos_t[] = []
  while (dummies.length < dummy_target && eligible.length > 0) {
    const pick = random_int(0, eligible.length - 1)
    dummies.push(ranked[eligible[pick]].center)
    eligible.splice(pick, 1)
  }

  // 喫煙所・ダミー・非常口はブロックとして立つので当たり判定を壁にする。
  // 見た目はエンティティが毎フレーム push_block() する。レベルジオメトリは
  // renderer_freeze_level_geometry() で焼かれていて後から書き換えられないため、
  // 非常口の「壁 → 床」を静的ジオメトリで表現することはできない。
  for (const p of [smoking_area, exit, ...dummies]) {
    tiles[tile_index(p.x, p.z)] = 8
  }

  return { tiles, rooms, start, smoking_area, dummies, exit }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: PASS（17 tests）

- [ ] **Step 5: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts
git commit -m "feat: 喫煙所と非常口を BFS 距離で選ぶ"
```

---

## Task 4: フロア生成器 — 敵とアイテムの配置

**Files:**
- Modify: `source/level-generator.ts`
- Modify: `source/level-generator.test.ts`

**Interfaces:**
- Consumes: Task 3 の `bfs_distances` の結果 `dist`
- Produces:
  - `level_layout_t` に `spiders: tile_pos_t[]` / `sentries: tile_pos_t[]` / `health: tile_pos_t[]` が加わる
  - `enemy_budget(depth: number): number`
  - `sentry_count(depth: number): number`

**既存の `random_int(0, 16 - id * 2) == 0` は流用できない。** 深度 8 で `random_int(0, 0)` が常に 0 を返して全床タイルに敵が湧き、深度 9 以降は負のレンジで当選率が非単調に振れる（レビュー A-3）。床タイルごとの確率抽選をやめ、深度から**総数**を決めて床タイルから抽選配置する。`game.ts` の衝突判定は O(n²) なので、総数に上限があること自体が要件。

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` の import に `enemy_budget` / `sentry_count` を足し、ヘルパ群に追記:

```ts
// 床タイルそのものへの BFS 距離（bfs_distance_near は壁の目標地点用）
function bfs_distance_floor(layout: level_layout_t, p: tile_pos_t): number {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  dist[queue[0]] = 0
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = dist[index] + 1
      queue.push(n)
    }
  }
  return dist[tile_index(p.x, p.z)]
}
```

同ファイルの末尾に追記:

```ts
describe('敵の総数', () => {
  // レビュー A-3: 既存の式は深度 8 で当選率 100%、深度 9 以降で非単調になる
  it('深度が上がると単調非減少で、上限で頭打ちになる', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(enemy_budget(depth + 1)).toBeGreaterThanOrEqual(enemy_budget(depth))
      expect(sentry_count(depth + 1)).toBeGreaterThanOrEqual(sentry_count(depth))
    }
    expect(enemy_budget(1000)).toBe(100)
    expect(sentry_count(1000)).toBe(10)
  })

  it('深度 1 は敵 34 体、うちセントリー 1 体', () => {
    expect(enemy_budget(1)).toBe(34)
    expect(sentry_count(1)).toBe(1)
  })
})

describe('generate_level: 配置', () => {
  it('敵とアイテムは床タイルの上にあり、互いに重ならない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      const all = [...layout.spiders, ...layout.sentries, ...layout.health]
      for (const p of all) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
      }
      const indices = all.map((p) => tile_index(p.x, p.z))
      expect(new Set(indices).size).toBe(indices.length)
    }
  }, 60000)

  // 既存の「開始位置周辺 64px 以内は除外」を BFS 距離 8 タイルに置き換えたもの
  it('敵とアイテムは開始地点から 8 タイル以上離れている', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      for (const p of [...layout.spiders, ...layout.sentries, ...layout.health]) {
        expect(bfs_distance_floor(layout, p)).toBeGreaterThanOrEqual(8)
      }
    }
  }, 60000)

  it('敵の総数は予算を超えない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 10, 30]) {
        const layout = generate_level(depth, seed)
        expect(layout.spiders.length + layout.sentries.length)
          .toBeLessThanOrEqual(enemy_budget(depth))
        expect(layout.sentries.length).toBeLessThanOrEqual(sentry_count(depth))
      }
    }
  }, 60000)

  it('体力回復アイテムは 2〜4 個', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(3, seed)
      expect(layout.health.length).toBeGreaterThanOrEqual(2)
      expect(layout.health.length).toBeLessThanOrEqual(4)
    }
  }, 30000)
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: FAIL —「Failed to resolve import "enemy_budget"」

- [ ] **Step 3: 実装を書く**

`source/level-generator.ts` の `level_layout_t` を差し替える:

```ts
export interface level_layout_t {
  tiles: Uint8Array
  rooms: room_t[]
  start: tile_pos_t
  smoking_area: tile_pos_t
  dummies: tile_pos_t[]
  exit: tile_pos_t
  spiders: tile_pos_t[]
  sentries: tile_pos_t[]
  health: tile_pos_t[]
}
```

定数に追記:

```ts
const spawn_min_distance = 8 // 開始地点からの BFS タイル距離。ここより近くには湧かせない
```

`level_vert_cost` の手前に追加:

```ts
// 深度あたりの敵の総数。既存の「床タイルごとに random_int(0, 16 - id*2) == 0」は
// 深度 8 で当選率 100%、深度 9 以降で負のレンジになり当選率が非単調に振れる。
// 総数で管理すれば単調性も上限も保証できる。上限があること自体が要件で、
// game.ts のエンティティ衝突判定は O(n²)。
export function enemy_budget(depth: number): number {
  return Math.min(30 + depth * 4, 100)
}

export function sentry_count(depth: number): number {
  return Math.min(1 + Math.floor(depth / 2), 10)
}
```

`build_layout` の末尾（目標地点を壁にした直後の `return` 文）を差し替える:

```ts
  for (const p of [smoking_area, exit, ...dummies]) {
    tiles[tile_index(p.x, p.z)] = 8
  }

  // 湧き先の候補。目標地点は直前に壁へ変えたのでここで自然に除外される。
  const spawnable: number[] = []
  for (let i = 0; i < dist.length; i++) {
    const t = tiles[i]
    if (dist[i] >= spawn_min_distance && t > 0 && t < 8) { spawnable.push(i) }
  }

  // 候補から重複なく取り出す。候補が尽きたら取れた分で打ち切る。
  const take = (count: number): tile_pos_t[] => {
    const out: tile_pos_t[] = []
    for (let i = 0; i < count && spawnable.length > 0; i++) {
      const pick = random_int(0, spawnable.length - 1)
      const index = spawnable[pick]
      spawnable.splice(pick, 1)
      out.push({ x: index % level_width, z: (index / level_width) | 0 })
    }
    return out
  }

  const sentries = take(sentry_count(depth))
  const spiders = take(enemy_budget(depth) - sentries.length)
  const health = take(random_int(2, 4))

  return {
    tiles, rooms, start, smoking_area, dummies, exit, spiders, sentries, health,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts
```

Expected: PASS（23 tests）

- [ ] **Step 5: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts
git commit -m "feat: 敵とアイテムを深度スケールした総数で配置する"
```

---

## Task 5: ニコチンゲージの HUD

**Files:**
- Modify: `index.html`
- Modify: `source/dom.ts`
- Create: `source/hud.ts`

**Interfaces:**
- Consumes: `dom.ts` の `nicotine_bar` / `nicotine_fill`、`nicotine.ts` の `stage_color`
- Produces: `hud_show(): void` / `hud_hide(): void` / `hud_update(nicotine: number, nicotine_max: number, stage: number): void`

**なぜ DOM で描くか。** HP バーは `push_sprite()` でカメラ相対のワールド座標に置かれている。同じ手で画面下部に持っていくには 45 度傾いたビュー行列を逆算する必要があり、しかも遠くなるぶんスプライトが 4 分の 1 の大きさで描かれて読めなくなる。`push_sprite` はクアッドの大きさが 6×6 固定なので補正もできず、直すには `renderer.ts` を触ることになる（設計書 §4 の「手を入れないもの」と矛盾する）。`#a`（ターミナル）と `#m`（ミニマップ）が既に DOM オーバーレイなので、そのパターンに乗せるのが最も単純。段階に応じた色替えも DOM のほうが素直に書ける。

このタスクでは要素を作るだけで、まだどこからも呼ばれない。配線は Task 7。

- [ ] **Step 1: index.html に要素と CSS を足す**

`<style>` 内、`#m{...}` の行の直後に追記:

```css
		#n{position:absolute;bottom:2vw;left:2vw;width:40vw;height:1.6vw;background:rgba(0,0,0,.7);border:0.3125vw solid #e90;display:none;}
		#nf{display:block;height:100%;width:100%;background:#e90;}
```

`<body>` 内、`<canvas id="m" ...>` の直後に追記:

```html
	<div id="n"><i id="nf"></i></div>
```

- [ ] **Step 2: dom.ts に要素を足す**

`source/dom.ts` の冒頭 2 行のコメントを次に置き換える:

```ts
// index.html の要素 ID による暗黙グローバル（c / m / a / n / nf）の置き換え。
// いずれも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。
```

末尾に追記:

```ts
export const nicotine_bar = document.getElementById('n') as HTMLElement
export const nicotine_fill = document.getElementById('nf') as HTMLElement
```

- [ ] **Step 3: hud.ts を書く**

`source/hud.ts` を新規作成:

```ts
import { nicotine_bar, nicotine_fill } from './dom'
import { stage_color } from './nicotine'

// ニコチンゲージは push_sprite() ではなく DOM オーバーレイで描く。
// HP バーと同じ手で画面下部に置くと、傾いたビュー行列のぶん遠くなって
// スプライトが読めない大きさになり、直すには renderer.ts を触ることになる。

export function hud_show(): void {
  nicotine_bar.style.display = 'block'
}

export function hud_hide(): void {
  nicotine_bar.style.display = 'none'
}

export function hud_update(nicotine: number, nicotine_max: number, stage: number): void {
  nicotine_fill.style.width = (nicotine / nicotine_max) * 100 + '%'
  nicotine_fill.style.background = stage_color(stage)
}
```

- [ ] **Step 4: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし（`hud.ts` はまだ誰からも import されないが、`tsconfig.json` の `include: ["source"]` で型チェックの対象になる）

- [ ] **Step 5: コミット**

```bash
git add index.html source/dom.ts source/hud.ts
git commit -m "feat: ニコチンゲージの HUD 要素を追加する"
```
---

## Task 6: ラン状態と喫煙所・非常口のエンティティ

**Files:**
- Modify: `source/state.ts`
- Create: `source/entity-smoking-area.ts`
- Create: `source/entity-exit.ts`
- Test: `source/entity-smoking-area.test.ts`
- Test: `source/entity-exit.test.ts`
- Modify: `source/entity-init.test.ts`

**Interfaces:**
- Consumes: `entity.ts` の `entity_t`、`entity-player.ts` の `entity_player_t`、`renderer.ts` の `push_block` / `push_light`、`terminal.ts` の `terminal_show_notice`、`game.ts` の `next_level`
- Produces:
  - `state` に `nicotine: number` / `nicotine_max: number` / `smoking: number` / `exit_open: number` / `kills: number`
  - `class entity_smoking_area_t extends entity_t`（公開フィールド `is_real: boolean`）
  - `class entity_exit_t extends entity_t`

**ラン状態は `state.ts` に置く。** ニコチン量は `entity-smoking-area.ts` と `entity-player.ts` と `game.ts` の三者から読み書きされるので、`game.ts` に持たせると `game.ts → entity-player.ts → game.ts` の循環に値が乗る。`state.ts` は実行時 import を一切持たない葉モジュールとして意図的に設計されており、この用途がまさにその理由（レビュー B-3）。

このタスクではエンティティを作るだけで、まだ誰も生成しない。生成は Task 9。

`depth` / `run_seed` はこのタスクでは追加しない。`current_level` を置き換えるものなので、削除と同じタスク（Task 9）でまとめて入れる。

- [ ] **Step 1: state.ts にラン状態を足す**

`source/state.ts` の `state` オブジェクトを差し替える:

```ts
export const state = {
  time_elapsed: 0,
  game_running: 0,
  current_level: 0,
  cpus_total: 0,
  cpus_rebooted: 0,

  // ラン状態。entity-smoking-area / entity-player / game / minimap / hud の
  // 複数モジュールから読み書きされるため、葉モジュールであるここに置く。
  nicotine: 100,
  nicotine_max: 100,
  smoking: 0, // 一服中は 1。移動と射撃をロックする
  exit_open: 0, // 一服完了で 1。非常口が通れるようになる
  kills: 0,

  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
```

- [ ] **Step 2: 失敗するテストを書く**

`source/entity-smoking-area.test.ts` を新規作成:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer / audio / terminal / game はモジュール初期化時に canvas・AudioContext・
// document へ触るため Node 環境では評価できない
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
vi.mock('./game', () => ({ next_level: () => {}, reload_level: () => {} }))

import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_player_t } from './entity-player'
import { level_data, state } from './state'

// 1 フレーム進める。game_tick は衝突ループ（_check）を一巡させてから
// _render を呼ぶので、テストも同じ順で叩く。
function tick(area: entity_smoking_area_t, player: entity_player_t, dt: number): void {
  state.time_elapsed = dt
  area._check(player)
  area._render()
}

function idle(area: entity_smoking_area_t, dt: number): void {
  state.time_elapsed = dt
  area._render()
}

describe('喫煙所', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
    state.nicotine = 0
    state.nicotine_max = 100
    state.smoking = 0
    state.exit_open = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('本物は 2.5 秒で一服が完了し、非常口が開いて HP が 1 回復する', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 3

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(0)
    expect(state.nicotine).toBeCloseTo(80, 5) // 40/秒 × 2.0 秒

    tick(area, player, 0.5) // 累計 2.5 秒
    expect(state.exit_open).toBe(1)
    expect(state.nicotine).toBe(100)
    expect(player.h).toBe(4)
  })

  it('一服中は移動と射撃がロックされ、完了フレームで解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.smoking).toBe(0)
  })

  it('触れるのをやめるとロックが解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    idle(area, 0.5)
    expect(state.smoking).toBe(0)
  })

  // レビュー A-5: 中断で喫煙所を消費すると非常口が永久に開かず詰む
  it('被弾で中断すると進捗は 0 に戻るが、吸い直せる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5)
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(40, 5)

    player.h = 4 // 被弾
    tick(area, player, 0.5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)
    expect(state.nicotine).toBeCloseTo(40, 5) // 中断フレームでは回復しない

    // 吸い直せる: ここから 2.5 秒でちゃんと完了する
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(1)
  })

  it('中断されるまでに吸えた時間ぶんはゲージに残る', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    for (let i = 0; i < 3; i++) { tick(area, player, 0.5) } // 1.5 秒
    player.h = 4
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(60, 5) // 設計書 §1 の「1.5秒吸えたら60%回復」
  })

  it('ダミーは 5% だけ回復して以後は反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = false

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
  })

  it('完了した喫煙所は二度と反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }

    state.nicotine = 10
    state.exit_open = 0
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.nicotine).toBe(10)
    expect(state.exit_open).toBe(0)
  })
})
```

- [ ] **Step 3: テストが失敗することを確認する**

```bash
npx vitest run source/entity-smoking-area.test.ts
```

Expected: FAIL —「Failed to resolve import "./entity-smoking-area"」

- [ ] **Step 4: entity-smoking-area.ts を書く**

`source/entity-smoking-area.ts` を新規作成:

```ts
import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_block, push_light } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

// 一服にかかる時間（秒）。この間ずっと触れ続けないと非常口は開かない。
const smoking_duration = 2.5

export class entity_smoking_area_t extends entity_t {
  // 本物なら true、ダミー（灰皿撤去済み）なら false。
  // サブクラスのフィールド初期化子は基底 constructor（＝ _init）の後に走るので、
  // _init() 経由では渡せない（渡しても undefined で潰される）。生成側が代入する。
  is_real = false

  private _touching = false
  private _was_smoking = false
  private _progress = 0
  private _done = false
  private _hp_mark = 0
  private _animation_time = 0

  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) { this._touching = true }
  }

  // game_tick は「エンティティ i の _update → i より後ろとの衝突判定 → i の _render」
  // の順に回す。i より前のエンティティからの _check は i の反復より先に済んでいるので、
  // _render の時点で _touching はこのフレームの接触結果として完成している。
  // エンティティの添字順に依存せず判定できるのはここだけ。
  override _render(): void {
    this._animation_time += state.time_elapsed

    push_block(this.x, this.z, 4, 17)
    push_light(
      this.x + 4, 4, this.z + 12,
      1.0, 0.6, 0.1,
      this._done ? 0.08 : 0.03 + Math.sin(this._animation_time * 3) * 0.01,
    )

    const touching = this._touching
    this._touching = false

    let smoking = false
    if (touching && !this._done) {
      if (this.is_real) {
        smoking = this._advance()
      } else {
        this._take_dummy()
      }
    }

    // 移動と射撃のロック。自分が持っていたロックだけを解放する
    if (smoking) {
      state.smoking = 1
    } else if (this._was_smoking) {
      state.smoking = 0
    }
    this._was_smoking = smoking
  }

  // 戻り値は「吸い続けているか」。完了・中断のフレームでは false になり、
  // 次のフレームから移動と射撃が戻る。
  private _advance(): boolean {
    const player = state.entity_player!

    if (this._progress === 0) { this._hp_mark = player.h }

    // 被弾で中断。進捗は 0 に戻るが _done は立てないので吸い直せる。
    // 中断で喫煙所を消費すると非常口が永久に開かず、ゲージが尽きるまで
    // 何もできない詰み状態が発生する。
    if (player.h < this._hp_mark) {
      this._progress = 0
      terminal_show_notice('咳き込んだ')
      return false
    }

    this._progress += state.time_elapsed
    // 吸っている間ずっと回復するので「吸えた時間に比例」が自然に満たされる。
    // 2.5 秒で満タンになる速度。中断が事故ではなく判断のグラデーションになる。
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + (state.nicotine_max / smoking_duration) * state.time_elapsed,
    )

    if (this._progress >= smoking_duration) {
      this._complete()
      return false
    }
    return true
  }

  private _complete(): void {
    const player = state.entity_player!
    this._done = true
    state.nicotine = state.nicotine_max
    player.h = Math.min(player.h + 1, 5)
    state.exit_open = 1
    audio_play(audio_sfx_beep)
    terminal_show_notice('深く吸い込む...___非常口のロックが解除された')
  }

  // ダミーは回復手段ではなく「歩いた時間の損」。5% は深度 21 なら 2.3 秒ぶんで、
  // 実質ゼロ。回復ではなくペナルティとして設計されている。
  private _take_dummy(): void {
    this._done = true
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + state.nicotine_max * 0.05,
    )
    audio_play(audio_sfx_pickup)
    terminal_show_notice('灰皿は撤去されました')
  }
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run source/entity-smoking-area.test.ts
```

Expected: PASS（7 tests）

- [ ] **Step 6: 非常口の失敗するテストを書く**

レビュー A-4 の核心（焼かれたレベル形状を書き換えられないので、当たり判定だけ床に戻して見た目は動的ブロックの出し分けで表現する）は、手動確認だけに委ねるには壊れ方が静かすぎる。壁のまま残っても当たり判定は通ってしまうため、目で見て気づけない。

`source/entity-exit.test.ts` を新規作成:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_block と terminal_show_notice の呼び出しを記録する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({ blocks: [] as number[][], notices: [] as string[] }))

vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: (...args: number[]) => { mocks.blocks.push(args) },
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
vi.mock('./terminal', () => ({
  terminal_show_notice: (notice: string) => { mocks.notices.push(notice) },
}))
vi.mock('./game', () => ({ next_level: () => {}, reload_level: () => {} }))

import { entity_exit_t } from './entity-exit'
import { entity_player_t } from './entity-player'
import { level_data, level_width, state } from './state'

const exit_index = (80 >> 3) + (80 >> 3) * level_width

describe('非常口', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.exit_open = 0
    mocks.blocks.length = 0
    mocks.notices.length = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('閉じている間は毎フレーム壁として描かれる', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._render()
    exit._render()
    expect(mocks.blocks.length).toBe(2)
    expect(mocks.blocks[0].slice(0, 2)).toEqual([80, 80])
  })

  // レビュー A-4: renderer_freeze_level_geometry() がレベル形状を焼くので、
  // level_data だけ書き換えても見た目は壁のまま残る
  it('開通すると当たり判定が床に戻り、壁として描かれなくなる', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    level_data[exit_index] = 8

    exit._render()
    expect(level_data[exit_index]).toBe(8) // 未開通なら壁のまま

    state.exit_open = 1
    mocks.blocks.length = 0
    exit._render()
    expect(level_data[exit_index]).toBeGreaterThan(0)
    expect(level_data[exit_index]).toBeLessThan(8) // 床になっている
    expect(mocks.blocks.length).toBe(0) // もう壁として描かない
  })

  it('開通前に触れても次のフロアへ進まない', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._check(player)
    expect(mocks.notices.length).toBe(0)
  })

  it('開通後に触れると遷移は一度だけ予約される', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    exit._check(player)
    exit._check(player)
    exit._check(player)
    expect(mocks.notices.length).toBe(1)
  })
})
```

- [ ] **Step 7: テストが失敗することを確認する**

```bash
npx vitest run source/entity-exit.test.ts
```

Expected: FAIL —「Failed to resolve import "./entity-exit"」

- [ ] **Step 8: entity-exit.ts を書く**

`source/entity-exit.ts` を新規作成:

```ts
import { audio_play, audio_sfx_beep } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { next_level } from './game'
import { push_block, push_light } from './renderer'
import { level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

export class entity_exit_t extends entity_t {
  private _opened = false
  private _used = false
  private _animation_time = 0

  override _render(): void {
    this._animation_time += state.time_elapsed

    if (state.exit_open) {
      // 開通の瞬間に当たり判定だけ床へ戻す。レベル形状は
      // renderer_freeze_level_geometry() で buffer_data の先頭に焼かれていて
      // 後から書き換えられないため、「壁 → 床の差し替え」は静的ジオメトリでは
      // 表現できない。閉じている間だけ毎フレーム push_block する。
      if (!this._opened) {
        this._opened = true
        level_data[(this.x >> 3) + (this.z >> 3) * level_width] = 1
      }
    } else {
      push_block(this.x, this.z, 4, 17)
    }

    push_light(
      this.x + 4, 4, this.z + 12,
      0.2, 1.0, 0.5,
      state.exit_open ? 0.02 + Math.sin(this._animation_time * 6) * 0.01 : 0.01,
    )
  }

  override _check(other: entity_t): void {
    if (state.exit_open && !this._used && other instanceof entity_player_t) {
      this._used = true
      audio_play(audio_sfx_beep)
      // next_level() を衝突ループの中から直接呼ぶと、走査中の state.entities を
      // 差し替えることになる。terminal のコールバックは setTimeout 経由なので
      // フレームの外で走る（CPU 端末が次のレベルへ移る際に使っていたのと同じ経路）。
      terminal_show_notice('非常口を通過___下の階へ', next_level)
    }
  }
}
```

- [ ] **Step 9: テストが通ることを確認する**

```bash
npx vitest run source/entity-exit.test.ts
```

Expected: PASS（4 tests）

- [ ] **Step 10: 初期化順序のテストを足す**

`source/entity-init.test.ts` の `vi.mock('./game', ...)` を差し替える（`entity-exit.ts` が `next_level` を import するため）:

```ts
vi.mock('./game', () => ({ reload_level: () => {}, next_level: () => {} }))
```

import 群に追記:

```ts
import { entity_exit_t } from './entity-exit'
import { entity_smoking_area_t } from './entity-smoking-area'
```

`describe('クラスフィールドの初期化順序', ...)` の中に追記:

```ts
  it('entity_smoking_area_t は進捗と接触フラグを 0 / false で初期化する', () => {
    const area = new entity_smoking_area_t(64, 0, 128, 0, 18)
    expect(area.is_real).toBe(false)
    expect(peek(area, '_progress')).toBe(0)
    expect(peek(area, '_touching')).toBe(false)
    expect(peek(area, '_was_smoking')).toBe(false)
    expect(peek(area, '_done')).toBe(false)
    expect(peek(area, '_animation_time')).toBe(0)
  })

  it('entity_exit_t は未開通・未使用で始まる', () => {
    const exit = new entity_exit_t(64, 0, 128, 0, 18)
    expect(peek(exit, '_opened')).toBe(false)
    expect(peek(exit, '_used')).toBe(false)
    expect(peek(exit, '_animation_time')).toBe(0)
  })
```

- [ ] **Step 11: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 12: コミット**

```bash
git add source/state.ts source/entity-smoking-area.ts source/entity-smoking-area.test.ts source/entity-exit.ts source/entity-exit.test.ts source/entity-init.test.ts
git commit -m "feat: 喫煙所と非常口のエンティティを追加する"
```

---

## Task 7: 自機にニコチン段階を反映する

**Files:**
- Modify: `source/entity-player.ts`
- Test: `source/entity-player.test.ts`

**Interfaces:**
- Consumes: `nicotine.ts` の `nicotine_stage` / `player_speed` / `shot_interval` / `shot_spread` / `player_light_falloff`、`state.ts` の `nicotine` / `nicotine_max` / `smoking`
- Produces: `entity_player_t._receive_withdrawal_damage(): void`

`_kill()` はこのタスクでは触らない（`game.ts` の `run_end` がまだ存在しないため）。Task 9 で差し替える。

**なぜ専用のダメージメソッドか。** `_receive_damage()` は被弾後 2 秒の無敵を張るので、ニコチン切れの 2 秒ごとのダメージが無敵とちょうど拮抗して不規則になる。ニコチン切れは「被弾」ではないので無敵を通さない別経路にする。

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-player.test.ts` を新規作成:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_light の引数を覗くため、モックの外に配列を用意する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({ light_calls: [] as number[][] }))

vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_block: () => {},
  push_light: (...args: number[]) => { mocks.light_calls.push(args) },
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
vi.mock('./game', () => ({ reload_level: () => {}, next_level: () => {} }))

import { entity_player_t } from './entity-player'
import { entity_plasma_t } from './entity-plasma'
import { key_right, key_shoot, keys } from './input'
import { level_data, state } from './state'

function plasma_count(): number {
  return state.entities.filter((e) => e instanceof entity_plasma_t).length
}

describe('自機とニコチン段階', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    mocks.light_calls.length = 0
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('通常時の移動加速度は 128', () => {
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(128)
  })

  it('離脱症状（30% 以下）では 96 に落ちる', () => {
    state.nicotine = 20
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(96)
  })

  it('そわそわ（60% 以下）では移動速度は落ちない', () => {
    state.nicotine = 50
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(128)
  })

  it('一服中は移動も射撃もできない', () => {
    state.smoking = 1
    keys[key_right] = 1
    keys[key_shoot] = 1
    player._update()
    expect(player.ax).toBe(0)
    expect(player.az).toBe(0)
    expect(plasma_count()).toBe(0)
  })

  // 加速度を切るだけだと、走り込んだ勢いで摩擦が抜けるまで約 4.7px 滑る。
  // 重なり判定は 9px なので、滑って接触が外れると一服が勝手に中断する。
  it('一服中は慣性でも動かない', () => {
    state.smoking = 1
    player.vx = 25.6 // 終端速度
    player.vz = 25.6
    const x = player.x
    const z = player.z
    for (let i = 0; i < 30; i++) { player._update() }
    expect(player.x).toBe(x)
    expect(player.z).toBe(z)
  })

  it('通常時は射撃間隔 0.1 秒で撃てる', () => {
    keys[key_shoot] = 1
    player._update()
    expect(plasma_count()).toBe(1)

    // 0.1 秒経つまでは次が出ない
    state.time_elapsed = 0.05
    player._update()
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.06
    player._update()
    expect(plasma_count()).toBe(2)
  })

  it('離脱症状では射撃間隔が 1.8 倍になる', () => {
    state.nicotine = 20
    keys[key_shoot] = 1
    player._update()
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.15
    player._update()
    expect(plasma_count()).toBe(1) // 0.18 秒に届かない

    state.time_elapsed = 0.04
    player._update()
    expect(plasma_count()).toBe(2)
  })

  // レビュー B-4: RGB ではなく falloff（第 7 引数）で半径を縮める
  it('ライトの falloff が段階に応じて上がる', () => {
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.04)

    mocks.light_calls.length = 0
    state.nicotine = 50
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.07)

    mocks.light_calls.length = 0
    state.nicotine = 10
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.1)
  })
})

describe('ニコチン切れの継続ダメージ', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 0
    state.nicotine_max = 100
    state.smoking = 0
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('被弾の無敵時間を無視して HP を減らす', () => {
    player._receive_damage(player, 1) // ここで 2 秒の無敵が張られる
    expect(player.h).toBe(4)

    player._receive_withdrawal_damage()
    expect(player.h).toBe(3)
    player._receive_withdrawal_damage()
    expect(player.h).toBe(2)
  })

  it('HP が 0 になるとランが終わる', () => {
    player.h = 1
    player._receive_withdrawal_damage()
    expect(player.h).toBe(0)
    expect(player._dead).toBe(true)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/entity-player.test.ts
```

Expected: FAIL —「player._receive_withdrawal_damage is not a function」および離脱症状の速度が 128 のまま

- [ ] **Step 3: 実装を書く**

`source/entity-player.ts` を次の内容に差し替える（`_kill()` は Task 9 まで現状維持）:

```ts
import { audio_play, audio_sfx_hurt, audio_sfx_shoot } from './audio'
import { entity_t } from './entity'
import { entity_plasma_t } from './entity-plasma'
import { reload_level } from './game'
import { key_down, key_left, key_right, key_shoot, key_up, keys } from './input'
import {
  nicotine_stage, player_light_falloff, player_speed, shot_interval, shot_spread,
} from './nicotine'
import { push_light } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

export class entity_player_t extends entity_t {
  // minimap.ts が自機の向きを 1px で描くために読む
  _angle = Math.PI / 2 // face towards the viewer

  private _bob = 0
  private _frame = 0
  private _last_shot = 0
  private _last_damage = 0

  // _init() は持たない。元の実装は上記フィールドの初期化だけをしていた

  override _update(): void {
    const t = this
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    const smoking = state.smoking === 1
    // 一服中は移動も射撃もできない。無敵にはしない
    const speed = smoking ? 0 : player_speed(stage)

    // movement
    t.ax = keys[key_left] ? -speed : keys[key_right] ? speed : 0
    t.az = keys[key_up] ? -speed : keys[key_down] ? speed : 0

    // 一服中は加速度を切るだけでは足りない。基底の _update() が既存の vx / vz を
    // 積分し続けるので、走り込んで触れると摩擦で減速しながら約 4.7px 滑る。
    // エンティティ同士の重なり判定は 9px しかないため、接線方向に滑ると接触が
    // 外れて一服が勝手に中断する。速度そのものを落とす。
    if (smoking) { t.vx = t.vz = 0 }

    // rotation - face the direction of movement, hold still while shooting
    if (!keys[key_shoot] && (t.ax || t.az)) {
      t._angle = Math.atan2(t.az, t.ax)
    }
    t.s = (18 + (((t._angle / Math.PI) * 4 + 10.5) % 8)) | 0

    // bobbing
    t._bob += state.time_elapsed * 1.75 * (Math.abs(t.vx) + Math.abs(t.vz))
    t.y = Math.sin(t._bob) * 0.25

    t._last_damage -= state.time_elapsed
    t._last_shot -= state.time_elapsed

    if (!smoking && keys[key_shoot] && t._last_shot < 0) {
      audio_play(audio_sfx_shoot)
      // 元の実装の -0.11..+0.09 と同じ非対称さを保ったまま幅だけ広げる
      const spread = shot_spread(stage)
      new entity_plasma_t(
        t.x, 0, t.z, 0, 26,
        t._angle + Math.random() * spread - spread * 0.55,
      )
      t._last_shot = shot_interval(stage)
    }

    super._update()
  }

  override _render(): void {
    this._frame++
    if (this._last_damage < 0 || this._frame % 6 < 4) {
      super._render()
    }
    // 視界は falloff で縮める。RGB を下げても暖色が減って青く沈むだけで、
    // 見える範囲はフラグメントシェーダの霧と環境光が決めている
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    push_light(this.x, 4, this.z + 6, 1, 0.5, 0, player_light_falloff(stage))
  }

  protected override _kill(): void {
    super._kill()
    this.y = 10
    this.z += 5
    terminal_show_notice('展開失敗\n' + 'バックアップから復元中...')
    setTimeout(reload_level, 3000)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    if (this._last_damage < 0) {
      audio_play(audio_sfx_hurt)
      super._receive_damage(from, amount)
      this._last_damage = 2
    }
  }

  // ニコチン切れ（ゲージ 0%）の継続ダメージ。被弾ではないので
  // _receive_damage() の 2 秒の無敵を通さない。通してしまうと
  // 2 秒ごとのダメージが無敵とちょうど拮抗して不規則になる。
  _receive_withdrawal_damage(): void {
    audio_play(audio_sfx_hurt)
    this.h -= 1
    if (this.h <= 0) { this._kill() }
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/entity-player.test.ts
```

Expected: PASS（10 tests）

- [ ] **Step 5: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add source/entity-player.ts source/entity-player.test.ts
git commit -m "feat: 自機の速度と射撃と視界をニコチン段階から算出する"
```

---

## Task 8: リザルト画面と撃破数

**Files:**
- Modify: `source/terminal.ts`
- Modify: `source/entity-spider.ts`
- Modify: `source/entity-sentry.ts`
- Modify: `source/entity-init.test.ts`

**Interfaces:**
- Consumes: `state.ts` の `kills`
- Produces: `terminal_show_result(depth: number, kills: number, on_restart: () => void): void`

`terminal_run_outro()` はこのタスクでは残す。`game.ts` がまだ呼んでいるので、消すと型チェックが通らない。Task 9 で `game.ts` と一緒に削除する。

`terminal_text_outro`（JS13K のエンディングクレジット）は Task 9 で消えるが、原作・音楽の帰属表示は `terminal_text_title` に残るので失われない。

- [ ] **Step 1: 失敗するテストを書く（撃破数）**

`source/entity-init.test.ts` の末尾に追記:

```ts
// 撃破数はリザルト画面に出す。設計書 §4 は各敵エンティティを
// 「手を入れないもの」に挙げているが、_kill() 以外に数える場所がない。
describe('撃破数のカウント', () => {
  it('蜘蛛を倒すと state.kills が増える', () => {
    state.kills = 0
    const spider = new entity_spider_t(0, 0, 0, 5, 27)
    spider._receive_damage(spider, 99)
    expect(state.kills).toBe(1)
  })

  it('歩哨を倒すと state.kills が増える', () => {
    state.kills = 0
    const sentry = new entity_sentry_t(0, 0, 0, 5, 32)
    sentry._receive_damage(sentry, 99)
    expect(state.kills).toBe(1)
  })

  it('同じ敵を二度殺しても 1 しか増えない', () => {
    state.kills = 0
    const spider = new entity_spider_t(0, 0, 0, 5, 27)
    spider._receive_damage(spider, 99)
    spider._receive_damage(spider, 99)
    expect(state.kills).toBe(1)
  })
})
```

同ファイルの import に `state` を足す:

```ts
import { state } from './state'
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/entity-init.test.ts
```

Expected: FAIL — `state.kills` が 0 のまま

- [ ] **Step 3: 撃破数を数える**

`source/entity-spider.ts` の `_kill()` を差し替える:

```ts
  protected override _kill(): void {
    if (this._dead) { return } // 二重加算を防ぐ
    super._kill()
    state.kills++
    new entity_explosion_t(this.x, 0, this.z, 0, 26)
    camera.shake = 1
    audio_play(audio_sfx_explode)
  }
```

`source/entity-sentry.ts` の `entity_sentry_t._kill()` を差し替える:

```ts
  protected override _kill(): void {
    if (this._dead) { return } // 二重加算を防ぐ
    super._kill()
    state.kills++
    new entity_explosion_t(this.x, 0, this.z, 0, 26)
    camera.shake = 3
    audio_play(audio_sfx_explode)
  }
```

どちらも `state` は既に import 済み。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/entity-init.test.ts
```

Expected: PASS

- [ ] **Step 5: terminal.ts のストーリー文面を差し替える**

`source/terminal.ts` の `terminal_text_story` を差し替える:

```ts
const terminal_text_story =
  '日時: 2718年9月13日 13:32\n' +
  '生体モニタリング 警告\n' +
  '解析中...\n' +
  '____\n \n' +
  'エラーコード: NIC-0000\n' +
  '状態: 血中ニコチン濃度 低下\n' +
  '詳細: 対象は重度の喫煙依存と診断済み\n' +
  '適用法令: 嗜好性燃焼物 全面禁止条例（2703年施行）\n' +
  '当該施設の公認喫煙所: 0 箇所\n' +
  ' \n' +
  '代替療法を照会中...\n' +
  '___' +
  '該当なし\n \n' +
  '離脱症状の抑制を試行中...\n' +
  '___' +
  '失敗\n' +
  '_ \n \n' +
  '地下区画に旧式の喫煙所が残存している可能性\n' +
  '警備ドローンは稼働中\n' +
  '_ \n' +
  '移動: WASD または矢印キー / 射撃: スペース\n' +
  '音声切替: M\n' +
  'クリックで降下開始\n '
```

- [ ] **Step 6: terminal_show_result を足す**

`source/terminal.ts` の `terminal_run_outro()` の直前に追記:

```ts
// ラン終了時のリザルト。クリックで次のランを始める。
// game_running のリセットとミニマップ・HUD の非表示は game.ts の run_end が持つ。
export function terminal_show_result(
  depth: number,
  kills: number,
  on_restart: () => void,
): void {
  canvas.style.opacity = '0.3'
  terminal_el.innerHTML = ''
  terminal_text_buffer = []

  terminal_cancel()
  terminal_show()
  terminal_write_text(
    terminal_prepare_text(
      'ニコチン切れにより行動不能\n' +
      '_ \n' +
      '到達深度: ' + depth + '\n' +
      '撃破数: ' + kills + '\n' +
      '_ \n' +
      'クリックで再挑戦\n ',
    ),
    () => {
      document.onclick = () => {
        document.onclick = null
        terminal_cancel()
        terminal_hide()
        canvas.style.opacity = '1'
        on_restart()
      }
    },
  )
}
```

- [ ] **Step 7: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 8: コミット**

```bash
git add source/terminal.ts source/entity-spider.ts source/entity-sentry.ts source/entity-init.test.ts
git commit -m "feat: リザルト画面と撃破数のカウントを追加する"
```
---

## Task 9: 手続き生成への載せ替えと CPU 概念の削除

このタスクは**一度に全部やる**。`game.ts` の書き換えが `state.ts` / `minimap.ts` / `entity-player.ts` / `main.ts` / テストの修正を同時に強制するため、途中で切ると型チェックが通らない。

**Files:**
- Modify: `source/game.ts`（全面書き換え）
- Modify: `source/state.ts`
- Modify: `source/main.ts`
- Modify: `source/minimap.ts`
- Modify: `source/entity-player.ts`
- Modify: `source/terminal.ts`
- Modify: `source/entity-init.test.ts`
- Modify: `source/entity-player.test.ts`
- Modify: `source/entity-smoking-area.test.ts`
- Modify: `source/entity-exit.test.ts`
- Delete: `source/entity-cpu.ts`
- Delete: `m/l1.png`, `m/l2.png`, `m/l3.png`

**Interfaces:**
- Consumes: `level-generator.ts` の `generate_level`、`nicotine.ts` の `nicotine_drain_rate` / `nicotine_stage` / `nicotine_stage_limit` / `camera_shake_amount`、`hud.ts` の `hud_show` / `hud_hide` / `hud_update`、`terminal.ts` の `terminal_show_notice` / `terminal_show_result`、`entity-player.ts` の `_receive_withdrawal_damage`
- Produces:
  - `run_start(): void` / `next_level(): void` / `run_end(): void` / `game_tick(): void`
  - `state` に `depth: number` / `run_seed: number`
  - `state` から `current_level` / `cpus_total` / `cpus_rebooted` が消える
  - `reload_level()` と `terminal_run_outro()` が消える

- [ ] **Step 1: state.ts を最終形にする**

`source/state.ts` の `state` オブジェクトを差し替える:

```ts
export const state = {
  time_elapsed: 0,
  game_running: 0,

  // ラン状態。entity-smoking-area / entity-player / game / minimap / hud の
  // 複数モジュールから読み書きされるため、葉モジュールであるここに置く。
  depth: 0, // 到達フロア深度。最初のフロアが 1
  run_seed: 0, // ラン開始時に引く。フロアのシードは run_seed + depth * 7919
  nicotine: 100,
  nicotine_max: 100,
  smoking: 0, // 一服中は 1。移動と射撃をロックする
  exit_open: 0, // 一服完了で 1。非常口が通れるようになる
  kills: 0,

  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
```

- [ ] **Step 2: game.ts を全面的に書き換える**

`source/game.ts` を次の内容に置き換える:

```ts
import { entity_exit_t } from './entity-exit'
import { entity_health_t } from './entity-health'
import { entity_player_t } from './entity-player'
import { entity_sentry_t } from './entity-sentry'
import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_spider_t } from './entity-spider'
import { hud_hide, hud_show, hud_update } from './hud'
import { generate_level } from './level-generator'
import { minimap_hide, minimap_reset, minimap_update } from './minimap'
import {
  camera_shake_amount, nicotine_drain_rate, nicotine_stage, nicotine_stage_limit,
} from './nicotine'
import {
  camera, push_block, push_floor, push_sprite,
  renderer_end_frame, renderer_freeze_level_geometry,
  renderer_prepare_frame, renderer_reset_level_geometry,
} from './renderer'
import { level_data, level_height, level_width, state } from './state'
import { terminal_show_notice, terminal_show_result } from './terminal'

let time_last = performance.now()

// ゲージ 0% の継続ダメージ用。読み書きが game.ts に閉じるのでモジュールローカル。
let limit_damage_timer = 0

export function run_start(): void {
  // ラン開始ごとにシードを引く。シードを深度から一意に決めると、どのランでも
  // 深度 1 が同じ間取りになって暗記ゲーになる。
  state.run_seed = ((Math.random() * 0x7ffffffe) | 0) + 1
  state.depth = 0
  state.kills = 0
  state.nicotine_max = 100
  state.nicotine = state.nicotine_max
  state.game_running = 1
  next_level()
}

export function next_level(): void {
  state.depth++
  load_level(state.depth)
}

export function run_end(): void {
  state.game_running = 0
  minimap_hide()
  hud_hide()
  terminal_show_result(state.depth, state.kills, run_start)
}

function load_level(depth: number): void {
  const layout = generate_level(depth, state.run_seed + depth * 7919)

  state.entities = []
  state.entities_to_kill = []
  state.exit_open = 0
  state.smoking = 0
  limit_damage_timer = 0

  renderer_reset_level_geometry()
  minimap_reset()
  hud_show()

  level_data.set(layout.tiles)

  // 喫煙所と非常口はエンティティが毎フレーム push_block() で描くので、
  // 静的ジオメトリからは外す。焼き込んだレベル形状は後から書き換えられないため、
  // 非常口の「壁 → 床」を静的側で表現することはできない。
  const entity_tiles = new Set(
    [layout.smoking_area, layout.exit, ...layout.dummies]
      .map((p) => p.x + p.z * level_width),
  )

  for (let z = 0; z < level_height; z++) {
    for (let x = 0; x < level_width; x++) {
      const index = x + z * level_width
      if (entity_tiles.has(index)) { continue }
      const tile = level_data[index]
      if (tile > 7) {
        push_block(x * 8, z * 8, 4, tile - 1)
      } else if (tile > 0) {
        push_floor(x * 8, z * 8, tile - 1)
      }
    }
  }

  state.entity_player =
    new entity_player_t(layout.start.x * 8, 0, layout.start.z * 8, 5, 18)

  const smoking_area = new entity_smoking_area_t(
    layout.smoking_area.x * 8, 0, layout.smoking_area.z * 8, 0, 18,
  )
  smoking_area.is_real = true

  for (const p of layout.dummies) {
    new entity_smoking_area_t(p.x * 8, 0, p.z * 8, 0, 18)
  }
  new entity_exit_t(layout.exit.x * 8, 0, layout.exit.z * 8, 0, 18)

  for (const p of layout.spiders) { new entity_spider_t(p.x * 8, 0, p.z * 8, 5, 27) }
  for (const p of layout.sentries) { new entity_sentry_t(p.x * 8, 0, p.z * 8, 5, 32) }
  for (const p of layout.health) { new entity_health_t(p.x * 8, 0, p.z * 8, 5, 31) }

  const player = state.entity_player!
  camera.x = -player.x
  camera.y = -300
  camera.z = -player.z - 100

  renderer_freeze_level_geometry()

  terminal_show_notice('深度 ' + depth + ' に到達___喫煙所の残り香を探知中...')
}

export function game_tick(): void {
  const time_now = performance.now()
  state.time_elapsed = (time_now - time_last) / 1000
  time_last = time_now

  renderer_prepare_frame()

  const player = state.entity_player!

  // ニコチン減少。ラン終了後（リザルト表示中）と一服中は止める。
  // 一服中に減少を走らせると、設計書 §1 の「1.5 秒吸えたら 60% 回復」が
  // 減少ぶんだけ目減りして成立しなくなる（深度 1 で 58.5、深度 30 で 56.5）。
  // 吸っている間だけ止めるのが、要件を完全に満たす最も単純な形。
  // state.smoking が立つのは喫煙所の _render（この後）なので接触の初回 1 フレーム
  // だけは減少が走るが、深度 1 で 0.017 と誤差にもならない。
  if (state.game_running && !state.smoking) {
    state.nicotine = Math.max(
      0,
      state.nicotine - nicotine_drain_rate(state.depth) * state.time_elapsed,
    )
  }
  const stage = nicotine_stage(state.nicotine, state.nicotine_max)

  // 限界（0%）: 2 秒ごとに HP が 1 減る。即死ではなく、まだ間に合う猶予帯
  if (state.game_running && stage === nicotine_stage_limit) {
    limit_damage_timer += state.time_elapsed
    if (limit_damage_timer >= 2) {
      limit_damage_timer -= 2
      player._receive_withdrawal_damage()
    }
  } else {
    limit_damage_timer = 0
  }

  // update and render entities
  const entities = state.entities
  for (let i = 0; i < entities.length; i++) {
    const e1 = entities[i]
    if (e1._dead) { continue }
    e1._update()

    // check for collisions between entities - it's quadratic and nobody cares \o/
    for (let j = i + 1; j < entities.length; j++) {
      const e2 = entities[j]
      if (!(
        e1.x >= e2.x + 9 ||
        e1.x + 9 <= e2.x ||
        e1.z >= e2.z + 9 ||
        e1.z + 9 <= e2.z
      )) {
        e1._check(e2)
        e2._check(e1)
      }
    }

    e1._render()
  }

  // center camera on player, apply damping
  camera.x = camera.x * 0.92 - player.x * 0.08
  camera.y = camera.y * 0.92 - player.y * 0.08
  camera.z = camera.z * 0.92 - player.z * 0.08

  // add camera shake - 離脱症状では毎フレーム微量を足して手の震えにする
  camera.shake = camera.shake * 0.9 + camera_shake_amount(stage)
  camera.x += camera.shake * (Math.random() - 0.5)
  camera.z += camera.shake * (Math.random() - 0.5)

  // health bar, render with plasma sprite
  for (let i = 0; i < player.h; i++) {
    push_sprite(-camera.x - 50 + i * 4, 29 - camera.y, -camera.z - 30, 26)
  }

  hud_update(state.nicotine, state.nicotine_max, stage)

  renderer_end_frame()

  minimap_update()

  // remove dead entities
  state.entities = state.entities.filter(
    (entity) => state.entities_to_kill.indexOf(entity) === -1
  )
  state.entities_to_kill = []

  requestAnimationFrame(game_tick)
}
```

**リザルト表示中もエンティティの更新と描画は続く。これは意図的にそのままにする。** `state.game_running` で止めるのはニコチン減少と継続ダメージだけで、rAF ループ・エンティティ更新・衝突判定・ミニマップ更新は回り続ける。

- 現行の `game.ts` は `game_running` を一度も読んでおらず、エンディング（`terminal_run_outro`）のあとも同じようにループが回り続ける。つまりこれは新しく持ち込む挙動ではなく、既存の振る舞いの維持である
- canvas を 0.3 に落とした背景で敵が動き続けるのは元の演出そのもの。エンティティループを止めると背景から敵と自機が消え、見た目が変わる
- 自機は `_kill()` で `state.entities` から外れるので、リザルト中に衝突判定の相手になることはない。`player.h` は 0 以下なので HP バーのループも回らない

無駄な計算ではあるが、設計書が求めていない挙動変更であり、直すと演出が退化する。`docs/gameplay.md` にもこの判断を書く。

- [ ] **Step 3: main.ts のコールバック plumbing をやめる**

`source/main.ts` を次の内容に置き換える:

```ts
import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, run_start } from './game'
import { input_init } from './input'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_hide, terminal_run_intro, terminal_write_line } from './terminal'

input_init()

terminal_write_line('起動中...')

audio_init(() => {
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    terminal_write_line('起動中...', () => {
      renderer_init()

      const atlas = new Image()
      atlas.src = atlas_url
      atlas.onload = () => {
        terminal_hide()
        renderer_bind_image(atlas)
        // レベル生成が同期処理になったのでコールバックは要らない。
        // rAF ループはここで一度だけ回し始める（ラン再開では回し直さない）
        run_start()
        game_tick()
      }
    })
  }

  terminal_run_intro()
})
```

- [ ] **Step 4: 自機の死をラン終了にする**

`source/entity-player.ts` の import を差し替える:

```ts
import { run_end } from './game'
```

（`reload_level` と `terminal_show_notice` の import を削除する）

`_kill()` を差し替える:

```ts
  protected override _kill(): void {
    super._kill()
    this.y = 10
    this.z += 5
    // 死＝ラン終了。同じフロアの頭からやり直す経路は無くなった
    run_end()
  }
```

- [ ] **Step 5: CPU 端末の痕跡を消す**

`source/entity-cpu.ts` を削除する。

`source/minimap.ts` の 2 行目 `import { entity_cpu_t } from './entity-cpu'` を削除し、`minimap_draw()` 内の CPU 描画ブロック（`// cpus in explored areas ...` から始まる `for` ループ全体）を削除する。喫煙所と非常口の描画は Task 10 で足す。

`source/terminal.ts` から `terminal_text_outro` 定数と `terminal_run_outro()` 関数を削除し、使われなくなった import を消す:

```ts
// 削除する import
import { minimap_hide } from './minimap'
import { state } from './state'
```

（`terminal_show_result` は `canvas` と `terminal_el` しか使わない。`game_running` のリセットとミニマップ・HUD の非表示は `run_end` が持つ）

PNG のレベルデータを削除する:

```bash
git rm m/l1.png m/l2.png m/l3.png
```

- [ ] **Step 6: テストのモックを合わせる**

`source/entity-init.test.ts`:
- `import { entity_cpu_t } from './entity-cpu'` を削除
- `it('entity_cpu_t はアニメーション用の時間カウンタを 0 で初期化する', ...)` を削除
- `vi.mock('./game', () => ({ reload_level: () => {}, next_level: () => {} }))` を
  `vi.mock('./game', () => ({ run_end: () => {}, next_level: () => {} }))` に差し替え

`source/entity-player.test.ts` / `source/entity-smoking-area.test.ts` / `source/entity-exit.test.ts` の
`vi.mock('./game', ...)` も同様に `run_end` へ差し替える。

- [ ] **Step 7: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし。`entity_cpu_t` / `reload_level` / `terminal_run_outro` / `cpus_total` への参照が 1 つでも残っていればここで落ちる

- [ ] **Step 8: 残骸が無いことを確認する**

```bash
grep -rn "entity_cpu\|cpus_total\|cpus_rebooted\|reload_level\|terminal_run_outro\|current_level\|load_image\|l1.png\|l2.png\|l3.png" source/ index.html
```

Expected: 出力なし（README の記述は Task 11 で直す）

- [ ] **Step 9: ビルドが通ることを確認する**

```bash
npm run build
```

Expected: 成功。`dist/` に `index.html` と `assets/` が出る

- [ ] **Step 10: コミット**

```bash
git add -A source m index.html
git commit -m "feat: 手続き生成の無限深度ランに載せ替え、CPU 端末の概念を削除する"
```

---

## Task 10: ミニマップを喫煙所と非常口に対応させる

**Files:**
- Modify: `source/minimap.ts`

**Interfaces:**
- Consumes: `nicotine.ts` の `minimap_radius` / `nicotine_stage`、`entity-smoking-area.ts` の `entity_smoking_area_t`、`entity-exit.ts` の `entity_exit_t`
- Produces: なし（既存の `minimap_reset` / `minimap_hide` / `minimap_update` のまま）

**本物とダミーは同じオレンジで描く。** 見分けは足で確かめるしかない、という設計の中心。計画B の「嗅覚」3 段だけがこれを覆す。

非常口は `state.exit_open` が立っていて、かつ探索済みのときだけ緑で描く。フォグ・オブ・ウォーは維持するので、一度も見ていない非常口は開通しても点かない。

- [ ] **Step 1: import と半径を差し替える**

`source/minimap.ts` の import 群を差し替える:

```ts
import { minimap_canvas } from './dom'
import { entity_exit_t } from './entity-exit'
import { entity_smoking_area_t } from './entity-smoking-area'
import { minimap_radius, nicotine_stage } from './nicotine'
import { level_data, level_height, level_width, state } from './state'
```

`const minimap_view_radius = 10` の行を削除し、`minimap_reveal()` を差し替える:

```ts
function minimap_reveal(): void {
  const player = state.entity_player!
  const center_x = player.x >> 3
  const center_z = player.z >> 3
  // ゲージが減るほど描き込み半径が縮む。焦りを情報量の減少で表す。
  // minimap_explored は累積で消えないので、効くのは「新しく開く速度」だけ。
  const r = minimap_radius(nicotine_stage(state.nicotine, state.nicotine_max))

  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz <= r * r) {
        minimap_cast(center_x, center_z, center_x + dx, center_z + dz)
      }
    }
  }
}
```

- [ ] **Step 2: 喫煙所と非常口を描く**

`minimap_draw()` の中、terrain のループと player position の間（Task 9 で CPU のループを削除した位置）に追記:

```ts
  // 喫煙所は本物もダミーも同じオレンジ。見分けは足で確かめるしかない。
  // 非常口は開通していて、かつ探索済みのときだけ緑で出る。
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i]
    const index = (e.x >> 3) + (e.z >> 3) * level_width
    if (!minimap_explored[index]) { continue }

    if (e instanceof entity_smoking_area_t) {
      minimap_set_pixel(index, 238, 153, 0)
    } else if (e instanceof entity_exit_t && state.exit_open) {
      minimap_set_pixel(index, 0, 220, 120)
    }
  }
```

- [ ] **Step 3: 型チェックと全テスト**

```bash
npm run typecheck && npm test
```

Expected: どちらもエラーなし

- [ ] **Step 4: コミット**

```bash
git add source/minimap.ts
git commit -m "feat: ミニマップに喫煙所と非常口を描き、半径をゲージに連動させる"
```

---

## Task 11: ドキュメント更新と体感の確認

**Files:**
- Create: `docs/gameplay.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Delete: `docs/superpowers/plans/2026-08-19-nicotine-roguelite-core.md`（この計画ファイル）

数値ロジックの正しさは Task 1〜4 の自動テストで担保済み。ここで見るのは**見え方・難易度・テンポ**（設計書 §6 が手動確認に回した部分）。

設計書とレビュー（`docs/superpowers/specs/`）は**削除しない**。計画B がまだ参照するため、そちらの完了時にまとめて蒸留・削除する。

- [ ] **Step 1: 開発サーバで動かして確認する**

```bash
npm run dev
```

表示された URL を開き、次を目視で確認する。

| 確認項目 | 期待 |
| --- | --- |
| 起動 | イントロが流れ、クリックで深度 1 に降りる |
| 壁 | 部屋の外へ歩いて出られない。虚空を直線移動できない |
| ゲージ | 画面下部にオレンジのバーが出て、目に見える速さで減る |
| そわそわ（60% 以下） | バーが濃いオレンジになり、自機まわりの明るい範囲が狭まる |
| 離脱症状（30% 以下） | バーが赤寄りになり、移動が重くなり、弾がばらけ、画面が細かく震える |
| 限界（0%） | HP が 2 秒ごとに 1 ずつ減る |
| 喫煙所 | 触れると動けなくなり、2.5 秒でゲージ全快。被弾で中断しても吸い直せる |
| ダミー | 「灰皿は撤去されました」が出て、ゲージはほぼ増えない |
| 非常口 | 一服前は壁として見え、一服完了後に通れる。ミニマップに緑が出る |
| ミニマップ | 喫煙所は本物もダミーもオレンジで同じ見た目 |
| 深度 | 非常口を通ると深度が 1 増え、間取りが変わる |
| 死亡 | リザルトが出て深度と撃破数が並び、クリックで新しいランが始まる |
| 再現性 | ページを再読み込みすると深度 1 の間取りが変わる（暗記ゲーになっていない） |
| フレームレート | 深度 15 前後（敵 90 体台）でもカクつかない |

- [ ] **Step 2: docs/gameplay.md を書く**

`docs/gameplay.md` を新規作成する。**書くのはコードから読み取れないことだけ** — モジュール間の契約、不変条件、数値パラメータの意図、採用しなかった代替案とその理由。関数一覧や処理の逐次説明は書かない（AGENTS.md）。

含めること:

- **中核ルール**: ゲージが尽きる前に次の喫煙所を見つけられるか、という一つの問いにゲーム全体が収束すること
- **ニコチンゲージ**: 段階の境界（100〜61 / 60〜31 / 30〜1 / 0）と各段階の効果。「そわそわ」で視界を狭めるのに `push_light` の falloff を使っている理由（RGB を下げても霧と環境光が別に効いていて見える範囲が変わらない）
- **減少速度が √ である理由**: 線形だと恒久強化の実効倍率 2.143 と深度 20 で相殺し、全プレイヤーの壁が同じ帯に集中する。係数 0.19 は深度 1 で 100 秒 / 深度 11 で 62 秒を通る値
- **一服の規則**: 2.5 秒、無敵にしない、吸っている間ずっと連続回復、中断で進捗は 0 に戻るが喫煙所は消費しない（消費すると非常口が永久に開かず詰む）
- **一服中はニコチン減少が止まる**: 止めないと「1.5 秒吸えたら 60% 回復」が減少ぶんだけ目減りして成立しない（深度 1 で 58.5、深度 30 で 56.5）。要件を完全に満たす最も単純な形として、吸っている間だけ止める
- **一服中は速度もゼロにする**: 加速度を切るだけだと基底の `_update()` が慣性を積分し続けて約 4.7px 滑る。エンティティの重なり判定は 9px しかないので、接線方向に滑ると接触が外れて一服が勝手に中断する
- **リザルト表示中もループは回り続ける**: `game_running` で止めるのはニコチン減少と継続ダメージだけ。元の実装がエンディング後も同じように回していたのを維持している。止めると 0.3 に落とした背景から敵と自機が消えて演出が変わる
- **ダミーの位置づけ**: 回復手段ではなく歩いた時間の損。5% は深度 21 で 2.3 秒ぶんしかない
- **生成器の契約**: `level-generator.ts` は `renderer` / `dom` / `audio` を import しない。理由は Node 環境で 1000 シード検証をモックなしに回すため
- **タイル値の意味と壁 pass**: タイル 0 は `_collides()` が通行可能とみなすので、床に隣接する非床は必ず壁にしなければならない。ただし非床を全部壁にすると頂点バッファ（65536 verts、床 6 / 壁 24）が溢れるので輪郭 1 タイルだけにする
- **距離の定義**: 部屋の選定はすべて開始部屋中心からの BFS タイル距離。添字順やユークリッド距離を混ぜないこと
- **シード方針**: 実行時はラン開始時に引く、テストは注入する
- **敵の総数式**: 床タイルごとの確率抽選をやめた理由（深度 8 で当選率 100%、深度 9 以降で非単調）。上限があることは O(n²) の衝突判定の要件でもある
- **ラン状態が `state.ts` にある理由**: 複数モジュールから読み書きされ、`game.ts` に置くと循環に値が乗る
- **HUD が DOM である理由**: `push_sprite` はクアッドが 6×6 固定で、画面下部に置くと遠くなって読めない大きさになる。直すには `renderer.ts` を触ることになる
- **含めていないもの**: 装備システム、ボス戦、難易度選択、セーブスロット、実績

- [ ] **Step 3: docs/architecture.md を更新する**

次の箇所を現状に合わせる。**現在形で書く**。「〜に変更した」ではなく「〜である」（AGENTS.md）。

- 「モジュール構成」: `nicotine.ts` / `level-generator.ts` / `hud.ts` を追加。それぞれ「実行時 import を絞っている葉に近いモジュール」であること
- 「共有可変状態の規則」: `state` の中身の例を新しいフィールド（`depth`, `nicotine`, `smoking`, `exit_open`, `kills`, `run_seed`）に差し替え
- 「循環参照の不変条件」: 循環クラスタの構成モジュールから `entity-cpu` を外し、`entity-exit` / `entity-smoking-area` を加える。数（現在は 11）を数え直す。**同じ節の末尾にある「terminal → minimap → entity-cpu 経由でサブクラス宣言に到達して壊れる」という例（`docs/architecture.md:41`）も、現存するモジュール名に差し替える**
- 「アセットの読み込み」: レベル PNG が無くなり静的 import は `m/q2.png` だけであること。`load_image()` が存在しないこと
- 「ブラウザでの動作検証」: 手順はそのまま有効。変更不要

- [ ] **Step 4: README.md を更新する**

書き換えが必要な箇所（行番号は現時点の目安）:

| 箇所 | 内容 |
| --- | --- |
| 5 行目 概要 | 「システムを再起動して回る」→ ニコチン切れと戦いながら喫煙所を探して潜るローグライト |
| 55〜59 行目 遊び方 | CPU 端末の再起動 → 喫煙所での一服と非常口 |
| 82〜88 行目 ミニマップ凡例 | 明るい青／暗い青（CPU）→ オレンジ（喫煙所）／緑（開通済みの非常口） |
| 114 行目 攻略 | 端末の回収順 → ゲージ配分とダミーの見極め |
| 121〜128 行目 レベル定義 | PNG の色キー表 → 手続き生成の説明（部屋・通路・輪郭壁・BFS 距離での目標地点選定） |
| 153 行目 ファイル一覧 | `l1〜l3.png` を削除 |
| 168 行目 ビルド | 「画像 4 枚」→ `q2.png` 1 枚 |
| 187〜188 行目 日本語化 | `entity-cpu.ts` を削除し、`entity-smoking-area.ts` / `entity-exit.ts` を追加 |

ニコチンゲージ・段階効果・一服・深度スコアの説明を「遊び方」に加える。

- [ ] **Step 5: 計画ファイルを削除する**

設計の結論は `docs/gameplay.md` に蒸留済みなので、作業用ファイルは残さない（AGENTS.md）。

```bash
git rm docs/superpowers/plans/2026-08-19-nicotine-roguelite-core.md
```

- [ ] **Step 6: 最終確認**

```bash
npm run typecheck && npm test && npm run build
```

Expected: すべて成功

確定仕様（`docs/` 直下）と README だけを対象にする。`docs/superpowers/` は計画B が参照する設計書とレビューを残す場所で、そこには当然 CPU 端末や `l1.png` の記述が残っているため、`-r` で `docs/` を丸ごと舐めると必ずヒットする。

```bash
grep -n "CPU 端末\|再起動\|l1.png\|l2.png\|l3.png\|entity-cpu" README.md docs/*.md
```

Expected: 出力なし

- [ ] **Step 7: コミット**

```bash
git add -A docs README.md
git commit -m "docs: ニコチン・ローグライトの設計をドキュメントに反映する"
```

---

## 設計書のカバレッジ

| 設計書の節 | 実装するタスク |
| --- | --- |
| §1 コアループ | Task 6, 9 |
| §1 ニコチンゲージ（最大値・減少速度・実時間） | Task 1, 9 |
| §1 段階効果（通常 / そわそわ / 離脱症状 / 限界） | Task 1, 7, 9, 10 |
| §1 一服（2.5 秒・無敵なし・中断・完了効果） | Task 6 |
| §1 ダミー喫煙所 | Task 3（配置）, 6（挙動） |
| §1 ゲージの表示 | Task 5, 9 |
| §2 フロア生成 手順 1〜8 | Task 2, 3, 4 |
| §2 深度から整数を得ること | Task 3 |
| §2 副次的な簡素化（PNG 読み込みの消滅・同期化） | Task 9 |
| §2 ミニマップの色 | Task 10 |
| §3 通貨「ヤニ」 | **計画B** |
| §3 強化メニュー | **計画B** |
| §3 スコア（深度・撃破数の表示） | Task 8 |
| §3 ベスト深度の localStorage 保存 | **計画B** |
| §4 削除リスト | Task 9 |
| §4 新規ファイル | Task 2〜6（`meta.ts` は**計画B**） |
| §4 改修 | Task 7, 8, 9, 10 |
| §5 破綻ポイント（部屋数・非常口の同室） | Task 2, 3（localStorage は**計画B**） |
| §6 検証（1000 シード BFS・純粋関数のテスト） | Task 1〜4 |
| §6 体感の手動確認 | Task 11 |

## 設計書からの意図的な逸脱

| 設計書の記述 | 実際 | 理由 |
| --- | --- | --- |
| §4「`index.html` は変更不要」 | ゲージ用の `div#n` と CSS を追加する | `push_sprite` はクアッドが 6×6 固定で、画面下部に置くとスプライトが読めない大きさになる。直すには `renderer.ts` を触ることになり、§4 の「手を入れないもの」と矛盾する |
| §4「手を入れないもの: 各敵エンティティ」 | `entity-spider.ts` / `entity-sentry.ts` の `_kill()` に 1 行足す | 撃破数を数える場所が他にない（レビュー B-6 が指摘した矛盾） |
| §4 新規ファイル一覧 | `nicotine.ts` / `hud.ts` / `entity-exit.ts` を追加 | `nicotine.ts` はテスト可能性のため（レビュー D-1）、`entity-exit.ts` は焼き込んだレベル形状を書き換えられないため（レビュー A-4）、`hud.ts` は上記の理由 |
| §1「減少速度 `1.0 × (1 + (深度 - 1) × 0.06)`」 | `1 + 0.19 × √(深度 - 1)` | レビュー C-2。線形だと全強化と深度 20 で相殺してスコアアタックの幅が消える |
| §2 手順 8「既存ロジックを流用」 | 総数ベースの新しい式 | レビュー A-3。既存式は深度 8 で破綻する |
| §3「嗅覚」 | 全段をゲージ 30% 以下限定にする（計画B） | レビュー C-3。中核の問いを恒久的に無効化してしまうため |

## 計画B に持ち越すもの

- `source/meta.ts`（強化テーブル・localStorage の読み書き・使えないときのメモリ内フォールバック）
- 通貨「ヤニ」の 3 経路（敵ドロップ 50% / 床への散在 1〜3 / フロア到達ボーナス）と拾得エンティティ
- 恒久強化 5 種（肺活量 / ニコチン耐性 / 嗅覚 / 火力 / 予備の一本）とコスト表
- 「予備の一本」の `E` キー。`input.ts` の `keys` は押しっぱなしで 1 のままなので、エッジ検出が要る（`M` キーが `!ev.repeat` で特別扱いされているのと同じ問題）
- ターミナル風の強化メニュー UI とベスト深度の表示
- `nicotine_drain_rate(depth)` に `tolerance_level`、`shot_interval(stage)` に `firepower_level` を第 2 引数として足し、`meta.ts` の段数を渡す配線（計画A では引数そのものを持たない）
- `state.nicotine_max` を「肺活量」の段数から決める配線（計画A では `100` 固定）
