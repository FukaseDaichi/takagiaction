# 死亡画面（リザルト＋闇サイト統合）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 死亡時のテキストリザルト＋テキスト闇サイトメニューを、見本 `m/result.png` を再現した 1 枚の全画面 DOM UI に置き換える。

**Architecture:** 純関数の表示モデル（`death-screen-model.ts`）と DOM 構築（`death-screen.ts` + `death-screen.css`）を分離。強化テーブルは `meta.ts` を 10 段化して再設計。画像アセットは Codex CLI で `m/ui/` に生成。`menu.ts` と `terminal_show_result` は削除する（後方互換なし方針）。

**Tech Stack:** TypeScript + Vite（CSS import・画像 import は Vite が解決）、Vitest（Node 環境、DOM なし）、Codex CLI（画像生成）。

**設計書:** `docs/superpowers/specs/2026-08-21-death-screen-design.md`（見本画像 `m/result.png`）

## Global Constraints

- コードスタイル: snake_case 識別子、セミコロンなし、シングルクォート、2 スペースインデント、日本語コメント（既存コードに合わせる）
- コメントは「コードから読み取れない制約」だけを書く。変更経緯・自明な説明は書かない
- 後方互換なし: 置き換えたら旧コードは削除する。「一応残す」禁止
- 純関数モジュール（meta.ts / nicotine.ts / death-screen-model.ts / state.ts）は実行時 import を DOM 依存モジュールに向けない（Vitest が Node で評価するため）
- 検証コマンド: `npm run typecheck` と `npm test`（各タスクの最後に両方通すこと）
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: meta.ts の 10 段化と嗅覚の比率判定化

**Files:**
- Modify: `source/meta.ts`
- Modify: `source/meta.test.ts`
- Modify: `source/minimap.ts:50-61`（`meta_sniff_active` の呼び出し）
- Modify: `source/menu.ts:37-45`（嗅覚の describe。Task 5 で menu.ts ごと削除されるまでの暫定追随）

**Interfaces:**
- Produces: `meta_max_level = { lung: 10, tolerance: 10, sniff: 10, power: 10, spare: 5 }`、`meta_upgrade_cost(level: number): number`（15 + 10lv + 5lv²）、`meta_sniff_threshold(level: number): number`、`meta_sniff_active(ratio: number): boolean`（**引数が stage から比率に変わる**）、`meta_sniff_distance(): boolean`（Lv10 のみ true）。他 getter は署名不変で数値のみ変更

- [ ] **Step 1: meta.test.ts を新仕様に書き換える（失敗するテスト）**

既存の「強化テーブル」「強化の効果値」「嗅覚の発動条件」describe と「範囲外の値は最大レベルに丸める」テストを以下に置き換える。`nicotine_stage_*` の import は不要になるので削除する。

```ts
describe('強化テーブル', () => {
  beforeEach(meta_reset)

  it('コストは 15 + 10lv + 5lv²', () => {
    expect([0, 1, 2, 9].map(meta_upgrade_cost)).toEqual([15, 30, 55, 510])
  })

  it('購入で残高が減りレベルが上がる', () => {
    meta.yani = 20
    expect(meta_buy('lung')).toBe(true)
    expect(meta.yani).toBe(5)
    expect(meta.levels.lung).toBe(1)
  })

  it('残高不足なら購入できない', () => {
    meta.yani = 14
    expect(meta_buy('lung')).toBe(false)
    expect(meta.yani).toBe(14)
    expect(meta.levels.lung).toBe(0)
  })

  it('最大レベルでは購入できない', () => {
    meta.yani = 9999
    meta.levels.sniff = meta_max_level.sniff
    expect(meta_buy('sniff')).toBe(false)
    expect(meta.yani).toBe(9999)
  })

  it('全解放の合計コストは 8425', () => {
    let total = 0
    for (const id of meta_upgrade_ids) {
      for (let level = 0; level < meta_max_level[id]; level++) {
        total += meta_upgrade_cost(level)
      }
    }
    expect(total).toBe(8425)
  })
})

describe('強化の効果値', () => {
  beforeEach(meta_reset)

  it('肺活量: 最大ゲージは 100 + 10/段、全強化で 200', () => {
    expect(meta_nicotine_max()).toBe(100)
    meta.levels.lung = 10
    expect(meta_nicotine_max()).toBe(200)
  })

  it('耐性: 減少係数は 1 − 0.04/段、全強化で 0.60', () => {
    expect(meta_drain_factor()).toBeCloseTo(1, 6)
    meta.levels.tolerance = 10
    expect(meta_drain_factor()).toBeCloseTo(0.6, 6)
  })

  it('火力: 射撃間隔係数は 1 − 0.05/段、全強化で 0.50', () => {
    expect(meta_power_factor()).toBeCloseTo(1, 6)
    meta.levels.power = 10
    expect(meta_power_factor()).toBeCloseTo(0.5, 6)
  })

  it('予備の一本: 使用可能回数はレベルと同数', () => {
    expect(meta_spare_count()).toBe(0)
    meta.levels.spare = 5
    expect(meta_spare_count()).toBe(5)
  })
})

describe('嗅覚の発動条件', () => {
  beforeEach(meta_reset)

  it('未購入では発動しない', () => {
    expect(meta_sniff_active(0)).toBe(false)
  })

  it('1 段はゲージ 30% 以下で発動する', () => {
    meta.levels.sniff = 1
    expect(meta_sniff_active(0.31)).toBe(false)
    expect(meta_sniff_active(0.3)).toBe(true)
    expect(meta_sniff_active(0)).toBe(true)
  })

  it('しきい値は等間隔で上がり、10 段で 60% になる', () => {
    expect(meta_sniff_threshold(1)).toBeCloseTo(0.3, 6)
    expect(meta_sniff_threshold(10)).toBeCloseTo(0.6, 6)
    meta.levels.sniff = 10
    expect(meta_sniff_active(0.6)).toBe(true)
    expect(meta_sniff_active(0.61)).toBe(false)
  })

  it('距離表示は 10 段のみ', () => {
    meta.levels.sniff = 9
    expect(meta_sniff_distance()).toBe(false)
    meta.levels.sniff = 10
    expect(meta_sniff_distance()).toBe(true)
  })
})
```

