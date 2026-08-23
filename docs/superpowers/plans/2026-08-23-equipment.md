# 装備システム（押収品コンテナ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セントリー撃破で落ちる押収品コンテナから 3 系統 × 10 段の装備が出るようにし、刃物を持つと `Tab` で銃と持ち替えて近接攻撃ができるようにする。

**Architecture:** 数値モデルは実行時 import を持たない葉モジュール `equipment.ts` に集め、Node（Vitest）でモックなしにテストする。永続状態は `meta.gear` の整数 3 つだけ。効果は既存の恒久強化に**乗算せず加算**する。開封中はゲームを止め（このゲームで唯一のポーズ）、`game_tick` の 2 か所だけを触って実装する。

**Tech Stack:** TypeScript + Vite + Vitest。WebGL レンダラ（`renderer.ts`）とスプライトアトラス（`m/q2.png`、16×16 × 64 タイル）。UI は DOM オーバーレイ。

**Spec:** `docs/superpowers/specs/2026-08-23-equipment-design.md`

## Global Constraints

これらはすべてのタスクの要件に暗黙に含まれる。

- **後方互換性は維持しない。** 置き換えたら古い実装・パラメータ・分岐は消す（`AGENTS.md`）
- **最もシンプルな実装を選ぶ。** 呼び出し元が 1 箇所しかないものに抽象化レイヤーを作らない。使う予定のないオプションを増やさない（`AGENTS.md`）
- **Python は必ず `uv` 経由で実行する**（`uv run --with pillow python ...`）
- **`state.ts` は実行時 import を一切持たない**（型のみの import に限る）。破ると循環参照の起点になる
- **`entity.ts` は `entity_t` のサブクラスを宣言するモジュールに（推移的にも）到達してはならない**（`docs/architecture.md`「循環参照の不変条件」）
- **`_init()` に書けるのは基底クラス `entity_t` のフィールドのみ。** サブクラス固有の状態はフィールド初期化子で書くか、生成後に代入する（`useDefineForClassFields` が基底 constructor の後に `undefined` で潰す）
- **画像は静的 import しか使えない。** `'m/ui/gear-' + id + '.webp'` のような文字列連結は Vite が検出できず本番ビルドで 404 になる
- **ターミナルに流すテキストに `_` を書かない。** `_` 1 個が改行 10 個＝約 1 秒の間に置換される
- **浮動小数の等値比較を避ける。** `1.0 - 0.07 * 10` は `0.29999999999999993`、`0.03 * 10` は `0.30000000000000004` になる。テストは `toBeCloseTo` を使う
- 検証コマンドは `npm test`（Vitest）と `npm run typecheck`（`tsc --noEmit`）の 2 本
- **画像 31 枚は Task 5 の前提。** `m/ui/gear-{blade,sole,patch}-01..10.webp` と アトラス 42 が用意されていない状態で Task 5 に入らないこと。生成手順は作業用の `images.md`（リポジトリのルート）が持つ

---

### Task 1: `equipment.ts` — 装備の数値モデル

装備の全数値・品名・抽選・等級・ヤニ換算を 1 モジュールに集める。実行時 import を持たず、画像も DOM も知らない純関数だけを置く（`meta.ts` / `nicotine.ts` と同じ扱い）。

**Files:**
- Create: `source/equipment.ts`
- Test: `source/equipment.test.ts`

**Interfaces:**
- Consumes: なし（葉モジュール）
- Produces:
  - `gear_slots: readonly ['blade', 'sole', 'patch']` / `type gear_slot_t`
  - `gear_max_tier: 10`
  - `gear_name(slot: gear_slot_t, tier: number): string`
  - `gear_grade(tier: number): number`（0〜4）
  - `gear_grades: readonly { name: string, color: string }[]`
  - `gear_lights: [number, number, number][]`
  - `blade_reach(tier: number): number` / `blade_interval(tier: number): number` / `blade_arc(tier: number): number` / `blade_damage(tier: number): number`
  - `blade_oneshot_level(tier: number): number` と定数 `blade_oneshot_spider = 0` / `blade_oneshot_drone = 1` / `blade_oneshot_all = 2`
  - `sole_speed_bonus(tier: number): number` / `patch_drain_bonus(tier: number): number` / `drain_floor: 0.15`
  - `gear_roll_center(depth: number): number` / `gear_roll_tier(depth: number, roll: number): number` / `gear_roll_slot(roll: number): gear_slot_t`
  - `gear_scrap_value(tier: number): number`
  - `type gear_stat_t = { label: string, text: string, rank: number }` / `gear_stats(slot: gear_slot_t, tier: number): gear_stat_t[]`

- [ ] **Step 1: 失敗するテストを書く**

`source/equipment.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import {
  blade_arc, blade_damage, blade_interval, blade_oneshot_all, blade_oneshot_drone,
  blade_oneshot_level, blade_oneshot_spider, blade_reach, drain_floor, gear_grade,
  gear_grades, gear_lights, gear_max_tier, gear_name, gear_roll_center,
  gear_roll_slot, gear_roll_tier, gear_scrap_value, gear_slots, gear_stats,
  patch_drain_bonus, sole_speed_bonus,
} from './equipment'

describe('品目表', () => {
  it('3 系統それぞれに 10 段ぶんの品名がある', () => {
    for (const slot of gear_slots) {
      for (let tier = 1; tier <= gear_max_tier; tier++) {
        expect(gear_name(slot, tier)).toBeTruthy()
      }
    }
  })

  it('品名は系統の中で重複しない', () => {
    for (const slot of gear_slots) {
      const names = []
      for (let tier = 1; tier <= gear_max_tier; tier++) { names.push(gear_name(slot, tier)) }
      expect(new Set(names).size).toBe(gear_max_tier)
    }
  })
})

describe('等級', () => {
  it('10 段を 2 段ずつ 5 等級に丸める', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gear_grade))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('等級は 5 つで、予告灯の色も 5 つある', () => {
    expect(gear_grades.length).toBe(5)
    expect(gear_lights.length).toBe(5)
  })
})

describe('刃物', () => {
  // Lv1 の射程はエンティティ同士の重なり判定 9px とほぼ同じ（触れる距離でしか
  // 当たらない）、Lv10 はセントリーの停止距離 24 そのもの
  it('射程は 9.6 から 24 まで伸びる', () => {
    expect(blade_reach(1)).toBeCloseTo(9.6)
    expect(blade_reach(10)).toBeCloseTo(24)
  })

  it('振り間隔は 0.93 秒から 0.30 秒まで縮む', () => {
    expect(blade_interval(1)).toBeCloseTo(0.93)
    expect(blade_interval(10)).toBeCloseTo(0.3)
  })

  it('半角は ±22° から ±69° まで開く', () => {
    expect(blade_arc(1) * 180 / Math.PI).toBeCloseTo(22.3, 1)
    expect(blade_arc(10) * 180 / Math.PI).toBeCloseTo(68.8, 1)
  })

  // 全段を一撃必殺にするとレア度に載せる軸が残らないので、対象を段で広げる
  it('一撃必殺の対象は Lv5 と Lv9 で広がる', () => {
    expect([1, 4].map(blade_oneshot_level)).toEqual([blade_oneshot_spider, blade_oneshot_spider])
    expect([5, 8].map(blade_oneshot_level)).toEqual([blade_oneshot_drone, blade_oneshot_drone])
    expect([9, 10].map(blade_oneshot_level)).toEqual([blade_oneshot_all, blade_oneshot_all])
  })

  it('一撃にならない相手へのダメージは段そのもの', () => {
    expect(blade_damage(8)).toBe(8)
  })
})

describe('パッシブ', () => {
  // 素の足 128 + 25 = 153 が清掃ドローンの逃走終端速度 150 をちょうど超える
  it('ソール Lv10 は素の足だけで清掃ドローンを追い越させる', () => {
    expect(sole_speed_bonus(10)).toBeCloseTo(25)
    expect(128 + sole_speed_bonus(10)).toBeGreaterThan(150)
    expect(128 + sole_speed_bonus(8)).toBeLessThan(150)
  })

  it('パッチ Lv10 は減少速度を 0.30 引く', () => {
    expect(patch_drain_bonus(10)).toBeCloseTo(0.3)
  })

  it('減算後の下限を持つ', () => {
    expect(drain_floor).toBe(0.15)
  })
})

describe('抽選', () => {
  it('中心は深度で上がり、深度 30 で頭打ちになる', () => {
    expect(gear_roll_center(1)).toBeCloseTo(1.3)
    expect(gear_roll_center(20)).toBeCloseTo(7)
    expect(gear_roll_center(30)).toBeCloseTo(10)
    expect(gear_roll_center(100)).toBeCloseTo(10)
  })

  it('roll の両端が段の両端になる', () => {
    expect(gear_roll_tier(1, 0)).toBe(1)
    expect(gear_roll_tier(1, 0.999999)).toBe(10)
  })

  // どの深度でも全段に非ゼロの重みを残す（深度 1 で最上位が出うることが
  // 「潜る」動機の一部）
  it('深度 1 でも最上位が出る', () => {
    let seen = false
    for (let i = 0; i < 1000; i++) {
      if (gear_roll_tier(1, i / 1000) === 10) { seen = true }
    }
    expect(seen).toBe(true)
  })

  it('深いほど高い段が出やすい', () => {
    const count = (depth: number) => {
      let n = 0
      for (let i = 0; i < 1000; i++) { if (gear_roll_tier(depth, i / 1000) >= 8) { n++ } }
      return n
    }
    expect(count(30)).toBeGreaterThan(count(20))
    expect(count(20)).toBeGreaterThan(count(1))
  })

  it('系統は等確率で 3 つに割れる', () => {
    expect(gear_roll_slot(0)).toBe('blade')
    expect(gear_roll_slot(0.5)).toBe('sole')
    expect(gear_roll_slot(0.99)).toBe('patch')
    expect(gear_roll_slot(1)).toBe('patch') // 境界で配列外に出ない
  })
})

describe('ヤニ換算', () => {
  it('既存の強化価格曲線の二次項 5lv² そのもの', () => {
    expect([1, 5, 10].map(gear_scrap_value)).toEqual([5, 125, 500])
  })
})

describe('差分行', () => {
  it('刃物は 4 行、パッシブは 1 行', () => {
    expect(gear_stats('blade', 5).length).toBe(4)
    expect(gear_stats('sole', 5).length).toBe(1)
    expect(gear_stats('patch', 5).length).toBe(1)
  })

  // rank は「大きいほうが良い」で統一する。振り間隔だけ符号を反転させて
  // 揃えてあるので、比較側は符号の向きを知らなくてよい
  it('rank は段が上がると必ず上がる', () => {
    for (const slot of gear_slots) {
      const low = gear_stats(slot, 3)
      const high = gear_stats(slot, 9)
      for (let i = 0; i < low.length; i++) {
        expect(high[i].rank).toBeGreaterThan(low[i].rank)
      }
    }
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/equipment.test.ts`
Expected: FAIL — `Failed to resolve import "./equipment"`