import 行に `meta_sniff_threshold` を足す。「保存と読み込み」describe の「範囲外の値は最大レベルに丸める」は `meta_max_level.lung` を参照しているのでそのまま通る（変更不要）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- run source/meta.test.ts`
Expected: FAIL（コスト・最大レベル・しきい値のアサーションが旧値で落ちる。`meta_sniff_threshold` が存在せず import エラーになるのも可）

- [ ] **Step 3: meta.ts を書き換える**

冒頭の `nicotine` からの import 行を削除し、以下を変更する:

```ts
export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 10, tolerance: 10, sniff: 10, power: 10, spare: 5,
}
```

```ts
// コストは 15 + 10lv + 5lv²（15〜510）。10 段の項目は 2025、予備（5 段）は 325 で
// 全解放の合計は 8425。倍々（20 << lv）は 10 段だと最終段 10240 になり破綻する
export function meta_upgrade_cost(level: number): number {
  return 15 + 10 * level + 5 * level * level
}
```

```ts
export function meta_nicotine_max(): number {
  return 100 + 10 * meta.levels.lung
}

// 減少速度に掛ける係数。全強化 0.60 と最大ゲージ 2 倍の実効 3.33 倍が新しい上限
export function meta_drain_factor(): number {
  return 1 - 0.04 * meta.levels.tolerance
}

// shot_interval() に渡す火力係数。10 段で 0.50
export function meta_power_factor(): number {
  return 1 - 0.05 * meta.levels.power
}
```

嗅覚 2 関数を以下に置き換える（stage 判定 → 比率判定）:

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
export function meta_sniff_distance(): boolean {
  return meta.levels.sniff >= 10
}
```

- [ ] **Step 4: 呼び出し側を追随させる**

`source/minimap.ts` の `minimap_sniff(stage: number)` は stage を `meta_sniff_active(stage)` にしか使っていない。引数を削除して `minimap_sniff()` にし、判定を比率に変える:

```ts
function minimap_sniff(): void {
  // （既存コメントは維持）
  if (
    !state.game_running ||
    !meta_sniff_active(state.nicotine / state.nicotine_max)
  ) {
```

`minimap_update()` 内の呼び出し `minimap_sniff(stage)` も `minimap_sniff()` に直す。stage 変数が他で未使用になったら宣言ごと消す（typecheck が教えてくれる）。

`source/menu.ts` の嗅覚 describe（レベル 0〜3 の固定配列）は 10 段で範囲外になるので置き換える。import に `meta_sniff_threshold` と `meta_sniff_distance` を足す:

```ts
  {
    id: 'sniff', name: '嗅覚',
    describe: (lv) => lv === 0
      ? '未取得（ゲージ低下時に残り香の方向が分かるようになる）'
      : 'ゲージ' + Math.round(meta_sniff_threshold(lv) * 100) + '%以下で方向' +
        (meta_sniff_distance() ? '＋距離' : ''),
  },
```

- [ ] **Step 5: テストと型チェックを通す**

Run: `npm test -- run` と `npm run typecheck`
Expected: 全テスト PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add source/meta.ts source/meta.test.ts source/minimap.ts source/menu.ts
git commit -m "feat: 強化を 10 段化し、嗅覚をニコチン比率判定に変更する"
```

---

### Task 2: ラン統計の追加（生存時間・喫煙回数・ダミー踏み・死因）

**Files:**
- Modify: `source/state.ts`
- Modify: `source/game.ts`（`run_start` の初期化、`game_tick` の時間加算）
- Modify: `source/entity-smoking-area.ts`（`_complete` / `_take_dummy`）
- Modify: `source/entity-player.ts`（予備の一本、`_receive_withdrawal_damage`）
- Test: `source/entity-smoking-area.test.ts`、`source/entity-player.test.ts`

**Interfaces:**
- Produces: `state.run_time: number`（秒）、`state.smoke_count: number`、`state.dummy_count: number`、`state.death_cause: number`（0 = 敵、1 = ニコチン切れ）。Task 5 の `run_end()` がこれらを読む

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-smoking-area.test.ts` の `beforeEach` に `state.smoke_count = 0` と `state.dummy_count = 0` を追加し、describe 末尾にテストを足す:

```ts
  it('一服完了で喫煙回数が増える', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.smoke_count).toBe(1)
  })

  it('ダミーを踏むとダミー踏み数が増え、同じダミーは二重に数えない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(area, player, 0.5)
    tick(area, player, 0.5)
    expect(state.dummy_count).toBe(1)
    expect(state.smoke_count).toBe(0) // ダミーは一服に数えない
  })
```

`source/entity-player.test.ts` に死因のテストを足す（既存のモックヘッダと player 生成パターンをそのまま使い、既存 describe に追加。`state.death_cause = 0` を beforeEach か各テスト冒頭で初期化）:

```ts
  it('ニコチン切れの継続ダメージで死ぬと death_cause が立つ', () => {
    state.death_cause = 0
    player.h = 1
    player._receive_withdrawal_damage()
    expect(state.death_cause).toBe(1)
  })

  it('死なない離脱ダメージでは death_cause は立たない', () => {
    state.death_cause = 0
    player.h = 3
    player._receive_withdrawal_damage()
    expect(state.death_cause).toBe(0)
    expect(player.h).toBe(2)
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- run source/entity-smoking-area.test.ts source/entity-player.test.ts`
Expected: FAIL（`state.smoke_count` 等が undefined のため）

- [ ] **Step 3: 実装する**

`source/state.ts` の `yani_run` の下に追加:

```ts
  run_time: 0, // このランの経過秒数。game_tick が game_running 中のみ加算する
  smoke_count: 0, // 一服の回数。喫煙所での完了と予備の一本の使用で 1 ずつ増える
  dummy_count: 0, // 踏んだダミーの数。_take_dummy は _done ガードで同一個体 1 度しか走らない
  death_cause: 0, // 0 = 敵、1 = ニコチン切れ。_receive_withdrawal_damage が死亡時に立てる
```

`source/game.ts` の `run_start()` に初期化を追加（`state.yani_run = 0` の直後）:

```ts
  state.run_time = 0
  state.smoke_count = 0
  state.dummy_count = 0
  state.death_cause = 0
```

`game_tick()` の `time_last = time_now` の直後に追加:

```ts
  // リザルト表示中は生存時間に数えない
  if (state.game_running) { state.run_time += state.time_elapsed }
```

`source/entity-smoking-area.ts` の `_complete()` に `state.smoke_count++`、`_take_dummy()` に `state.dummy_count++` を追加（どちらも `this._done = true` の直後）。

`source/entity-player.ts` の予備の一本ブロック（`state.spares_left--` の後）に `state.smoke_count++` を追加。`_receive_withdrawal_damage()` を以下にする:

```ts
  _receive_withdrawal_damage(): void {
    audio_play(audio_sfx_hurt)
    this.h -= 1
    if (this.h <= 0) {
      // 死因の記録は _kill() より前。run_end() がこの値を死亡画面に渡す
      state.death_cause = 1
      this._kill()
    }
  }
```

- [ ] **Step 4: テストと型チェックを通す**

Run: `npm test -- run` と `npm run typecheck`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add source/state.ts source/game.ts source/entity-smoking-area.ts source/entity-player.ts source/entity-smoking-area.test.ts source/entity-player.test.ts
git commit -m "feat: ラン統計（生存時間・喫煙回数・ダミー踏み・死因）を記録する"
```

---

### Task 3: 死亡画面の表示モデル（純関数）

**Files:**
- Create: `source/death-screen-model.ts`
- Test: `source/death-screen-model.test.ts`

**Interfaces:**
- Consumes: `nicotine_stage(nicotine, nicotine_max)` と stage 定数（`source/nicotine.ts`）
- Produces: `run_result_t` インターフェース、`death_cause_nicotine = 1`、`format_run_time(seconds): string`、`death_message(cause): string[]`（2 行）、`condition_texts(ratio): { tremor: string, focus: string, craving_ratio: number }`。Task 5 の death-screen.ts と game.ts が使う

- [ ] **Step 1: 失敗するテストを書く**

`source/death-screen-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  condition_texts, death_cause_nicotine, death_message, format_run_time,
} from './death-screen-model'

describe('生存時間の表示', () => {
  it('mm:ss で秒は 2 桁にする', () => {
    expect(format_run_time(0)).toBe('0:00')
    expect(format_run_time(59.9)).toBe('0:59')
    expect(format_run_time(767)).toBe('12:47')
  })

  it('負値は 0:00 に丸める', () => {
    expect(format_run_time(-1)).toBe('0:00')
  })
})

describe('死因メッセージ', () => {
  it('ニコチン切れと敵で文言が変わる', () => {
    expect(death_message(death_cause_nicotine)[0]).toContain('ニコチン')
    expect(death_message(0)[0]).toContain('やられた')
  })
})