- [ ] **Step 3: `source/equipment.ts` を実装する**

```ts
// 装備の数値モデル。押収品コンテナから出る 3 系統 × 10 段のテーブルと、
// 効果の式・抽選・ヤニ換算・等級への丸めを持つ。
//
// 実行時 import を一切持たない葉モジュールで、Node（Vitest）でモックなしに
// 評価できることがこのモジュールの条件（meta.ts / nicotine.ts と同じ扱い）。
// 画像も DOM も知らない — アイコンの静的 import は equip-screen.ts が持つ。

export const gear_slots = ['blade', 'sole', 'patch'] as const
export type gear_slot_t = (typeof gear_slots)[number]

export const gear_max_tier = 10

// 品名は闇サイトの怪しい通販文体（docs/story.md「全体のトーン」）。
// 笑いどころは大仰な商品名と実物のみすぼらしさのギャップにあり、名前が強く
// なるほど実物も本当に強くなる、という一貫性で成立させる。MK-II / FINAL DRAG
// のような疑似スペック・英字の商品名は日本語化しない（同じ規約）。
// 添字 0 が段 1。
const gear_names: Record<gear_slot_t, string[]> = {
  blade: [
    '錆びたカッター',
    '折れたヤニ落とし',
    '換気ダクト用スクレーパー',
    '業務用 灰かき棒〈研磨済〉',
    '【訳あり】禁制品解体ナイフ',
    '旧世紀製 葉巻カッター',
    '【業物】ヤニ落とし・改',
    '【業物】単分子ヤニ落とし MK-II',
    '【銘品】監視ロボ解体用 大鉈',
    '【銘品】FINAL DRAG',
  ],
  sole: [
    '片方だけの安全靴',
    '廃品回収業者のサンダル',
    '静音ソール〈中古〉',
    '配管工の作業靴',
    '【訳あり】巡回員用 高速ソール',
    '反重力インソール〈体験版〉',
    '【業物】密輸業者のブーツ',
    '【業物】慣性キャンセラ内蔵ソール',
    '【銘品】監視ロボ振り切り用 加速脚',
    '【銘品】ASH RUNNER',
  ],
  patch: [
    '期限切れのニコチンガム',
    '使いかけの禁煙パッチ（逆用）',
    '業務用ニコチンパッチ〈弱〉',
    '密造ニコチンパッチ',
    '【訳あり】徐放型パッチ〈治験品〉',
    '旧世紀製 ニコチン点滴パック',
    '【業物】経皮ニコチン供給器 MK-II',
    '【業物】皮下埋込式ニコチンリザーバ',
    '【銘品】血中濃度定常化ユニット',
    '【銘品】ETERNAL SMOKER',
  ],
}

export function gear_name(slot: gear_slot_t, tier: number): string {
  return gear_names[slot][tier - 1]
}

// 数値は 10 段のまま、見せ方だけを 5 等級に丸める。10 色は画面上で区別
// できない。色は death-screen.ts の強化行が既に使っているパレットから採り、
// 新しい色語彙を増やさない
export const gear_grades = [
  { name: '並品', color: '#8a8a8a' },
  { name: '上物', color: '#3af08a' },
  { name: '特上', color: '#3ac6f0' },
  { name: '業物', color: '#a86df0' },
  { name: '銘品', color: '#f0c93a' },
] as const

export function gear_grade(tier: number): number {
  return (tier - 1) >> 1
}

// 落下したコンテナの予告灯。gear_grades の色を push_light() の RGB に写す。
// 暗いフロアの向こうに金色の光が見えたら銘品、という 1 色で「取りに行く
// 価値があるか」の判断を作る
export const gear_lights: [number, number, number][] = [
  [0.54, 0.54, 0.54],
  [0.23, 0.94, 0.54],
  [0.23, 0.78, 0.94],
  [0.66, 0.43, 0.94],
  [0.94, 0.79, 0.23],
]

// --- 刃物 ---

// Lv1 の 9.6px はエンティティ同士の重なり判定 9px とほぼ同じで「触れる距離」
// でしか当たらない。Lv10 の 24px はセントリーの停止距離そのもので、詰めきった
// セントリーにちょうど届く上限になる（docs/enemies.md）
export function blade_reach(tier: number): number {
  return 8 + 1.6 * tier
}

export function blade_interval(tier: number): number {
  return 1 - 0.07 * tier
}

// 薙ぎの半角（ラジアン）。Lv1 ±22° 〜 Lv10 ±69°
export function blade_arc(tier: number): number {
  return 0.3 + 0.09 * tier
}

// 一撃必殺の解放段。全段を一撃にするとレア度に載せる軸が残らない
// （一撃必殺より強い撃破は存在しない）ので、対象のほうを段で広げる
export const blade_oneshot_spider = 0
export const blade_oneshot_drone = 1
export const blade_oneshot_all = 2

export function blade_oneshot_level(tier: number): number {
  if (tier >= 9) { return blade_oneshot_all }
  if (tier >= 5) { return blade_oneshot_drone }
  return blade_oneshot_spider
}

// 一撃にならない相手へのダメージ。自機のプラズマ 1 発 = 1 ダメージが基準なので、
// Lv8 の刃はセントリー（20 発）を 3 振りで落とす
export function blade_damage(tier: number): number {
  return tier
}

// --- パッシブ ---

// player_speed() の戻り値に加算する。素の足 128 + 25 = 153 が清掃ドローンの
// 逃走終端速度 150 をちょうど超えるので、脚力 Lv4 とは別の「ドローン狩り解禁」
// ルートになる（docs/meta-progression.md「強化テーブル」）
export function sole_speed_bonus(tier: number): number {
  return 2.5 * tier
}

// ニコチン減少速度から減算する。乗算にすると深いほど効きが増してインフレ
// するが、加算は深いほど相対効果が薄れて自己減衰する
export function patch_drain_bonus(tier: number): number {
  return 0.03 * tier
}

// 減算後の下限。深度 1 × 耐性 Lv10 × パッチ Lv10 で 0.30 なので現状は効かないが、
// 耐性側を将来触ったときに 0 を割ってゲージが減らなくなる（＝中核の問いが
// 消える）のを止める
export const drain_floor = 0.15

// --- 抽選 ---

// 段の中心。深度 30 で頭打ちにするのは、それ以上は到達者がほぼいない帯で
// 式を伸ばしても挙動の差が観測されないため
export function gear_roll_center(depth: number): number {
  return 1 + 9 * Math.min(depth, 30) / 30
}

// 中心のまわりに 1/(1+距離²) で重みを置く。裾がゼロにならないので、
// どの深度でも全段が出うる（深度 1 で最上位 0.6%）。段を深度でハードに切ると、
// 浅い層の宝箱が「開ける前から中身の幅が分かる」ものになる。
// roll は 0〜1。抽選の乱数は呼び出し側が渡す（テストのため）
export function gear_roll_tier(depth: number, roll: number): number {
  const center = gear_roll_center(depth)
  const weights: number[] = []
  let total = 0
  for (let tier = 1; tier <= gear_max_tier; tier++) {
    const d = tier - center
    const w = 1 / (1 + d * d)
    weights.push(w)
    total += w
  }
  let acc = 0
  for (let i = 0; i < gear_max_tier; i++) {
    acc += weights[i] / total
    if (roll < acc) { return i + 1 }
  }
  return gear_max_tier
}

export function gear_roll_slot(roll: number): gear_slot_t {
  const index = (roll * gear_slots.length) | 0
  return gear_slots[Math.min(index, gear_slots.length - 1)]
}

// 手元に残さなかったほうがヤニに化ける。既存の強化価格曲線
// 15 + 10lv + 5lv²（meta.ts）の二次項をそのまま使う。最上位 500 は
// 深度 17 の清掃ドローン 1 体ぶんで、収束後の宝箱が「ドローンよりは小さい
// 確実な収入」に落ち着く帯になる
export function gear_scrap_value(tier: number): number {
  return 5 * tier * tier
}

// --- 差分行 ---

// 開封ダイアログが現在の装備と並べて出す行。rank は「大きいほうが良い」で
// 統一してあり（振り間隔だけ符号を反転させてある）、比較する側は軸ごとの
// 向きを知らなくてよい
export interface gear_stat_t {
  label: string
  text: string
  rank: number
}

const blade_oneshot_texts = ['蜘蛛', '＋ドローン', '全部']

export function gear_stats(slot: gear_slot_t, tier: number): gear_stat_t[] {
  if (slot === 'blade') {
    const interval = blade_interval(tier)
    const arc = blade_arc(tier)
    const oneshot = blade_oneshot_level(tier)
    return [
      { label: '射程', text: blade_reach(tier).toFixed(1), rank: blade_reach(tier) },
      { label: '振り間隔', text: interval.toFixed(2) + ' 秒', rank: -interval },
      { label: '薙ぎ半角', text: '±' + Math.round(arc * 180 / Math.PI) + '°', rank: arc },
      { label: '一撃', text: blade_oneshot_texts[oneshot], rank: tier },
    ]
  }
  if (slot === 'sole') {
    const bonus = sole_speed_bonus(tier)
    return [{ label: '移動速度', text: '+' + bonus.toFixed(1), rank: bonus }]
  }
  const bonus = patch_drain_bonus(tier)
  return [{ label: 'ニコチン減少', text: '−' + bonus.toFixed(2) + ' /秒', rank: bonus }]
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run source/equipment.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 型チェックしてコミット**

```bash
npm run typecheck
git add source/equipment.ts source/equipment.test.ts
git commit -m "装備の数値モデルを equipment.ts に置く"
```

---

### Task 2: `meta.ts` — `meta.gear` の永続化

系統ごとに 1 つ・段が全順序という 2 条件から、永続インベントリの実体は整数 3 つで足りる。保存とクランプは既存の `meta.levels` と同じ形で書ける。

**Files:**
- Modify: `source/meta.ts`
- Test: `source/meta.test.ts`

**Interfaces:**
- Consumes: `gear_max_tier`, `gear_slots`, `type gear_slot_t`（Task 1）
- Produces: `meta.gear: Record<gear_slot_t, number>`（0 = 未所持、1〜10 = 所持している段）。`meta_save()` / `meta_load()` が既存の `yani` / `best_depth` / `levels` と同じ 1 オブジェクトに載せる

- [ ] **Step 1: 失敗するテストを書く**

`source/meta.test.ts` の末尾に追記。`meta_reset()`（ファイル冒頭のヘルパー）にも 1 行足す:

```ts
// meta_reset() の中、`for (const id of meta_upgrade_ids) { meta.levels[id] = 0 }` の直後に追加
  for (const slot of gear_slots) { meta.gear[slot] = 0 }