describe('死亡時の状態表示', () => {
  it('ゲージ 0% は 手の震え MAX・集中力 崩壊', () => {
    const c = condition_texts(0)
    expect(c.tremor).toBe('MAX')
    expect(c.focus).toBe('崩壊')
    expect(c.craving_ratio).toBe(1)
  })

  it('離脱症状帯（30% 以下）は 大・低下', () => {
    const c = condition_texts(0.2)
    expect(c.tremor).toBe('大')
    expect(c.focus).toBe('低下')
    expect(c.craving_ratio).toBeCloseTo(0.8, 6)
  })

  it('そわそわ帯（60% 以下）は 小・散漫', () => {
    expect(condition_texts(0.5).tremor).toBe('小')
    expect(condition_texts(0.5).focus).toBe('散漫')
  })

  it('通常帯は なし・正常', () => {
    expect(condition_texts(0.9).tremor).toBe('なし')
    expect(condition_texts(0.9).focus).toBe('正常')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- run source/death-screen-model.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`source/death-screen-model.ts`:

```ts
import { nicotine_stage } from './nicotine'

// 死亡画面の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（meta.ts / nicotine.ts と同じ扱い）。

export const death_cause_nicotine = 1

// run_end() が組み立てて death_screen_show() に渡す。state を直接読ませない
// のは、死亡画面の表示中に次のランが state を書き換えても表示が変わらないため
// 獲得ヤニの内訳は持たない。run_end() が先に meta.yani へ合算し、
// 画面には合算後の残高だけを出す（見本 m/result.png に内訳表示は無い）
export interface run_result_t {
  depth: number
  kills: number
  best_depth: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  nicotine_ratio: number // 死亡時の残量比 0..1
  hp: number // 死亡時の HP（0..5）
}

export function format_run_time(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

export function death_message(cause: number): string[] {
  return cause === death_cause_nicotine
    ? ['ニコチン、限界です。', 'しっかり整えて、また潜れ。']
    : ['やられたよ、高木。', '次はもっと慎重に。']
}

// 死亡時のニコチン段階から導出する体調表示。数値ゲージ（吸いたい気持ち）は
// 残量比の逆数で、段階より細かく動く
export function condition_texts(
  nicotine_ratio: number,
): { tremor: string, focus: string, craving_ratio: number } {
  const stage = nicotine_stage(nicotine_ratio, 1)
  const tremor = ['なし', '小', '大', 'MAX'][stage]
  const focus = ['正常', '散漫', '低下', '崩壊'][stage]
  return { tremor, focus, craving_ratio: 1 - nicotine_ratio }
}
```

- [ ] **Step 4: テストと型チェックを通す**

Run: `npm test -- run` と `npm run typecheck`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add source/death-screen-model.ts source/death-screen-model.test.ts
git commit -m "feat: 死亡画面の表示モデル（純関数）を追加する"
```

---

### Task 4: 画像アセットの生成（Codex → m/ui/）

**Files:**
- Create: `m/ui/hero.png`、`m/ui/body.png`、`m/ui/door.png`、`m/ui/icon-lung.png`、`m/ui/icon-brain.png`、`m/ui/icon-nose.png`、`m/ui/icon-bullet.png`、`m/ui/icon-cig.png`、`m/ui/icon-stat-depth.png`、`m/ui/icon-stat-time.png`、`m/ui/icon-stat-kills.png`、`m/ui/icon-stat-smoke.png`、`m/ui/icon-stat-dummy.png`、`m/ui/item-spare.png`

**Interfaces:**
- Produces: 上記 PNG ファイル。Task 5 の death-screen.ts が Vite の画像 import で読む（パス変更禁止）

- [ ] **Step 1: Codex CLI と画像生成の可否を確認**

Run: `codex --version`
Expected: バージョンが表示される。コマンドが無い、または以降のステップで Codex が画像を生成できないと分かった場合は、**このタスクを中断してユーザーに報告し、代替（他の生成手段）を相談する**。勝手にプレースホルダー画像で代替しない。

- [ ] **Step 2: Codex に画像を生成させる**

見本 `m/result.png` を入力画像として渡し、`m/ui/` に生成させる。1 回で全部頼まず、まずヒーロー 1 枚で品質を確認してから残りをまとめる。プロンプトの要点（そのまま使ってよい）:

ヒーロー（`m/ui/hero.png`、縦長 832×1216 程度）:
> 参照画像（m/result.png）の左中央のイラストと同じ構図・画風で 1 枚絵を生成: 暗い自室で椅子にぐったりともたれ、火のついた煙草をくわえた黒髪無精髭の日本人男性（ジャケットの肩に TAKAGI のワッペン）。傍らの机にノート PC があり、画面には赤い髑髏と「闇サイト [Y-EXCHANGE] 接続中...」の赤い文字。壁に「吸い殻は資産だ。」「ニコチンは自由。」の貼り紙。ダークサイバーパンク、緑がかった闇にオレンジの光、劇画調デジタルペイント。文字は日本語で正確に。

強化アイコン 5 種（各 256×256、ほぼ黒 #0b0f0c の背景、中央にネオン線画）:
> icon-lung.png = シアンに光る肺 / icon-brain.png = 紫に光る脳（頭部側面のシルエット内）/ icon-nose.png = 緑に光る鼻 / icon-bullet.png = オレンジに光る弾丸（斜め上向き）/ icon-cig.png = 黄色く光る煙草 1 本（火花付き）。いずれも太めのネオンアウトライン、グロー、背景は無地の暗色。

その他:
> body.png = 赤いワイヤーフレーム調の人体正面シルエット（全身、細線、黒背景、256×512）/ door.png = 緑に光る非常口の鉄扉が少し開いている（256×256）/ item-spare.png = くしゃっとした煙草の箱から 1 本覗く（暗色背景、256×256）/ icon-stat-*.png（各 128×128、アンバー #ffaa2b の細いネオン線画、黒背景）: depth = 下向き矢印と地層、time = ストップウォッチ、kills = 照準クロスヘア、smoke = 立ち上る煙の線、dummy = バツ印付きの灰皿。

- [ ] **Step 3: 生成結果を検証する**

Run: `Glob m/ui/*.png` で 14 ファイルの存在を確認し、Read ツールで各画像を目視確認（ヒーローの日本語文字の破綻、アイコンのモチーフ違いをチェック）。問題があれば該当ファイルだけ再生成する。

- [ ] **Step 4: コミット**

```bash
git add m/ui
git commit -m "feat: 死亡画面の画像アセットを追加する"
```

---

### Task 5: death-screen.ts / death-screen.css と配線、旧 UI の削除

**Files:**
- Create: `source/death-screen.ts`
- Create: `source/death-screen.css`
- Modify: `source/game.ts`（`run_end` の末尾）
- Modify: `source/main.ts`（イントロ後のメニュー呼び出し）
- Delete: `source/menu.ts`
- Modify: `source/terminal.ts`（`terminal_show_result` と `canvas` import を削除）

**Interfaces:**
- Consumes: Task 3 の `run_result_t` / `death_message` / `format_run_time` / `condition_texts`、Task 1 の meta getter 群、Task 4 の `m/ui/*.png`
- Produces: `death_screen_show(result: run_result_t | null, on_start: () => void): void`（null = 初回起動モード: 記録・状態パネルを隠し見出しを差し替える）

- [ ] **Step 1: death-screen.css を書く**

`source/death-screen.css`（見本 `m/result.png` の配色: 背景はほぼ黒の暗緑、アンバー #ffaa2b の見出し、緑 #2e6b4f の枠、赤 #ff3b30 の状態パネル）:

```css
/* 死亡画面（リザルト＋闇サイト）。index.html の 1 文字 id スタイルとは独立 */
#ds {
  position: fixed;
  inset: 0;
  display: none;
  grid-template-rows: 1fr auto auto;
  gap: 1vw;
  padding: 1.2vw 1.5vw;
  box-sizing: border-box;
  background:
    radial-gradient(120% 90% at 50% 0%, #101d14 0%, #070d09 60%, #050805 100%);
  color: #b9dcc4;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
  z-index: 10;
  user-select: none;
  overflow: auto;
}
#ds .ds-main { display: grid; grid-template-columns: 48fr 52fr; gap: 1.5vw; min-height: 0; }
#ds .ds-left { display: flex; flex-direction: column; gap: 0.8vw; min-height: 0; position: relative; }

#ds .ds-title {
  margin: 0;
  font-size: 3.4vw;
  font-weight: bold;
  color: #ffaa2b;
  text-shadow: 0 0 14px #f70;
  letter-spacing: 0.1em;
}
#ds .ds-sub { margin: 0; font-size: 1.1vw; color: #cfe8d8; }

#ds .ds-panel {
  border: 1px solid #2e6b4f;
  border-radius: 0.4vw;
  background: rgba(6, 20, 12, 0.85);
  box-shadow: inset 0 0 18px rgba(20, 80, 50, 0.25);
  padding: 0.8vw 1vw;
}
#ds .ds-panel-title { color: #7fe0a8; font-weight: bold; font-size: 1.15vw; margin-bottom: 0.5vw; }

#ds .ds-record { width: 60%; }
#ds .ds-record-row {
  display: flex; align-items: center; gap: 0.5vw;
  font-size: 1.15vw; padding: 0.28vw 0;
  border-bottom: 1px solid rgba(46, 107, 79, 0.4);
}
#ds .ds-record-row:last-child { border-bottom: none; }
#ds .ds-record-row img { width: 1.4vw; height: 1.4vw; }
#ds .ds-record-row b { margin-left: auto; font-size: 1.3vw; color: #eaf5ee; }

#ds .ds-hero {
  flex: 1;
  min-height: 0;
  border-radius: 0.4vw;
  background-position: center 20%;
  background-size: cover;
  image-rendering: auto;
}

/* 状態パネル（赤）。死亡モードのみ表示 */
#ds .ds-status {
  border: 1px solid #b3271e;
  border-radius: 0.4vw;
  background: rgba(30, 5, 3, 0.88);
  box-shadow: 0 0 16px rgba(255, 60, 40, 0.25), inset 0 0 20px rgba(255, 60, 40, 0.15);
  color: #ff6b5e;
  padding: 0.8vw 1vw;
  display: grid;
  grid-template-columns: 1.2fr auto 1.3fr;
  gap: 0.8vw;
  align-items: center;
}
#ds .ds-death-message { font-size: 1.25vw; font-weight: bold; line-height: 1.5; grid-column: 1 / -1; }
#ds .ds-status img { height: 7vw; }
#ds .ds-gauge-row { display: flex; align-items: center; gap: 0.6vw; font-size: 1vw; margin: 0.3vw 0; }
#ds .ds-gauge-row b { margin-left: auto; }
#ds .ds-blocks { display: flex; gap: 0.15vw; }
#ds .ds-blocks i {
  width: 0.8vw; height: 0.9vw;
  background: #ff3b30; box-shadow: 0 0 5px #f33;
}
#ds .ds-blocks i.off { background: #4a1310; box-shadow: none; }

#ds .ds-right { display: flex; flex-direction: column; gap: 0.7vw; min-height: 0; }
#ds .ds-yani {
  border: 1px solid #b3271e;
  border-radius: 0.4vw;
  background: rgba(25, 8, 4, 0.85);
  padding: 0.6vw 1vw;
}
#ds .ds-yani-amount { color: #ffaa2b; font-size: 1.9vw; font-weight: bold; text-shadow: 0 0 10px #f70; }
#ds .ds-yani-note { color: #e8c9a8; font-size: 0.95vw; margin-top: 0.2vw; }
#ds .ds-warning { color: #ff6b5e; font-size: 0.95vw; margin-top: 0.2vw; }
#ds .ds-upgrades-head { color: #ffaa2b; font-size: 1.3vw; font-weight: bold; }

#ds .ds-row {
  display: grid;
  grid-template-columns: 4vw 1fr auto;
  gap: 0.8vw;
  align-items: center;
  border: 1px solid #2e6b4f;
  border-radius: 0.4vw;
  background: rgba(8, 22, 14, 0.85);
  padding: 0.55vw 0.8vw;
}
#ds .ds-row.selected { border-color: #ffaa2b; box-shadow: 0 0 10px rgba(255, 170, 43, 0.5); }
#ds .ds-row img { width: 3.4vw; height: 3.4vw; }
#ds .ds-row-name { font-weight: bold; font-size: 1.2vw; }
#ds .ds-row-desc { font-size: 0.95vw; color: #9cc4aa; }
#ds .ds-row-level { font-size: 1vw; color: #eaf5ee; text-align: right; }
#ds .ds-pips { display: flex; gap: 0.25vw; margin-top: 0.3vw; justify-content: flex-end; }
#ds .ds-pips i { width: 0.7vw; height: 0.7vw; border-radius: 50%; background: #1c3a2a; }
#ds .ds-pips i.on { box-shadow: 0 0 5px currentColor; background: currentColor; }
#ds .ds-buy {
  grid-row: 1 / -1; grid-column: 3;
  display: flex; align-items: center; gap: 0.6vw;
  border: 1px solid #ffaa2b; border-radius: 0.3vw;
  background: rgba(60, 35, 5, 0.6);
  color: #ffaa2b; font: inherit; font-size: 1.1vw; font-weight: bold;
  padding: 0.4vw 0.7vw; cursor: pointer;
}
#ds .ds-buy span { font-size: 1.6vw; }
#ds .ds-buy:disabled { opacity: 0.35; cursor: default; }
#ds .ds-row-right { display: flex; align-items: center; gap: 0.8vw; }

#ds .ds-bottom { display: grid; grid-template-columns: 1.2fr 1.6fr 1.2fr; gap: 1.5vw; align-items: stretch; }
#ds .ds-next { display: flex; gap: 0.8vw; align-items: center; }
#ds .ds-next img { height: 5.5vw; }
#ds .ds-next-title { color: #7fe0a8; font-weight: bold; font-size: 1.2vw; }
#ds .ds-next-depth { font-size: 1.1vw; margin: 0.2vw 0; }
#ds .ds-next-note { font-size: 0.95vw; color: #9cc4aa; }
#ds .ds-items { display: flex; gap: 0.6vw; align-items: center; }
#ds .ds-slot {
  width: 5vw; height: 5vw;
  border: 1px solid #2e6b4f; border-radius: 0.3vw;
  background: rgba(8, 22, 14, 0.85);
  display: flex; align-items: center; justify-content: center;
  position: relative; color: #40634f; font-size: 0.9vw;
}
#ds .ds-slot img { width: 3.6vw; height: 3.6vw; }
#ds .ds-slot b { position: absolute; right: 0.2vw; bottom: 0.1vw; color: #eaf5ee; font-size: 0.95vw; }
#ds .ds-descend {
  border: 2px solid #ffaa2b; border-radius: 0.5vw;
  background: linear-gradient(180deg, rgba(90, 50, 5, 0.7), rgba(40, 20, 2, 0.9));
  color: #ffaa2b; font: inherit; font-weight: bold; font-size: 2.2vw;
  text-shadow: 0 0 10px #f70; box-shadow: 0 0 16px rgba(255, 170, 43, 0.4);
  cursor: pointer; padding: 0.6vw 1vw;
}
#ds .ds-descend small { display: block; font-size: 1vw; font-weight: normal; color: #e8c9a8; }
#ds .ds-descend.selected { box-shadow: 0 0 26px rgba(255, 170, 43, 0.9); }