```

import 行に追加:

```ts
import { gear_max_tier, gear_slots } from './equipment'
```

テスト本体を末尾に追加:

```ts
describe('装備の持ち越し', () => {
  beforeEach(meta_reset)
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage })

  it('初期状態は 3 系統とも未所持', () => {
    for (const slot of gear_slots) { expect(meta.gear[slot]).toBe(0) }
  })

  it('保存して読み直すと段が戻る', () => {
    stub_storage()
    meta.gear.blade = 7
    meta.gear.patch = 3
    meta_save()
    meta_reset()
    meta_load()
    expect(meta.gear.blade).toBe(7)
    expect(meta.gear.sole).toBe(0)
    expect(meta.gear.patch).toBe(3)
  })

  it('範囲外の値は最大段に丸める', () => {
    const store = stub_storage()
    store.takagi_meta = JSON.stringify({ gear: { blade: 999, sole: -5, patch: 'x' } })
    meta_load()
    expect(meta.gear.blade).toBe(gear_max_tier)
    expect(meta.gear.sole).toBe(0)
    expect(meta.gear.patch).toBe(0)
  })

  it('gear を持たない古い保存データでも壊れない', () => {
    const store = stub_storage()
    store.takagi_meta = JSON.stringify({ yani: 40 })
    meta_load()
    expect(meta.yani).toBe(40)
    for (const slot of gear_slots) { expect(meta.gear[slot]).toBe(0) }
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/meta.test.ts`
Expected: FAIL — `meta.gear` が undefined

- [ ] **Step 3: `source/meta.ts` を実装する**

冒頭のコメント直後に import を追加（`meta.ts` の「実行時 import を一切持たない」は、同じく葉モジュールである `equipment.ts` 1 本に限って緩める。`hud-model.ts` が `nicotine.ts` だけを import しているのと同じ形で、Node でモックなしに評価できるという条件は保たれる）:

```ts
import { gear_max_tier, gear_slots } from './equipment'
import type { gear_slot_t } from './equipment'
```

`meta` オブジェクトに 1 行追加:

```ts
export const meta = {
  yani: 0,
  best_depth: 0,
  persistent: true,
  levels: { lung: 0, tolerance: 0, sniff: 0, leg: 0, power: 0, spare: 0 } as
    Record<meta_upgrade_id_t, number>,
  // 押収品コンテナで拾った装備。系統ごとに 1 つ・段が全順序なので、
  // 所持状態は「その系統で持っている段」の整数 1 つに還元できる（0 = 未所持）
  gear: { blade: 0, sole: 0, patch: 0 } as Record<gear_slot_t, number>,
}
```

`meta_load()` の `data` 型と読み込みループに追加:

```ts
    const data = JSON.parse(raw) as {
      yani?: unknown, best_depth?: unknown,
      levels?: Record<string, unknown>, gear?: Record<string, unknown>,
    }
    meta.yani = meta_clamp_int(data.yani)
    meta.best_depth = meta_clamp_int(data.best_depth)
    for (const id of meta_upgrade_ids) {
      meta.levels[id] = Math.min(meta_clamp_int(data.levels?.[id]), meta_max_level[id])
    }
    for (const slot of gear_slots) {
      meta.gear[slot] = Math.min(meta_clamp_int(data.gear?.[slot]), gear_max_tier)
    }
```

`meta_save()` に追加:

```ts
    localStorage.setItem(meta_storage_key, JSON.stringify({
      yani: meta.yani, best_depth: meta.best_depth,
      levels: meta.levels, gear: meta.gear,
    }))
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run source/meta.test.ts`
Expected: PASS（既存分を含め全件）

- [ ] **Step 5: 型チェックしてコミット**

```bash
npm run typecheck
git add source/meta.ts source/meta.test.ts
git commit -m "装備の所持段を meta に持ち越す"
```

---

### Task 3: ソールとパッチを効かせる

装備の効果を既存の恒久強化に**加算**で載せる。乗算にすると深いほど効きが増してインフレし、`docs/meta-progression.md` のバランス記述を全部書き直すことになる。

**Files:**
- Modify: `source/nicotine.ts`（`player_speed()` に加算引数、`swing_interval()` を追加）
- Modify: `source/entity-player.ts`（ソールを渡す）
- Modify: `source/game.ts`（パッチを引く）
- Test: `source/nicotine.test.ts`

**Interfaces:**
- Consumes: `sole_speed_bonus`, `patch_drain_bonus`, `drain_floor`（Task 1）、`meta.gear`（Task 2）
- Produces:
  - `player_speed(stage: number, speed_factor?: number, bonus?: number): number`（第 3 引数が装備の加算）
  - `swing_interval(stage: number, base: number): number`（離脱症状で 1.8 倍）

- [ ] **Step 1: 失敗するテストを書く**

`source/nicotine.test.ts` の import に `player_speed` と `swing_interval` を足したうえで、末尾に追加:

```ts
describe('装備の加算', () => {
  // 加算にするのは、乗算だと深いほど効きが増してインフレするため。
  // 加算は深いほど相対効果が薄れて自己減衰する
  it('ソールは係数の後に加算される', () => {
    expect(player_speed(nicotine_stage_normal, 1, 25)).toBeCloseTo(153)
    expect(player_speed(nicotine_stage_normal, 1.5625, 25)).toBeCloseTo(225)
  })

  it('ソールは離脱症状帯にも同じ量だけ効く', () => {
    expect(player_speed(nicotine_stage_withdrawal, 1, 25)).toBeCloseTo(121)
  })

  it('装備を持たないときは従来と同じ', () => {
    expect(player_speed(nicotine_stage_normal, 1)).toBe(128)
    expect(player_speed(nicotine_stage_withdrawal, 1)).toBe(96)
  })
})

describe('薙ぎの間隔', () => {
  // 離脱症状の手の震えは近接にも効く。火力強化（銃の強化）は掛からない
  it('離脱症状帯で 1.8 倍になる', () => {
    expect(swing_interval(nicotine_stage_normal, 0.5)).toBeCloseTo(0.5)
    expect(swing_interval(nicotine_stage_edgy, 0.5)).toBeCloseTo(0.5)
    expect(swing_interval(nicotine_stage_withdrawal, 0.5)).toBeCloseTo(0.9)
    expect(swing_interval(nicotine_stage_limit, 0.5)).toBeCloseTo(0.9)
  })
})
```

（`nicotine_stage_edgy` / `nicotine_stage_limit` が未 import なら import に足すこと。）

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/nicotine.test.ts`
Expected: FAIL — `swing_interval` が未定義、`player_speed` が第 3 引数を無視して 128 を返す

- [ ] **Step 3: 実装する**

`source/nicotine.ts` の `player_speed()` を差し替え、直後に `swing_interval()` を追加:

```ts
// 基礎 128（離脱症状で 96）× 移動速度係数（恒久強化、省略時 1）
// + 装備の加算（ソール、省略時 0）。
// 装備を乗算しないのは、乗算だと深いほど効きが増してインフレするため
// （docs/equipment.md「加算にする理由」）。定数加算は離脱症状帯にも同じ量だけ
// 効くので、弱っているときほど相対的に大きく助ける
export function player_speed(stage: number, speed_factor = 1, bonus = 0): number {
  return (stage >= nicotine_stage_withdrawal ? 96 : 128) * speed_factor + bonus
}

// 薙ぎの間隔。離脱症状の手の震えは近接にも効くが、火力強化（銃の強化）は
// 掛からない。base は刃物の段が決める（equipment.ts の blade_interval）
export function swing_interval(stage: number, base: number): number {
  return base * (stage >= nicotine_stage_withdrawal ? 1.8 : 1)
}
```

`source/entity-player.ts` の import を差し替え:

```ts
import { sole_speed_bonus } from './equipment'
import { meta, meta_power_factor, meta_speed_factor } from './meta'
```

`_update()` の `speed` の行を差し替え:

```ts
    const speed = smoking
      ? 0
      : player_speed(stage, meta_speed_factor(), sole_speed_bonus(meta.gear.sole))
```

`source/game.ts` の import に追加:

```ts
import { drain_floor, patch_drain_bonus } from './equipment'
```

`game_tick()` のニコチン減少ブロックを差し替え:

```ts
  if (state.game_running && !state.smoking && !state.dying) {
    // 装備（パッチ）は係数ではなく定数を引く。乗算だと深いほど効きが増して
    // インフレする（docs/equipment.md）。下限は、耐性側を将来触ったときに
    // 0 を割ってゲージが減らなくなるのを止めるための保険
    const drain = Math.max(
      drain_floor,
      nicotine_drain_rate(state.depth) * meta_drain_factor() -
        patch_drain_bonus(meta.gear.patch),
    )
    state.nicotine = Math.max(0, state.nicotine - drain * state.time_elapsed)
  }
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npm test`
Expected: PASS（`nicotine.test.ts` の新規分に加え、既存の `entity-player.test.ts` / `game.test.ts` も通ること。`meta.gear` が全部 0 なので加算は 0 で、従来の挙動は変わらない）

- [ ] **Step 5: 型チェックしてコミット**

```bash
npm run typecheck
git add source/nicotine.ts source/nicotine.test.ts source/entity-player.ts source/game.ts
git commit -m "ソールとパッチの効果を恒久強化に加算する"
```

---

### Task 4: ポーズ

装備の入れ替えだけはゲームを止める。判断に要る時間が操作の巧拙と無関係なため。このゲームで唯一のポーズになる。

**Files:**
- Modify: `source/state.ts`（`equipping`）
- Modify: `source/game.ts`（`game_tick` の 2 か所、`run_start()` のリセット）
- Test: `source/game.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `state.equipping: number`（1 の間、時間が進まずエンティティも更新されない。描画だけ回る）

- [ ] **Step 1: 失敗するテストを書く**

`source/game.test.ts` の末尾に追加:

```ts
describe('装備の入れ替え中はゲームが止まる', () => {
  beforeEach(() => {
    start_run()
    state.equipping = 0
  })

  it('ニコチンも生存時間も進まない', () => {
    const nicotine = state.nicotine
    const run_time = state.run_time
    state.equipping = 1
    advance(2)
    expect(state.nicotine).toBe(nicotine)
    expect(state.run_time).toBe(run_time)
    state.equipping = 0
    advance(2)
    expect(state.nicotine).toBeLessThan(nicotine)
  })

  it('エンティティが動かない', () => {
    const player = state.entity_player!
    player.vx = 100
    const x = player.x
    state.equipping = 1
    advance(1)
    expect(player.x).toBe(x)
  })

  // time_elapsed = 0 だけでは足りない。_last_shot -= 0 は負のままなので、
  // 押しっぱなしのスペースで毎フレーム弾が生成される
  it('止まっている間に弾が積み上がらない', () => {
    state.equipping = 1
    const before = state.entities.length
    advance(1)
    expect(state.entities.length).toBe(before)
  })

  it('降下予約が消化されない', () => {
    state.descend_timer = 0.5
    state.equipping = 1
    advance(2)
    expect(state.descend_timer).toBe(0.5)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/game.test.ts`
Expected: FAIL — `state.equipping` が存在せず、ニコチンも降下予約も進み続ける

- [ ] **Step 3: 実装する**

`source/state.ts` の `state` オブジェクトに追加（`smoking` の近く）:

```ts
  // 押収品コンテナの開封ダイアログ中は 1。ゲーム内で唯一のポーズで、
  // game_tick が time_elapsed を 0 にしてエンティティの更新と衝突判定を飛ばす
  // （equip-screen.ts が立てて下ろす）
  equipping: 0,
```

`source/game.ts` の `run_start()` に追加（`state.dying = 0` の近く）:

```ts
  state.equipping = 0
```

`game_tick()` の先頭の `time_elapsed` の行を差し替え:

```ts
  // 開封ダイアログ中は時間を止める。この 1 行で、ニコチン減少・生存時間・
  // 降下予約・死亡シーケンス・つぶやき・HUD の hold タイマーが個別のガード
  // なしにまとめて止まる（各所に !state.equipping を足すと同じ判定が
  // 6 か所以上に散る。死体の除外を 1 か所に集めているのと同じ理由）
  state.time_elapsed = state.equipping
    ? 0
    : Math.min((time_now - time_last) / 1000, 0.1)
```

エンティティのループを差し替え:

```ts
  for (let i = 0; i < entities.length; i++) {
    const e1 = entities[i]
    if (e1._dead) { continue }

    // 開封ダイアログ中は更新も衝突も飛ばし、描画だけ回す。time_elapsed = 0
    // だけでは足りない — _last_shot -= 0 は負のままなので、押しっぱなしの
    // スペースで毎フレーム弾が生成され、セントリーの発射カウンタも同じく
    // 負のままで弾が積み上がる
    if (!state.equipping) {
      e1._update()

      // check for collisions between entities - it's quadratic and nobody cares \o/
      for (let j = i + 1; j < entities.length; j++) {
        const e2 = entities[j]
        if (e1 === corpse || e2 === corpse) { continue }
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
    }

    e1._render()
  }
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 5: 型チェックしてコミット**

```bash
npm run typecheck
git add source/state.ts source/game.ts source/game.test.ts
git commit -m "装備の入れ替え中だけゲームを止める"
```

---

### Task 5: 開封ダイアログ

**前提: 画像 30 枚（`m/ui/gear-*.webp`）が用意済みであること。** 三幕（灰色の枠で解錠中のため → 等級色にフラッシュ → 品名とアイコン）で開封を見せる。

**Files:**
- Create: `source/equip-screen.ts`
- Create: `source/equip-screen.css`

**Interfaces:**
- Consumes: `gear_grade`, `gear_grades`, `gear_name`, `gear_scrap_value`, `gear_stats`, `type gear_slot_t`（Task 1）、`meta.gear`, `meta_save`（Task 2）、`state.equipping`（Task 4）
- Produces: `equip_screen_show(slot: gear_slot_t, tier: number): void` — 呼ぶと `state.equipping = 1` になり、決着したら 0 に戻る。装備を残せば `meta.gear[slot]` を書いて保存し、残さなかったほうを `state.yani_run` にヤニとして加える

- [ ] **Step 1: 画像が揃っていることを確認する**

Run:
```bash
ls m/ui/gear-blade-*.webp m/ui/gear-sole-*.webp m/ui/gear-patch-*.webp | wc -l
```
Expected: `30`

30 でなければここで止まる。`images.md` に従って画像を生成し、`uv run --with pillow python tools/webp.py` で WebP へ変換すること。

- [ ] **Step 2: `source/equip-screen.css` を作る**

```css
/* 押収品コンテナの開封ダイアログ。死亡画面（#ds）と違い、ゲームの絵を
   隠しきらない中央パネルにする — 背後ではフロアが止まったまま描かれ続けており、
   「どこで開けたか」が見えていることが、開ける場所を選んだ判断の答え合わせになる。
   寸法は死亡画面と同じく vw 単位で 16:9 前後を前提にしている */
#eq {
  position: fixed;
  inset: 0;
  display: none;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  color: #b9dcc4;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
  z-index: 12;
  user-select: none;
}
/* 枠の色は解錠が済むまで灰色のまま。等級はためている間ずっと伏せる */
#eq .eq-box {
  width: 34vw;
  padding: 1.4vw 1.6vw;
  border: 1px solid #8a8a8a;
  border-radius: 0.5vw;
  background: rgba(4, 10, 7, 0.94);
  text-align: center;
  transition: border-color 0.25s, box-shadow 0.25s;
}
#eq .eq-head { font-size: 1vw; letter-spacing: 0.2em; color: #7fe0a8; }
#eq .eq-wait { font-size: 1.6vw; padding: 2.4vw 0; letter-spacing: 0.1em; }
#eq .eq-wait b { animation: eqd 1s steps(4) infinite; }
@keyframes eqd { to { clip-path: inset(0 100% 0 0); } }
#eq .eq-grade { font-size: 1.1vw; font-weight: bold; letter-spacing: 0.3em; margin-top: 0.6vw; }
#eq .eq-item { animation: eqp 0.28s ease-out; }
@keyframes eqp { from { transform: scale(0.7); opacity: 0; } }
#eq .eq-item img { width: 8vw; height: 8vw; image-rendering: pixelated; }
#eq .eq-name { font-size: 1.5vw; font-weight: bold; }
#eq .eq-slot { font-size: 0.9vw; color: #6f9c80; }
#eq .eq-stats { margin: 1vw 0; display: grid; gap: 0.25vw; }
#eq .eq-stat {
  display: grid;
  grid-template-columns: 9vw 1fr 1.6vw 1fr;
  align-items: center;
  font-size: 1vw;
  border-bottom: 1px solid rgba(46, 107, 79, 0.35);
  padding: 0.2vw 0;
}
#eq .eq-stat span { text-align: left; color: #7fa892; }
#eq .eq-stat i { font-style: normal; color: #6f8a7a; text-align: right; }
#eq .eq-stat em { font-style: normal; color: #4f6f5c; }
#eq .eq-stat b { text-align: right; }
#eq .eq-stat b.up { color: #7fe0a8; }
#eq .eq-stat b.down { color: #e0705f; }
#eq .eq-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8vw; }
#eq .eq-choice {
  border: 1px solid #2e6b4f;
  border-radius: 0.3vw;
  padding: 0.5vw;
  background: rgba(6, 20, 12, 0.7);
}
#eq .eq-choice.on { border-color: #ffaa2b; background: rgba(60, 36, 4, 0.7); }
#eq .eq-choice b { display: block; font-size: 1.1vw; }
#eq .eq-choice i { font-style: normal; font-size: 0.85vw; color: #7fa892; }
#eq .eq-keys { margin-top: 0.8vw; font-size: 0.85vw; color: #6f9c80; }
@media (prefers-reduced-motion: reduce) {
  #eq .eq-item, #eq .eq-wait b { animation: none; }
}
```

- [ ] **Step 3: `source/equip-screen.ts` を作る**

```ts
import { audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_pickup } from './audio'
import {
  gear_grade, gear_grades, gear_name, gear_scrap_value, gear_stats,
} from './equipment'
import type { gear_slot_t } from './equipment'
import { meta, meta_save } from './meta'
import { camera } from './renderer'
import { state } from './state'
import './equip-screen.css'

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

// 押収品コンテナの開封ダイアログ。数値と品名は equipment.ts が持ち、ここは
// DOM だけを持つ（death-screen-model.ts / death-screen.ts と同じ分け方）。
//
// 画像は静的 import しか使えない。'../m/ui/gear-' + id + '.webp' のような
// 文字列連結は Vite が静的に検出できず、本番ビルドで 404 になる
// （docs/architecture.md）。だから 30 行を並べてテーブルに詰める。

const gear_icons: Record<gear_slot_t, string[]> = {
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

const slot_labels: Record<gear_slot_t, string> = {
  blade: '刃物', sole: 'ソール', patch: 'パッチ',
}

// 等級ごとの解錠のため（秒）。ためている間は等級を伏せるので、
// ための長さそのものが等級のヒントになり、待たされている間に期待が育つ
const grade_delay = [0.4, 0.7, 1.0, 1.3, 1.6]

let root: HTMLElement | null = null
let slot: gear_slot_t = 'blade'
let tier = 1
let revealed = false
let selected = 0 // 0 = 手元に残す、1 = 転売する
let reveal_id: ReturnType<typeof setTimeout> = 0

export function equip_screen_show(next_slot: gear_slot_t, next_tier: number): void {
  slot = next_slot
  tier = next_tier
  revealed = false
  // 既定は「良いほうを残す」に置く。上位互換の全順序なので既定が常に正解に
  // なるが、下位を敢えて選ぶ余地は残す（転売額は段で決まるため意味は無いが、
  // 選べないことを説明するほうが複雑になる）
  selected = tier > meta.gear[next_slot] ? 0 : 1
  state.equipping = 1

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
  if (keep) {
    meta.gear[slot] = tier
    meta_save()
  }
  // ヤニは state.yani_run に積む。meta.yani への合算は run_end() が行う
  if (scrapped > 0) { state.yani_run += gear_scrap_value(scrapped) }

  audio_play(audio_sfx_beep)
  state.equipping = 0
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

function render(): void {
  const grade = gear_grade(tier)
  const color = revealed ? gear_grades[grade].color : '#8a8a8a'
  const owned = meta.gear[slot]

  let html = '<div class="eq-box" style="border-color:' + color +
    ';box-shadow:0 0 2vw ' + color + '44">' +
    '<div class="eq-head">押収品コンテナ</div>'

  if (!revealed) {
    root!.innerHTML = html + '<div class="eq-wait">解錠中<b>...</b></div></div>'
    return
  }

  html += '<div class="eq-grade" style="color:' + color + '">' +
      gear_grades[grade].name + '</div>' +
    '<div class="eq-item">' +
      '<img src="' + gear_icons[slot][tier - 1] +
        '" alt="" style="filter:drop-shadow(0 0 0.8vw ' + color + ')">' +
      '<div class="eq-name" style="color:' + color + '">' +
        gear_name(slot, tier) + '</div>' +
      '<div class="eq-slot">' + slot_labels[slot] + '</div>' +
    '</div>' +
    '<div class="eq-stats">'

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
      '<div class="eq-choice' + (selected === 0 ? ' on' : '') + '">' +
        '<b>' + (owned > 0 ? '入れ替える' : '装備する') + '</b>' +
        '<i>' + (owned > 0 ? '旧品 → ヤニ ' + gear_scrap_value(owned) : '') + '</i>' +
      '</div>' +
      '<div class="eq-choice' + (selected === 1 ? ' on' : '') + '">' +
        '<b>転売する</b><i>ヤニ ' + gear_scrap_value(tier) + '</i>' +
      '</div>' +
    '</div>' +
    '<div class="eq-keys">[←→] 選ぶ　[Enter] 決定</div>' +
    '</div>'

  root!.innerHTML = html
}
```

- [ ] **Step 4: 型チェックとテストが通ることを確認する**

Run:
```bash
npm run typecheck && npm test
```
Expected: PASS。この時点で `equip-screen.ts` を import するモジュールはまだ無いので、既存テストへの影響もない。

- [ ] **Step 5: コミット**

```bash
git add source/equip-screen.ts source/equip-screen.css
git commit -m "押収品コンテナの開封ダイアログを三幕で見せる"
```

---

### Task 6: 押収品コンテナ

セントリー撃破で 30% 落ちる床エンティティ。中身は落ちた時点で確定し、`push_light()` の色が等級を予告する。

**Files:**
- Create: `source/entity-container.ts`
- Create: `source/entity-container.test.ts`
- Modify: `source/entity-sentry.ts`（ドロップ）
- Modify: `source/minimap.ts`（嗅覚 Lv5 の収入系に追加）
- Modify: `source/entity-init.test.ts` と `source/game.test.ts`（`./equip-screen` のモックを足す）
- Modify: `tools/atlas.py`（`TILE_RANGE`）
- Modify: `m/q2.png`（タイル 42 の焼き込み）

**Interfaces:**
- Consumes: `gear_grade`, `gear_lights`, `gear_roll_slot`, `gear_roll_tier`, `type gear_slot_t`（Task 1）、`equip_screen_show`（Task 5）
- Produces: `entity_container_t`（フィールド `_slot: gear_slot_t` と `_tier: number` を生成後に代入する）

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-container.test.ts` を新規作成:

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
vi.mock('./monologue', () => ({ monologue_death: () => {} }))
// 開封ダイアログは DOM と 30 枚の画像を持つ。ここでは「呼ばれたか」だけ見る
const opened: Array<[string, number]> = []
vi.mock('./equip-screen', () => ({
  equip_screen_show: (slot: string, tier: number) => { opened.push([slot, tier]) },
}))

import { entity_container_t } from './entity-container'
import { entity_player_t } from './entity-player'
import { level_data, state } from './state'

describe('押収品コンテナ', () => {
  let player: entity_player_t

  beforeEach(() => {
    opened.length = 0
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    state.equipping = 0
    state.dying = 0
    state.game_running = 1
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  afterEach(() => { vi.restoreAllMocks() })

  function drop(slot: 'blade' | 'sole' | 'patch', tier: number): entity_container_t {
    const c = new entity_container_t(64, 0, 64, 5, 42)
    c._slot = slot
    c._tier = tier
    return c
  }

  it('触れると開封ダイアログが開いて、箱は消える', () => {
    const c = drop('blade', 7)
    c._check(player)
    expect(opened).toEqual([['blade', 7]])
    expect(c._dead).toBe(true)
  })

  // コンテナは撃破位置に落ちるので、喫煙所やダミーの上に重なりうる
  it('一服中は開かない', () => {
    state.smoking = 1
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
    expect(c._dead).toBe(false)
  })

  it('リザルト表示中は開かない', () => {
    state.game_running = 0
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
  })

  it('開封中に二重で開かない', () => {
    state.equipping = 1
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
  })

  it('自機以外が触れても開かない', () => {
    const other = drop('patch', 2)
    const c = drop('blade', 1)
    c._check(other)
    expect(opened.length).toBe(0)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/entity-container.test.ts`
Expected: FAIL — `Failed to resolve import "./entity-container"`

- [ ] **Step 3: `source/entity-container.ts` を実装する**

```ts
import { audio_play, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { equip_screen_show } from './equip-screen'
import { gear_grade, gear_lights } from './equipment'
import type { gear_slot_t } from './equipment'
import { push_light } from './renderer'
import { state } from './state'

// 押収品コンテナ。セントリー（禁煙監視ロボ）が施設内で押収した禁制品を内蔵
// しており、撃破で 30% 落ちる。
//
// 床に落ちる walk-over にしてあるのは、開封で入るポーズのタイミングを
// プレイヤーに選ばせるため。深度 20 では 1 フロアに 3 個落ちるので、撃破の
// 瞬間に自動でダイアログが割り込む形だと戦闘が寸断される。
export class entity_container_t extends entity_t {
  // 中身は落下時に確定させる。代入は生成後に行う — _init() には基底クラスの
  // フィールドしか書けない（entity.ts）
  _slot: gear_slot_t = 'blade'
  _tier = 1

  override _check(other: entity_t): void {
    // smoking: コンテナは撃破位置に落ちるので、本物の喫煙所やダミーの上に
    // 重なりうる。game_running: 死体とリザルト表示中の除外（entity-yani.ts と
    // 同じ理由）。equipping: 同じフレームで 2 個踏んだときの二重開封
    if (
      state.game_running && !state.smoking && !state.equipping &&
      other instanceof entity_player_t
    ) {
      this._kill()
      audio_play(audio_sfx_pickup)
      equip_screen_show(this._slot, this._tier)
    }
  }

  override _render(): void {
    super._render()
    // 予告灯。中身は落ちた時点で確定しているので、等級色で先に見せる。
    // 暗いフロアの向こうに金色が見えたら銘品 — 「あれは取りに行く価値があるか」
    // がフロアを横断する判断になる（docs/gameplay.md「明滅は行き先を意味する」
    // と同じ、1 ビットで判断を作る形）
    const light = gear_lights[gear_grade(this._tier)]
    push_light(this.x, 3, this.z + 4, light[0], light[1], light[2], 0.12)
  }
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run source/entity-container.test.ts`
Expected: PASS（全 5 件）

- [ ] **Step 5: セントリーのドロップを足す**

`source/entity-sentry.ts` の import に追加:

```ts
import { entity_container_t } from './entity-container'
import { gear_roll_slot, gear_roll_tier } from './equipment'
```

`_kill()` の末尾（ヤニのドロップの直後）に追加:

```ts
    // 押収品コンテナ: 撃破ごとに 30%。ヤニ（50%）とは独立に抽選する。
    // セントリー限定にすると sentry_count(depth) がそのまま深度スケールに
    // なるので、専用の出現数テーブルを持たずに済む（docs/equipment.md）。
    // 抽選が Math.random() なのは、撃破がフロア生成（決定論的な手続き生成）の
    // 外の出来事だから
    if (Math.random() < 0.3) {
      const container = new entity_container_t(this.x, 0, this.z, 5, 42)
      container._slot = gear_roll_slot(Math.random())
      container._tier = gear_roll_tier(state.depth, Math.random())
    }
```

- [ ] **Step 6: 既存テストに `./equip-screen` のモックを足す**

`source/entity-init.test.ts` と `source/game.test.ts` は `entity-sentry.ts` に到達するようになったため、その先の `equip-screen.ts`（DOM と 30 枚の画像を持つ）に届く。両ファイルの `vi.mock` 群の末尾に同じ 1 行を足す:

```ts
vi.mock('./equip-screen', () => ({ equip_screen_show: () => {} }))
```

- [ ] **Step 7: ミニマップの収入系に足す**

`source/minimap.ts` の import に追加:

```ts
import { entity_container_t } from './entity-container'
```

`entity_drone_t` の分岐の直後に追加:

```ts
    // 押収品コンテナも収入系（機会）。生存系との見分けは明滅の有無が担うので、
    // ヤニ・ドローンと同じく明滅させない（docs/meta-progression.md
    // 「生存系と収入系は別の感覚である」）
    if (e instanceof entity_container_t) {
      if (loot) { minimap_set_pixel(index, 150, 230, 200) }
      continue
    }
```

- [ ] **Step 8: アトラスにタイル 42 を焼き込む**

`tools/atlas.py` の 3 か所を書き換える:

```python
"""m/q2.png のタイル 33〜42 に画像を焼き込む。

使い方: uv run --with pillow python tools/atlas.py <src_dir>
<src_dir> に 33.png .. 42.png を置く（任意サイズ、正方形推奨）。
左上 (0,0) のピクセル色を背景キーとみなし、近い色を透過にする。
"""
```

```python
TILE_RANGE = range(33, 43)
```

```python
        sys.exit(f'no source images (33.png..42.png) found in {src_dir}')
```

コンテナの画像を焼き込む:

```bash
mkdir -p /tmp/atlas-in && cp <container.png のパス> /tmp/atlas-in/42.png
uv run --with pillow python tools/atlas.py /tmp/atlas-in
```

Expected: `baked tiles [42] into .../m/q2.png`

- [ ] **Step 9: 全部走らせて通ることを確認する**

Run:
```bash
npm run typecheck && npm test
```
Expected: PASS（全件）

- [ ] **Step 10: コミット**

```bash
git add source/entity-container.ts source/entity-container.test.ts source/entity-sentry.ts source/minimap.ts source/entity-init.test.ts source/game.test.ts tools/atlas.py m/q2.png
git commit -m "セントリー撃破で押収品コンテナを 30% 落とす"
```

---

### Task 7: 近接攻撃と持ち替え

`Tab` で銃と刃物を持ち替え、スペースが薙ぎになる。

**Files:**
- Modify: `source/state.ts`（`melee_active`）
- Modify: `source/input.ts`（`Tab`）
- Modify: `source/game.ts`（`run_start()` のリセット）
- Modify: `source/entity-player.ts`（持ち替え・薙ぎ・軌跡クラス）
- Test: `source/entity-player.test.ts`

**Interfaces:**
- Consumes: `blade_arc`, `blade_damage`, `blade_interval`, `blade_oneshot_all`, `blade_oneshot_drone`, `blade_oneshot_level`, `blade_reach`（Task 1）、`meta.gear`（Task 2）、`swing_interval`（Task 3）
- Produces: `state.melee_active: number`（1 = 刃物を構えている）、`key_swap = 9`

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-player.test.ts` の末尾に追加（既存のモック群と `beforeEach` をそのまま使う。`meta` と `key_swap` / `keys` の import が無ければ足すこと）:

```ts
describe('近接攻撃と持ち替え', () => {
  beforeEach(() => {
    meta.gear.blade = 0
    state.melee_active = 0
    state.game_running = 1
    keys[key_swap] = 0
    keys[key_shoot] = 0
  })

  it('刃物を持っていないと Tab を押しても持ち替わらない', () => {
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  it('刃物を持っていれば Tab で持ち替わる', () => {
    meta.gear.blade = 1
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(1)
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  // リザルト表示中もエンティティのループは回り続ける。死亡画面は Tab を
  // 「地下へ戻る」に使うので、そちらへ横取りされないようにする
  it('リザルト表示中は持ち替えない', () => {
    meta.gear.blade = 5
    state.game_running = 0
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  it('刃物を構えているとスペースで弾が出ない', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    keys[key_shoot] = 1
    const before = state.entities.filter((e) => e instanceof entity_plasma_t).length
    player._update()
    expect(state.entities.filter((e) => e instanceof entity_plasma_t).length).toBe(before)
  })

  it('射程内の正面にいる蜘蛛は、最低段の刃物でも一撃で落ちる', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0 // +x 方向
    const spider = new entity_spider_t(player.x + 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(true)
  })

  it('射程の外の蜘蛛には届かない', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0
    const spider = new entity_spider_t(player.x + 40, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(false)
  })

  it('半角の外にいる蜘蛛には届かない', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0 // +x を向いているのに、相手は -x 側
    const spider = new entity_spider_t(player.x - 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(false)
  })

  // 全段を一撃必殺にするとレア度に載せる軸が残らないので、対象を段で広げる
  it('Lv8 の刃はセントリーを一撃では落とさず、段ぶんのダメージを与える', () => {
    meta.gear.blade = 8
    state.melee_active = 1
    player._angle = 0
    const sentry = new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(sentry._dead).toBe(false)
    expect(sentry.h).toBe(12) // 20 - 8
  })

  it('Lv9 の刃はセントリーも一撃で落とす', () => {
    meta.gear.blade = 9
    state.melee_active = 1
    player._angle = 0
    const sentry = new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(sentry._dead).toBe(true)
  })
})
```

（`entity_spider_t` / `entity_sentry_t` / `entity_plasma_t` / `meta` / `keys` / `key_swap` / `key_shoot` の import をファイル冒頭に足すこと。`entity-sentry` を import すると `equip-screen` に到達するので、このファイルにも `vi.mock('./equip-screen', () => ({ equip_screen_show: () => {} }))` を足す。）

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/entity-player.test.ts`
Expected: FAIL — `state.melee_active` と `key_swap` が未定義

- [ ] **Step 3: `state.ts` と `input.ts` を実装する**

`source/state.ts` の `state` に追加（`equipping` の隣）:

```ts
  // 1 = 刃物を構えている（0 = 銃）。Tab で切り替わるラン状態で、フロアを
  // 跨いでは保持し、run_start() が 0 に戻す
  melee_active: 0,
```

`source/input.ts` を書き換え:

```ts
export const keys: Record<number, number> =
  { 9: 0, 32: 0, 37: 0, 38: 0, 39: 0, 40: 0, 69: 0 }

export const key_up = 38
export const key_down = 40
export const key_left = 37
export const key_right = 39
export const key_shoot = 32
export const key_spare = 69
export const key_swap = 9
```

`input_init()` の `onkeydown` に、`key_spare` の分岐の直後（`set_key(ev, 1)` の前）へ追加:

```ts
    // Tab（持ち替え）: E と同じエッジ検出。preventDefault() は必須で、
    // 外すとブラウザ既定のフォーカス移動が走る
    if (ev.keyCode === key_swap) {
      if (!ev.repeat) { keys[key_swap] = 1 }
      ev.preventDefault()
      return
    }
```

`source/game.ts` の `run_start()` に追加（`state.equipping = 0` の隣）:

```ts
  state.melee_active = 0
```

- [ ] **Step 4: `entity-player.ts` を実装する**

import に追加:

```ts
import { entity_drone_t } from './entity-drone'
import { entity_sentry_t } from './entity-sentry'
import { entity_spider_t } from './entity-spider'
import {
  blade_arc, blade_damage, blade_interval, blade_oneshot_all, blade_oneshot_drone,
  blade_oneshot_level, blade_reach, sole_speed_bonus,
} from './equipment'
import { key_down, key_left, key_right, key_shoot, key_spare, key_swap, key_up, keys } from './input'
import {
  nicotine_stage, player_light_falloff, player_speed, shot_interval, shot_spread,
  swing_interval,
} from './nicotine'
```

`_update()` の中、予備の一本のブロックの直後に持ち替えを追加:

```ts
    // 持ち替え: Tab。刃物を 1 本も持っていないときは持ち替える先が無いので
    // 無視する。game_running を見るのは、リザルト表示中もエンティティの
    // ループが回り続けており（docs/gameplay.md）、死亡画面が Tab を
    // 「地下へ戻る」に使っているため
    if (keys[key_swap]) {
      keys[key_swap] = 0
      if (state.game_running && meta.gear.blade > 0) {
        state.melee_active = state.melee_active ? 0 : 1
        audio_play(audio_sfx_beep)
      }
    }
```

射撃のブロックを差し替え（`_last_shot` は薙ぎと共用する。同時には撃てないので専用のタイマーを増やさない）:

```ts
    if (!smoking && keys[key_shoot] && t._last_shot < 0) {
      if (state.melee_active) {
        audio_play(audio_sfx_hit)
        t._swing()
        t._last_shot = swing_interval(stage, blade_interval(meta.gear.blade))
      } else {
        audio_play(audio_sfx_shoot)
        // 元の実装の -0.11..+0.09 と同じ非対称さを保ったまま幅だけ広げる
        const spread = shot_spread(stage)
        new entity_plasma_t(
          t.x, 0, t.z, 0, 26,
          t._angle + Math.random() * spread - spread * 0.55,
        )
        t._last_shot = shot_interval(stage, meta_power_factor())
      }
    }
```

`_kill()` の前に `_swing()` を追加:

```ts
  // 薙ぎ。振るたびに敵を 1 周する。敵は最大 100 体で振り間隔は 0.3〜0.9 秒
  // あるので、O(n) の走査は問題にならない
  private _swing(): void {
    const t = this
    const tier = meta.gear.blade
    const reach = blade_reach(tier)
    const arc = blade_arc(tier)
    const oneshot = blade_oneshot_level(tier)

    for (const e of state.entities) {
      if (e._dead) { continue }
      const spider = e instanceof entity_spider_t
      const drone = e instanceof entity_drone_t
      const sentry = e instanceof entity_sentry_t
      if (!spider && !drone && !sentry) { continue }

      const dx = e.x - t.x
      const dz = e.z - t.z
      if (dx * dx + dz * dz > reach * reach) { continue }

      // 角度差を -π..π に畳んでから半角と比べる（生の引き算だと 2π を
      // またぐ位置で符号が反転して、真正面が範囲外になる）
      const raw = Math.atan2(dz, dx) - t._angle
      if (Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw))) > arc) { continue }

      const kills =
        spider ||
        (drone && oneshot >= blade_oneshot_drone) ||
        (sentry && oneshot >= blade_oneshot_all)
      // 一撃必殺に専用の即死経路を作らない。3 体すべてに実装が要るうえ、
      // _kill() の中のドロップ処理（ヤニ 50%、コンテナ 30%、カメラシェイク、
      // 爆発）を通らなくなる
      e._receive_damage(t, kills ? 999 : blade_damage(tier))
    }

    // 軌跡。弧の上に短命の白点を 3 つ置くだけで、スプライトを増やさない。
    // 半角が広いほど点が離れるので、刃のレア度が絵でも読める
    for (let i = -1; i <= 1; i++) {
      const a = t._angle + arc * i
      new entity_slash_t(
        t.x + Math.cos(a) * reach * 0.7, 0, t.z + Math.sin(a) * reach * 0.7, 0, 26,
      )
    }
  }
```

ファイル末尾に軌跡のクラスを追加（`entity-sentry.ts` が `entity_sentry_plasma_t` を同居させているのと同じ形。使うのは `entity-player.ts` だけなので export しない）:

```ts
// 薙ぎの軌跡。物理も衝突も持たない、光る白点だけの短命エンティティ
class entity_slash_t extends entity_t {
  private _lifetime = 0.12

  override _update(): void {
    this._lifetime -= state.time_elapsed
    if (this._lifetime < 0) { this._kill() }
  }

  override _render(): void {
    super._render()
    push_light(this.x, 4, this.z + 6, 1, 1, 1, 0.2)
  }
}
```

- [ ] **Step 5: テストを走らせて通ることを確認する**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 6: 型チェックしてコミット**

```bash
npm run typecheck
git add source/state.ts source/input.ts source/game.ts source/entity-player.ts source/entity-player.test.ts
git commit -m "Tab で刃物に持ち替えて薙げるようにする"
```

---

### Task 8: HUD の武器スロットと死亡画面の装備行

**Files:**
- Modify: `source/hud-model.ts` / `source/hud-model.test.ts`
- Modify: `source/hud.ts` / `source/hud.css`
- Modify: `source/death-screen.ts` / `source/death-screen.css`

**Interfaces:**
- Consumes: `gear_grade`, `gear_grades`, `gear_name`, `gear_slots`（Task 1）、`meta.gear`（Task 2）、`state.melee_active`（Task 7）
- Produces: `hud_weapon_visible(blade_tier: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`source/hud-model.test.ts` の末尾に追加:

```ts
describe('武器スロット', () => {
  // 刃物を持っていない間は持ち替える先が無い。表示されていること自体が
  // 「持ち替えられる」の合図になるので、ラベルを持たせずに済む
  it('刃物を持っていない間は出さない', () => {
    expect(hud_weapon_visible(0)).toBe(false)
    expect(hud_weapon_visible(1)).toBe(true)
  })
})
```

（import に `hud_weapon_visible` を足すこと。）

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run source/hud-model.test.ts`
Expected: FAIL — `hud_weapon_visible` が未定義

- [ ] **Step 3: `hud-model.ts` に追加する**

```ts
// 武器スロット。刃物を 1 本も持っていない間は出さない（持ち替える先が無い）。
// 構えている側がラン中に行動を変えられる値なので、常設の除外規約
// （所持ヤニ・撃破数などは出さない）には触れない
export function hud_weapon_visible(blade_tier: number): boolean {
  return blade_tier > 0
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/hud-model.test.ts`
Expected: PASS

- [ ] **Step 5: `hud.ts` に武器スロットを組み込む**

import に追加:

```ts
import {
  hp_reveal_idle, hp_reveal_step, hud_percent_visible, hud_spare_urgent,
  hud_weapon_visible,
} from './hud-model'
import { meta } from './meta'
```

`root.innerHTML` の `.meter-row` に 1 ブロック足す:

```ts
    '<div class="meter-row">' +
      '<div class="hp"></div>' +
      '<div class="spare"></div>' +
      '<div class="weapon"><i class="w-gun">銃</i><i class="w-blade">刃</i><b>Tab</b></div>' +
    '</div>' +
```

`pick()` の並びに追加:

```ts
const weapon_row = pick('.weapon')
const w_gun = pick('.w-gun')
const w_blade = pick('.w-blade')
```

`hud_update()` の、予備の一本のブロックの直後に追加:

```ts
  const weapon = hud_weapon_visible(meta.gear.blade)
  set_style(weapon_row, 'display', weapon ? 'flex' : 'none')
  if (weapon) {
    set_class(w_gun, 'w-gun' + (state.melee_active ? '' : ' on'))
    set_class(w_blade, 'w-blade' + (state.melee_active ? ' on' : ''))
  }
```

`meter_row` の畳み条件に `weapon` を足す:

```ts
  // 3 つとも消えたら行を畳む。左上がタバコ 1 本だけの状態に戻る
  set_style(
    meter_row, 'display',
    hp_reveal.visible || spares > 0 || weapon ? 'flex' : 'none',
  )
```

- [ ] **Step 6: `hud.css` に武器スロットのスタイルを足す**

ファイル末尾に追加:

```css
/* 武器スロット。予備の一本の行（.spare）と同じ組みにして、
   キーキャップの位置も揃える */
#hud .weapon { display: none; align-items: center; gap: 0.3vw; }
#hud .weapon i {
  font-style: normal;
  font-size: 0.85vw;
  line-height: 1;
  padding: 0.2vw 0.35vw;
  border: 1px solid #4a4a4a;
  border-radius: 0.2vw;
  color: #6a6a6a;
}
#hud .weapon i.on { border-color: #e90; color: #ffc; text-shadow: 0 0 6px #f70; }
#hud .weapon b {
  font-size: 0.7vw;
  padding: 0.15vw 0.3vw;
  border: 1px solid #4a4a4a;
  border-radius: 0.2vw;
  color: #8a8a8a;
}
```

- [ ] **Step 7: 死亡画面に装備パネルを足す**

`source/death-screen.ts` の import に追加:

```ts
import { gear_grade, gear_grades, gear_name, gear_slots } from './equipment'
import type { gear_slot_t } from './equipment'
```

`record_row()` の近くにヘルパーを追加:

```ts
const gear_slot_labels: Record<gear_slot_t, string> = {
  blade: '刃物', sole: 'ソール', patch: 'パッチ',
}

function gear_row(slot: gear_slot_t): string {
  const tier = meta.gear[slot]
  if (tier === 0) {
    return '<div class="ds-record-row">' + gear_slot_labels[slot] +
      '<b class="ds-gear-none">未所持</b></div>'
  }
  return '<div class="ds-record-row">' + gear_slot_labels[slot] +
    '<b style="color:' + gear_grades[gear_grade(tier)].color + '">' +
    gear_name(slot, tier) + '</b></div>'
}
```

`render()` の中、`if (dead) { ... }` ブロックの**閉じ括弧の直後**（`left += '</div>'` の直前）に追加:

```ts
  // 装備は死んでも持ち越すので、購入動線（右列）ではなく振り返り側に出す。
  // 1 つも持っていないときは出さない（初回起動で「未所持 ×3」を並べても
  // 読むものが無い）
  if (gear_slots.some((slot) => meta.gear[slot] > 0)) {
    left += '<div class="ds-panel ds-gear">' +
      '<div class="ds-panel-title">装備</div>' +
      gear_slots.map(gear_row).join('') +
      '</div>'
  }
```

`source/death-screen.css` に追加（`.ds-record` の定義の近く）:

```css
/* position: relative は .ds-record と同じ理由（絶対配置の .ds-hero の下に
   隠れないようにする重ね順の土台） */
#ds .ds-gear { width: 45%; position: relative; }
#ds .ds-gear-none { color: #5d7a68; }
```

- [ ] **Step 8: 全部走らせて通ることを確認する**

Run:
```bash
npm run typecheck && npm test
```
Expected: PASS（全件）

- [ ] **Step 9: 手で見て確かめる**

Run: `npm run dev`

確認すること:
1. 刃物を持っていない状態で HUD の左下に武器スロットが**出ていない**
2. セントリーを何体か倒すとコンテナが落ち、等級ごとに光の色が違う
3. コンテナを踏むとゲームが止まり、灰色の枠で「解錠中...」→ 等級色にフラッシュ→ 品名とアイコン
4. 入れ替えると HUD に `銃／刃 Tab` が出て、`Tab` で点灯が入れ替わる
5. 刃を構えてスペースを押すと弾が出ず、目の前の蜘蛛が一撃で消える
6. 死んで死亡画面の左列に「装備」パネルが出る

- [ ] **Step 10: コミット**

```bash
git add source/hud-model.ts source/hud-model.test.ts source/hud.ts source/hud.css source/death-screen.ts source/death-screen.css
git commit -m "HUD に武器スロット、死亡画面に装備の行を出す"
```

---

### Task 9: ドキュメント

`AGENTS.md` の規約により、docs/ はコードの現状と常に一致させる。日付や経緯は書かず現在形で、コードから読み取れないことだけを書く。

**Files:**
- Create: `docs/equipment.md`
- Modify: `docs/gameplay.md` / `docs/meta-progression.md` / `docs/enemies.md` / `docs/story.md` / `docs/architecture.md` / `README.md`
- Delete: `docs/superpowers/specs/2026-08-23-equipment-design.md` / `docs/superpowers/plans/2026-08-23-equipment.md` / `images.md`

- [ ] **Step 1: `docs/equipment.md` を書く**

`docs/superpowers/specs/2026-08-23-equipment-design.md` から蒸留する。含めるもの: 「なぜスコープに入れるのか」「系統と枠」「加算にする理由」「効果の式」「射程の両端に意味がある」「ソールの上限に意味がある」「パッチの下限」「レア度の抽選」「収束と、下位・重複のヤニ化」「押収品コンテナ」「等級」「開封は三幕にする」「ポーズの実装」「近接攻撃」「HUD と死亡画面」「品目表」「スコープに含めないもの」。

**含めないもの**（`AGENTS.md`「作業用ドキュメント」の規約）: 実装手順、チェックボックス、移行前の状況説明、「更新するドキュメント」の節、モジュール構成の節のうち「変更するもの」の一覧（import グラフが表すため）。

- [ ] **Step 2: `docs/gameplay.md` を直す**

1. 「中核ループ」の一文を差し替える。現在:
   > 装備・ボス戦・難易度選択を足さない（末尾を参照）のも、この一問から外れるため。

   差し替え後:
   > ボス戦・難易度選択を足さない（末尾を参照）のも、この一問から外れるため。装備（docs/equipment.md）だけは例外で、報酬を深度に結び付ける代わりに、喫煙所を見つける能力そのものには一切触れないという条件で入れてある。

2. 「スコープに含めていないもの」の先頭から `装備システム、` を削る。

3. 「操作」に持ち替えを足す。「射撃は `スペース`（…）」の直後へ:
   > 刃物を持っているときは `Tab` で銃と持ち替えられ、`スペース` が薙ぎになる（docs/equipment.md）。

4. 「リザルト表示中もゲームループは回り続ける」の後に節を 1 つ足す:

   ```markdown
   ## ポーズは装備の開封だけ

   `state.equipping` が立っている間だけ、`game_tick` が `time_elapsed` を 0 にしてエンティティの更新と衝突判定を飛ばす。これがゲーム内で唯一のポーズである。一服（2.5 秒）が世界を止めず無敵にもしないのに対し、装備の入れ替えを止めるのは、判断に要る時間が操作の巧拙と無関係なため。

   `time_elapsed = 0` だけでは足りない。`_last_shot -= 0` は負のままなので、押しっぱなしのスペースで毎フレーム弾が生成され、セントリーの発射カウンタも同じく負のままで弾が積み上がる。エンティティの更新そのものを飛ばす必要がある。

   逆に、この 2 か所だけで十分でもある。ニコチン減少・生存時間・降下予約・死亡シーケンス・つぶやき・HUD の hold タイマーはすべて `time_elapsed` を通るので、個別のガードを足さない（死体の除外を衝突ループ 1 か所に集めているのと同じ理由）。
   ```

5. 「HUD は安全なときに黙る」の表に 1 行足す:
   > | 武器スロット（`銃／刃` + `Tab`） | 刃物を 1 本以上持っているとき | （持ったら消えない） |

- [ ] **Step 3: `docs/meta-progression.md` を直す**

「強化テーブル」の節の末尾に段落を 1 つ足す:

```markdown
**装備（docs/equipment.md）はこの表に乗算せず、加算する。** ソールは `player_speed()` の戻り値に定数を足し、パッチは減少速度から定数を引く。乗算にすると深いほど効きが増してインフレし、上の「実効倍率 3.33 倍」「釣り合う深度 152」がどちらも成り立たなくなる。加算は逆に深いほど相対効果が薄れて自己減衰するので、この表の数字はそのまま正しいまま残る。`nicotine_drain_rate` の係数 0.19 も動かさない。
```

「保存」の節の冒頭を差し替える:

```markdown
localStorage に 1 オブジェクト（キー `takagi_meta`）。持ち越すのはヤニ残高・強化レベル・ベスト深度・装備（`meta.gear`）で、装備は系統ごとに 1 つ・段が全順序なので整数 3 つに還元できる。
```

- [ ] **Step 4: `docs/enemies.md` を直す**

1. 「3 体に共通する規約」の「撃破ドロップは一律 50% でヤニ 1 個」の項に 1 文足す:
   > セントリーだけは、これとは独立に 30% で押収品コンテナも落とす（docs/equipment.md）。体数 `sentry_count(depth)` がそのまま深度スケールになるので、装備の出現に専用のテーブルを持たずに済む。

2. 「足の速さは自機を挟んで分かれる」の項を直す。「**蜘蛛からは走って逃げられず、ドローンには走って追いつけない。**」の後に足す:
   > これは素の足の話である。脚力 Lv10（200/5 = 40px/s）は既に蜘蛛（32px/s）を上回っており、ソール（docs/equipment.md）はその差をさらに広げる。**基準になる並びが崩れるのは投資の結果であって、初期状態の設計ではない。**

3. 「セントリー」の節の末尾に 1 文足す:
   > 刃物 Lv9 以上（docs/equipment.md）は硬さを無視して一撃で落とす。射程 22.4px は停止距離 24 の内側なので、20 発ぶんの被弾リスクを踏んで詰めきることが条件になる。

- [ ] **Step 5: `docs/story.md` を直す**

「ゲーム進行との対応」の表に 2 行足す:

```markdown
| 押収品コンテナ | セントリーが施設内で押収した禁制品の封入容器 |
| 装備 | 闇サイトで流通する怪しい通販商品と、押収された禁制品 |
```

「恒久強化のフレーバー」の表の後に段落を 1 つ足す:

```markdown
装備（docs/equipment.md）の品名も同じ闇サイトの文体で書く。笑いどころは**大仰な商品名と実物のみすぼらしさのギャップ**にあり、名前が強くなるほど実物も本当に強くなる、という一貫性で成立させる。`MK-II` / `FINAL DRAG` のような疑似スペックと英字の商品名を日本語化しないのは、上の「固有名詞と疑似スペックは日本語化しない」と同じ規約である。
```

- [ ] **Step 6: `docs/architecture.md` を直す**

1. 「モジュール構成」の一覧に 4 行足す（アルファベット順ではなく既存の並びの流儀に合わせ、関連するモジュールの近くに置く）:

```markdown
- `equipment.ts` — 装備の数値モデル（品名・効果の式・抽選・等級・ヤニ換算）。実行時 import を一切持たない葉モジュールで、画像も DOM も知らない
- `equip-screen.ts` — 押収品コンテナの開封ダイアログ。アイコン 30 枚の静的 import はここが持つ。スタイルは `equip-screen.css`
- `entity-container.ts` — 押収品コンテナ
```

2. `meta.ts` の行を直す。現在の「実行時 import を一切持たず、Node でモックなしに評価できる」を:
   > `meta.ts` — ラン間で持ち越す恒久状態と強化テーブル、拾った装備の段。実行時 import は `equipment.ts`（同じく葉モジュール）のみで、Node でモックなしに評価できる

3. 「アトラスの焼き込み」の節を直す。「喫煙所まわりのタイル（アトラス 33〜38）」を「喫煙所まわりのタイル（33〜38）と押収品コンテナ（42）」に、`TILE_RANGE` の説明を 33〜42 に合わせる。

4. 「画像の形式」の枚数を数え直す（`m/ui/` に 30 枚増えるので「15 枚」→「45 枚」）。

5. 「循環参照の不変条件」のクラスタ一覧に `entity-container` を足す。

- [ ] **Step 7: `README.md` のキー割り当てに `Tab` を足す**

Run: `grep -n "スペース\|キー割り当て\|操作" README.md` で表の位置を特定し、`E`（予備の一本）の行の隣に `Tab`（武器の持ち替え）を足す。

- [ ] **Step 8: 作業用ドキュメントを消す**

作業が完了したので、設計書・計画・画像プロンプトを消す（`AGENTS.md`「docs/superpowers/」）。

```bash
rm docs/superpowers/specs/2026-08-23-equipment-design.md
rm docs/superpowers/plans/2026-08-23-equipment.md
rm images.md
```

- [ ] **Step 9: 最終確認**

```bash
npm run typecheck && npm test && npm run build
```
Expected: すべて成功。`npm run build` は画像 30 枚が `dist/assets/` に出ることの確認も兼ねる（静的 import が効いていないと `dist` に出ない）。

Run: `ls dist/assets/ | grep -c gear-`
Expected: `30`

- [ ] **Step 10: コミット**

```bash
git add docs/ README.md
git commit -m "装備システムの設計を docs/equipment.md に集約する"
```

---

## セルフレビュー結果

**仕様の網羅:** 設計書の全節をタスクに割り当て済み。「なぜスコープに入れるのか」「加算にする理由」「射程／ソール上限／パッチ下限の意味」「等級」「三幕」「収束とヤニ化」「ポーズの 3 案比較」は docs/equipment.md（Task 9 Step 1）が受ける。

**型の一貫性:** `gear_slot_t` / `gear_stat_t` の名前、`blade_oneshot_spider|drone|all` の定数名、`equip_screen_show(slot, tier)` の引数順、`meta.gear` のキー名（`blade` / `sole` / `patch`）を全タスクで統一済み。`player_speed()` の第 3 引数と `swing_interval(stage, base)` の引数順も Task 3 の定義と Task 7 の呼び出しで一致。

**留意点 2 つ**（実装者向け）:

1. **音は既存の SFX を流用し、新しい音色（sonantx のインストゥルメント定義）を足さない。** 薙ぎ = `audio_sfx_hit`、解錠 = `audio_sfx_door`、開封の当たり = `audio_sfx_pickup`、持ち替えと決定 = `audio_sfx_beep`。防災扉の駆動音がコンテナの封印解除に流用できるのは偶然ではなく、どちらも「施設の機構が開く音」である。耳で聞いて足りなければ後から `sound-effects.ts` に足せばよく、最初から足す理由はない。

2. **`entity-sentry.ts` が `equip-screen.ts` に到達するようになる**（`entity-container.ts` 経由）。`equip-screen.ts` は DOM と 30 枚の画像を持つので、`entity-sentry` に到達するテストは `vi.mock('./equip-screen', ...)` が要る。対象は `entity-init.test.ts` / `game.test.ts` / `entity-player.test.ts` の 3 本（Task 6 Step 6 と Task 7 Step 1）。