#ds .ds-footer {
  border-top: 1px solid #2e6b4f;
  padding-top: 0.5vw;
  color: #7fe0a8;
  font-size: 1vw;
  display: flex; gap: 2.5vw;
}
```

- [ ] **Step 2: death-screen.ts を書く**

```ts
import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { canvas } from './dom'
import {
  condition_texts, death_message, format_run_time,
} from './death-screen-model'
import type { run_result_t } from './death-screen-model'
import {
  meta, meta_buy, meta_drain_factor, meta_max_level, meta_nicotine_max,
  meta_power_factor, meta_sniff_distance, meta_sniff_threshold,
  meta_spare_count, meta_upgrade_cost,
} from './meta'
import type { meta_upgrade_id_t } from './meta'
import './death-screen.css'

import hero_url from '../m/ui/hero.png'
import body_url from '../m/ui/body.png'
import door_url from '../m/ui/door.png'
import icon_lung_url from '../m/ui/icon-lung.png'
import icon_brain_url from '../m/ui/icon-brain.png'
import icon_nose_url from '../m/ui/icon-nose.png'
import icon_bullet_url from '../m/ui/icon-bullet.png'
import icon_cig_url from '../m/ui/icon-cig.png'
import stat_depth_url from '../m/ui/icon-stat-depth.png'
import stat_time_url from '../m/ui/icon-stat-time.png'
import stat_kills_url from '../m/ui/icon-stat-kills.png'
import stat_smoke_url from '../m/ui/icon-stat-smoke.png'
import stat_dummy_url from '../m/ui/icon-stat-dummy.png'
import item_spare_url from '../m/ui/item-spare.png'

// 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。
// 見本は m/result.png。旧 terminal リザルト＋menu.ts の後継で、
// result = null は初回起動モード（記録と状態パネルを隠す）。

interface upgrade_row_t {
  id: meta_upgrade_id_t
  name: string
  icon: string
  color: string
  // 現在レベルまでの累積効果。式は meta.ts の getter から引く（menu.ts の方針を継承）
  describe: () => string
}

const upgrade_rows: upgrade_row_t[] = [
  {
    id: 'lung', name: '肺活量', icon: icon_lung_url, color: '#3ac6f0',
    describe: () => '吸い方の訓練。最大ゲージ ' + meta_nicotine_max() + '。',
  },
  {
    id: 'tolerance', name: 'ニコチン耐性', icon: icon_brain_url, color: '#a86df0',
    describe: () =>
      '我慢の訓練。減少速度 -' + Math.round((1 - meta_drain_factor()) * 100) + '%。',
  },
  {
    id: 'sniff', name: '嗅覚', icon: icon_nose_url, color: '#3af08a',
    describe: () => meta.levels.sniff === 0
      ? '利き煙草。ゲージ低下時に残り香の方向が分かるようになる。'
      : '利き煙草。ゲージ' +
        Math.round(meta_sniff_threshold(meta.levels.sniff) * 100) +
        '%以下で方向' + (meta_sniff_distance() ? '＋距離' : '') + '。',
  },
  {
    id: 'power', name: '火力', icon: icon_bullet_url, color: '#f0932a',
    describe: () =>
      '闇サイトから届く物資。射撃間隔 -' +
      Math.round((1 - meta_power_factor()) * 100) + '%。',
  },
  {
    id: 'spare', name: '予備の一本', icon: icon_cig_url, color: '#f0c93a',
    describe: () =>
      '闇サイトから届く物資。浅く吸う煙草を' + meta_spare_count() + '本持てる [E]。',
  },
]

// 選択位置。0〜4 = 強化行、5 = 地下へ戻る
let selected = 0
let current: run_result_t | null = null
let on_descend = (): void => {}
let root: HTMLDivElement | null = null

export function death_screen_show(
  result: run_result_t | null, on_start: () => void,
): void {
  current = result
  on_descend = on_start
  selected = 0
  if (!root) {
    root = document.createElement('div')
    root.id = 'ds'
    document.body.appendChild(root)
  }
  canvas.style.opacity = '0.3'
  render()
  root.style.display = 'grid'
  document.addEventListener('keydown', on_key)
}

function descend(): void {
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend()
}

function buy(id: meta_upgrade_id_t): void {
  if (meta_buy(id)) {
    audio_play(audio_sfx_pickup)
    render()
  }
}

function on_key(event: KeyboardEvent): void {
  const k = event.key
  if (k === 'Tab') {
    event.preventDefault()
    selected = selected === 5 ? 0 : 5
  } else if (k === 'ArrowUp' || k === 'ArrowLeft') {
    selected = selected === 5 ? 4 : (selected + 4) % 5
  } else if (k === 'ArrowDown' || k === 'ArrowRight') {
    selected = selected === 5 ? 0 : (selected + 1) % 5
  } else if (k === 'Enter') {
    if (selected === 5) { descend() } else { buy(upgrade_rows[selected].id) }
    return // buy() が再描画済み。下の再描画と二重にしない
  } else if (k === 'Escape') {
    descend()
    return
  } else {
    return
  }
  render()
}

function record_row(icon: string, label: string, value: string): string {
  return '<div class="ds-record-row"><img src="' + icon + '" alt="">' +
    label + '<b>' + value + '</b></div>'
}

function blocks(on: number, total: number): string {
  let html = '<span class="ds-blocks">'
  for (let i = 0; i < total; i++) {
    html += '<i class="' + (i < on ? '' : 'off') + '"></i>'
  }
  return html + '</span>'
}

function render(): void {
  const r = current
  const dead = r !== null

  let left = '<h1 class="ds-title">' +
    (dead ? '死亡したよ、高木。' : '自席の端末。') + '</h1>' +
    '<p class="ds-sub">' +
    (dead ? '救護ドローンが君を回収して、自席へ戻した。' : '闇サイトに接続した。') +
    '</p>'

  if (dead) {
    left += '<div class="ds-panel ds-record">' +
      '<div class="ds-panel-title">今回の記録</div>' +
      record_row(stat_depth_url, '到達深度', r.depth + ' F') +
      record_row(stat_time_url, '生存時間', format_run_time(r.run_time)) +
      record_row(stat_kills_url, '撃破数', r.kills + ' 体') +
      record_row(stat_smoke_url, '喫煙回数', r.smoke_count + ' 回') +
      record_row(stat_dummy_url, 'ダミー踏み', r.dummy_count + ' ヶ所') +
      '</div>'
  }

  left += '<div class="ds-hero" style="background-image:url(' + hero_url + ')"></div>'

  if (dead) {
    const message = death_message(r.death_cause)
    const condition = condition_texts(r.nicotine_ratio)
    const craving_percent = Math.round(condition.craving_ratio * 100)
    left += '<div class="ds-status">' +
      '<div class="ds-death-message">' + message[0] + '<br>' + message[1] + '</div>' +
      '<div>' +
      '<div class="ds-gauge-row">♥ HP ' + blocks(r.hp, 5) +
      '<b>' + r.hp + ' / 5</b></div>' +
      '<div class="ds-gauge-row">ニコチン<b>' +
      Math.round(r.nicotine_ratio * 100) + '%</b></div>' +
      '</div>' +
      '<img src="' + body_url + '" alt="">' +
      '<div>' +
      '<div class="ds-gauge-row">手の震え<b>' + condition.tremor + '</b></div>' +
      '<div class="ds-gauge-row">集中力<b>' + condition.focus + '</b></div>' +
      '<div class="ds-gauge-row">吸いたい気持ち ' +
      blocks(Math.round(condition.craving_ratio * 15), 15) +
      '<b>' + (craving_percent >= 100 ? 'MAX' : craving_percent + '%') + '</b></div>' +
      '</div>' +
      '</div>'
  }

  let rows = ''
  for (let i = 0; i < upgrade_rows.length; i++) {
    const row = upgrade_rows[i]
    const level = meta.levels[row.id]
    const max = meta_max_level[row.id]
    const maxed = level >= max
    const cost = meta_upgrade_cost(level)
    let pips = ''
    for (let p = 0; p < max; p++) {
      pips += '<i class="' + (p < level ? 'on' : '') + '"></i>'
    }
    rows += '<div class="ds-row' + (selected === i ? ' selected' : '') +
      '" data-index="' + i + '">' +
      '<img src="' + row.icon + '" alt="">' +
      '<div><div class="ds-row-name" style="color:' + row.color + '">' +
      row.name + '</div>' +
      '<div class="ds-row-desc">' + row.describe() + '</div></div>' +
      '<div class="ds-row-right">' +
      '<div class="ds-row-level">Lv. ' + level + ' / ' + max +
      '<div class="ds-pips" style="color:' + row.color + '">' + pips + '</div></div>' +
      (maxed
        ? '<button class="ds-buy" disabled>MAX</button>'
        : '<button class="ds-buy" data-buy="' + row.id + '"' +
          (meta.yani < cost ? ' disabled' : '') +
          '>ヤニ<br>' + cost + '<span>＋</span></button>') +
      '</div></div>'
  }

  const right = '<div class="ds-yani">' +
    '<div class="ds-yani-amount">ヤニ（残高）: ' + meta.yani + '</div>' +
    '<div class="ds-yani-note">ヤニは闇サイトに送ると見返りが届く。</div>' +
    (meta.persistent
      ? ''
      : '<div class="ds-warning">警告: ストレージ利用不可。強化はこのセッション限りで消える</div>') +
    '</div>' +
    '<div class="ds-upgrades-head">恒久強化（闇サイトの訓練・物資）</div>' +
    rows

  const spares = meta_spare_count()
  let slots = ''
  if (spares > 0) {
    slots += '<div class="ds-slot"><img src="' + item_spare_url +
      '" alt=""><b>×' + spares + '</b></div>'
  }
  // 見本に合わせてスロットは常に 5 枠
  for (let i = spares > 0 ? 1 : 0; i < 5; i++) {
    slots += '<div class="ds-slot">EMPTY</div>'
  }

  const recommended = Math.max(dead ? r.best_depth : meta.best_depth, 1)
  const bottom = '<div class="ds-panel ds-next">' +
    '<img src="' + door_url + '" alt="">' +
    '<div><div class="ds-next-title">次の潜入準備</div>' +
    '<div class="ds-next-depth">推奨深度: ' + recommended + 'F+</div>' +
    '<div class="ds-next-note">次はもっと深く、もっといい一服を。</div></div>' +
    '</div>' +
    '<div class="ds-panel ds-items"><div class="ds-panel-title">所持アイテム</div>' +
    slots + '</div>' +
    '<button class="ds-descend' + (selected === 5 ? ' selected' : '') + '">' +
    (dead ? '地下へ戻る' : '地下へ潜る') +
    '<small>また煙草を探しに行く</small></button>'

  root!.innerHTML =
    '<div class="ds-main"><div class="ds-left">' + left + '</div>' +
    '<div class="ds-right">' + right + '</div></div>' +
    '<div class="ds-bottom">' + bottom + '</div>' +
    '<div class="ds-footer"><span>◀ ▶ 強化選択</span><span>[Enter] 強化する</span>' +
    '<span>[Tab] 項目切替</span><span>[Esc] 地下へ戻る</span></div>'

  for (const button of root!.querySelectorAll<HTMLButtonElement>('[data-buy]')) {
    button.onclick = () => buy(button.dataset.buy as meta_upgrade_id_t)
  }
  root!.querySelector<HTMLButtonElement>('.ds-descend')!.onclick = descend
}
```

- [ ] **Step 3: game.ts と main.ts を配線し、旧 UI を削除する**

`source/game.ts`: import から `menu_show`（`./menu`）と `terminal_show_result` を外し、`death_screen_show` と `run_result_t` は不要（オブジェクトリテラルで渡す）なので `import { death_screen_show } from './death-screen'` を足す。`run_end()` の末尾を置き換える:

```ts
  meta.yani += state.yani_run
  meta.best_depth = Math.max(meta.best_depth, state.depth)
  meta_save()
  death_screen_show({
    depth: state.depth,
    kills: state.kills,
    best_depth: meta.best_depth,
    run_time: state.run_time,
    smoke_count: state.smoke_count,
    dummy_count: state.dummy_count,
    death_cause: state.death_cause,
    nicotine_ratio: state.nicotine / state.nicotine_max,
    hp: Math.max(0, state.entity_player ? state.entity_player.h : 0),
  }, run_start)
```

`source/main.ts`: `import { menu_show } from './menu'` を `import { death_screen_show } from './death-screen'` に差し替え、`menu_show(run_start)` を `death_screen_show(null, run_start)` にする。

`source/menu.ts` を削除する（`git rm source/menu.ts`）。

`source/terminal.ts`: `terminal_show_result` 関数（末尾の約 40 行）と、それだけが使っていた `canvas` の import を削除する（import 行は `import { terminal_el } from './dom'` になる）。

- [ ] **Step 4: 型チェックとテストを通す**

Run: `npm run typecheck` と `npm test -- run`
Expected: PASS。`menu.ts` への参照が残っていれば typecheck が落ちるので拾う

- [ ] **Step 5: コミット**

```bash
git add -A source/ && git commit -m "feat: 死亡画面（リザルト＋闇サイト統合）を実装し、旧テキスト UI を削除する"
```

---

### Task 6: ブラウザ検証と docs の蒸留

**Files:**
- Create/Modify: `.claude/launch.json`（無ければ作成: name "dev", runtimeExecutable "npm", runtimeArgs ["run", "dev"], port 5173）
- Modify: `docs/meta-progression.md`、`docs/architecture.md`
- Delete: `docs/superpowers/specs/2026-08-21-death-screen-design.md`、`docs/superpowers/plans/2026-08-21-death-screen.md`

**Interfaces:**
- Consumes: Task 1〜5 の成果すべて

- [ ] **Step 1: 初回起動モードを目視検証**

preview_start で dev サーバーを起動し、ページをクリックしてイントロを進め、初回モードの死亡画面（見出し「自席の端末。」）が出ることを確認。スクリーンショットを撮り、`m/result.png` とレイアウト・配色を見比べて CSS を調整する（枠色・フォントサイズ・余白のずれはここで直す）。

- [ ] **Step 2: 死亡モードを目視検証**

`source/game.ts` の `run_start()` 末尾に一時デバッグ行 `state.nicotine = 4` を足してリロードし、降下開始 → 約 10 秒でニコチン切れ死 → 死亡画面（「死亡したよ、高木。」、今回の記録、赤い状態パネル）を確認する。確認事項:
- 今回の記録の 5 項目に実データが入る（生存時間が動いている、喫煙回数 0、ダミー踏み 0）
- 死因メッセージがニコチン切れ用になっている
- [+] クリックと Enter で購入でき、残高・Lv・ピップ・説明文が更新される
- 残高不足の [+] が暗く、押しても何も起きない
- Tab で「地下へ戻る」に選択が移り、Enter / Esc / クリックで次のランが始まる
- 次のラン開始後にニコチンゲージ・ミニマップが正常に戻る

スクリーンショットで `m/result.png` と最終比較し、ずれを CSS で詰める。**終わったらデバッグ行を必ず削除**し、`npm run typecheck` を再実行する。

- [ ] **Step 3: docs を更新する**

`docs/meta-progression.md`:
- 「強化テーブル」節: コスト式 `15 + 10lv + 5lv²`（全解放 8425）、各効果曲線（肺活量 10 段で 200、耐性 10 段で 0.60、火力 10 段で 0.50、予備 5 本）、旧釣り合い（実効 2.143 倍・深度 37）の記述を新実効値（200/100 × 1/0.60 = 3.33 倍）に書き直す
- 「嗅覚」節: 比率ベースのしきい値（Lv1 = 30% から等間隔で Lv10 = 60%、距離表示は Lv10）に書き直す。上限 60% の理由（恒久ナビ禁止）は維持
- 「メニュー（闇サイト）とスコア」節: menu.ts → death-screen.ts / death-screen-model.ts に書き直し、リザルトと闇サイトが 1 画面である旨、初回起動モード（result = null）、記録する統計（run_time / smoke_count / dummy_count / death_cause）を記す

`docs/architecture.md`: モジュール一覧の `menu.ts` の行を `death-screen.ts` / `death-screen-model.ts` に差し替え、`terminal_show_result` への言及があれば削除する。48 行目付近に menu への言及があるので grep で確認して直す。

- [ ] **Step 4: 作業ドキュメントを削除して最終コミット**

AGENTS.md の規約どおり、設計の結論は docs/ に蒸留済みなので spec と本計画ファイルを削除する:

```bash
git rm docs/superpowers/specs/2026-08-21-death-screen-design.md docs/superpowers/plans/2026-08-21-death-screen.md
git add docs/ .claude/launch.json
git commit -m "docs: 死亡画面と強化 10 段化を設計書に反映し、作業ドキュメントを削除する"
```

- [ ] **Step 5: 最終検証**

Run: `npm run typecheck && npm test -- run`
Expected: すべて PASS。`git status` がクリーンであること
