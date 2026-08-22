# 一服演出・煙感知の因果・死亡白フェード 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一服を「着火 → 吸引 → 吐き出し」の三幕にし、完了後の煙感知の因果を音で時差配置し、死亡シーケンスの終端を白フェードでつなぐ。

**Architecture:** 時間割はすべて純関数モデル（新規 `smoking-sequence-model.ts` と既存 `death-sequence-model.ts` への追加）に置き、Node（Vitest）でモックなしにテストする。エンティティ側はフレーム駆動タイマーでビートを発火するだけ。メカニクス（`exit_open` の立つタイミング、死亡フロー）は一切変えない。

**Tech Stack:** TypeScript + Vite、Vitest、sonantx-reduced（効果音生成）、WebGL レンダラ（`push_light`）、DOM オーバーレイ。

**Spec:** `docs/superpowers/specs/2026-08-22-smoke-presentation-design.md`

## Global Constraints

- メカニクスを変えない: `state.exit_open = 1` は `_complete()` の瞬間に立てたまま。死亡シーケンスの時間割（0.2〜1.8 秒煙 / 1.2 秒通知 / 1.8 秒持ち上げ / 3.0 秒 `run_end()`）も変えない
- タイマーは setTimeout ではなくフレーム駆動（`state.time_elapsed` の積算）
- ビートの発火時刻は式で計算せず、時刻の表・定数と `(before, after]` 区間の比較で判定する（`death-sequence-model.ts` の `smoke_times` と同じ理由: 二進浮動小数で 1 フレームずれる）
- 純関数モデル（`smoking-sequence-model.ts` / `death-sequence-model.ts`）は実行時 import を持たない葉モジュールであること
- 通知文言: `煙を感知___非常口のロックが解除された`（既存のまま移動のみ）
- コミットメッセージは日本語・現在形（リポジトリの既存スタイル）
- 各タスクの最後に `npm test` と `npm run typecheck` が通ること

---

### Task 1: 一服演出の時間割モデル

**Files:**
- Create: `source/smoking-sequence-model.ts`
- Test: `source/smoking-sequence-model.test.ts`

**Interfaces:**
- Consumes: なし（葉モジュール。import を 1 つも持たない）
- Produces: `smoke_puffs(before: number, after: number): number` / `complete_beats(before: number, after: number): complete_beats_t`（`{ detector: boolean, door: boolean }`）/ `ignite_flash_duration: number`（0.3）。Task 3・4 が entity-smoking-area.ts から import する

- [ ] **Step 1: 失敗するテストを書く**

`source/smoking-sequence-model.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import {
  complete_beats, ignite_flash_duration, smoke_puffs,
} from './smoking-sequence-model'

describe('吸引中の煙（smoke_puffs）', () => {
  it('0.6 秒刻みの湧き時刻を (before, after] で数える', () => {
    expect(smoke_puffs(0, 0.5)).toBe(0)
    expect(smoke_puffs(0.5, 1.0)).toBe(1) // 0.6
    expect(smoke_puffs(0, 2.5)).toBe(4) // 0.6 / 1.2 / 1.8 / 2.4
  })

  it('フレームが粗くても取りこぼさない', () => {
    expect(smoke_puffs(0.5, 1.9)).toBe(3) // 0.6 / 1.2 / 1.8
  })

  it('境界ちょうどは after 側にだけ含める（同じ時刻を 2 度数えない）', () => {
    expect(smoke_puffs(0, 0.6)).toBe(1)
    expect(smoke_puffs(0.6, 1.2)).toBe(1) // 1.2 のみ。0.6 は前のフレームで消費済み
  })
})

describe('完了後の因果タイムライン（complete_beats）', () => {
  it('感知器 0.8 秒・防災扉 1.5 秒を、跨いだフレームで発火する', () => {
    expect(complete_beats(0, 0.5)).toEqual({ detector: false, door: false })
    expect(complete_beats(0.5, 1.0)).toEqual({ detector: true, door: false })
    expect(complete_beats(1.0, 1.5)).toEqual({ detector: false, door: true })
  })

  it('1 フレームで両方跨げば両方発火する', () => {
    expect(complete_beats(0, 2)).toEqual({ detector: true, door: true })
  })
})

describe('着火フラッシュ', () => {
  it('長さは 0.3 秒', () => {
    expect(ignite_flash_duration).toBe(0.3)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/smoking-sequence-model.test.ts`
Expected: FAIL（`smoking-sequence-model` が存在しない）

- [ ] **Step 3: 実装する**

`source/smoking-sequence-model.ts` を新規作成:

```ts
// 一服演出の時間割。DOM も WebGL も触らない純関数のみを置き、
// Node（Vitest）でモックなしに評価できることが条件（death-sequence-model.ts と同じ扱い）。
// 経過時間は entity-smoking-area.ts がフレーム駆動で進め、ビートの発火判定だけをここが持つ。
//
// 時間割（docs/gameplay.md「一服」）:
//   着火: ライターの音 + 灰皿の 0.3 秒フラッシュ（entity-smoking-area._advance が行う）
//   吸引: 進捗 0.6 秒ごとに高木の位置から煙 1 つ
//   完了 t=0: 吐息 + 煙 3 つ
//   完了 t=0.8s: 感知器の音 + ロック解除通知
//   完了 t=1.5s: 防災扉の駆動音（タイムラインの終端）

export const ignite_flash_duration = 0.3

// 吸引中に煙が湧く時刻（一服の進捗秒）。完了（2.5 秒）の手前まで 0.6 秒ごと。
// 時刻を式（0.6n）から求めると二進浮動小数の割り算で 1 フレームずれうるので、
// death-sequence-model.ts の smoke_times と同じく表と直接比較する
const puff_times = [0.6, 1.2, 1.8, 2.4]

const detector_at = 0.8
const door_at = 1.5

export function smoke_puffs(before: number, after: number): number {
  // (before, after] に入った湧き時刻の数。フレームが粗くても取りこぼさない
  return puff_times.filter((t) => before < t && after >= t).length
}

export interface complete_beats_t {
  detector: boolean // 感知器の音 + ロック解除通知を出す
  door: boolean // 防災扉の駆動音を鳴らす（タイムラインの終端）
}

export function complete_beats(before: number, after: number): complete_beats_t {
  return {
    detector: before < detector_at && after >= detector_at,
    door: before < door_at && after >= door_at,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/smoking-sequence-model.test.ts`
Expected: PASS（6 件）

- [ ] **Step 5: コミット**

```bash
git add source/smoking-sequence-model.ts source/smoking-sequence-model.test.ts
git commit -m "一服演出の時間割モデルを追加する"
```

---

### Task 2: 新しい効果音 3 種（ライター・吐息・防災扉）

**Files:**
- Modify: `source/sound-effects.ts`（末尾に 3 楽器を追加）
- Modify: `source/audio.ts:16-22`（export 追加）と `source/audio.ts:37-49`（生成追加）

**Interfaces:**
- Consumes: `SonantInstrument` 型（`./sonantx-reduced`）、`sonantxr_generate_sound`（既存パターン）
- Produces: `audio_sfx_lighter` / `audio_sfx_exhale` / `audio_sfx_door`（いずれも `AudioBuffer | undefined` の export。Task 3・4 が `audio_play()` に渡す）

音色データそのものは自動テスト対象外（スペック「テスト」参照）。既存の `audio.test.ts` は `sonantxr_generate_sound` をモックしており、生成数を数えていないため変更不要。このタスクの検証は型チェックと既存テストの全通過。パラメータは出発点であり、Task 6 の試聴で調整する。

- [ ] **Step 1: sound-effects.ts に 3 楽器を追加する**

`source/sound-effects.ts` の末尾（`sound_explode` の後）に追加:

```ts
// ライターの着火音。ノイズ主体の短い擦過音（シュボッ）。
// パラメータは試聴で調整した値（docs/superpowers/plans の実装計画 Task 6）
export const sound_lighter: SonantInstrument = {
  osc1_oct: 8,
  osc1_det: 0,
  osc1_detune: 0,
  osc1_xenv: 1,
  osc1_vol: 48,
  osc1_waveform: 3,
  osc2_oct: 8,
  osc2_det: 0,
  osc2_detune: 0,
  osc2_xenv: 0,
  osc2_vol: 0,
  osc2_waveform: 0,
  noise_fader: 255,
  env_attack: 50,
  env_sustain: 400,
  env_release: 3500,
  env_master: 150,
  fx_filter: 3,
  fx_freq: 7800,
  fx_resonance: 120,
  fx_delay_time: 0,
  fx_delay_amt: 0,
  fx_pan_freq: 0,
  fx_pan_amt: 0,
  lfo_osc1_freq: 0,
  lfo_fx_freq: 0,
  lfo_freq: 0,
  lfo_amt: 0,
  lfo_waveform: 0,
}

// 深い吐息。立ち上がりの遅い柔らかいノイズをローパスで丸める
export const sound_exhale: SonantInstrument = {
  osc1_oct: 5,
  osc1_det: 0,
  osc1_detune: 0,
  osc1_xenv: 0,
  osc1_vol: 0,
  osc1_waveform: 0,
  osc2_oct: 5,
  osc2_det: 0,
  osc2_detune: 0,
  osc2_xenv: 0,
  osc2_vol: 0,
  osc2_waveform: 0,
  noise_fader: 210,
  env_attack: 7000,
  env_sustain: 9000,
  env_release: 26000,
  env_master: 105,
  fx_filter: 2,
  fx_freq: 1300,
  fx_resonance: 60,
  fx_delay_time: 0,
  fx_delay_amt: 0,
  fx_pan_freq: 0,
  fx_pan_amt: 0,
  lfo_osc1_freq: 0,
  lfo_fx_freq: 1,
  lfo_freq: 2,
  lfo_amt: 40,
  lfo_waveform: 0,
}

// 遠くの防災扉の駆動音。低い持続音 + わずかなノイズをローパスでくぐもらせる
export const sound_door: SonantInstrument = {
  osc1_oct: 4,
  osc1_det: 0,
  osc1_detune: 0,
  osc1_xenv: 0,
  osc1_vol: 180,
  osc1_waveform: 2,
  osc2_oct: 3,
  osc2_det: 0,
  osc2_detune: 5,
  osc2_xenv: 0,
  osc2_vol: 120,
  osc2_waveform: 1,
  noise_fader: 40,
  env_attack: 3000,
  env_sustain: 6000,
  env_release: 22000,
  env_master: 140,
  fx_filter: 2,
  fx_freq: 350,
  fx_resonance: 90,
  fx_delay_time: 6,
  fx_delay_amt: 40,
  fx_pan_freq: 0,
  fx_pan_amt: 0,
  lfo_osc1_freq: 0,
  lfo_fx_freq: 0,
  lfo_freq: 0,
  lfo_amt: 0,
  lfo_waveform: 0,
}
```

- [ ] **Step 2: audio.ts に export と生成を追加する**

`source/audio.ts` の import を更新:

```ts
import {
  sound_beep, sound_door, sound_exhale, sound_explode, sound_hit, sound_hurt,
  sound_lighter, sound_pickup, sound_shoot, sound_terminal,
} from './sound-effects'
```

export 群（`audio_sfx_explode` の下）に追加:

```ts
export let audio_sfx_lighter: AudioBuffer | undefined
export let audio_sfx_exhale: AudioBuffer | undefined
export let audio_sfx_door: AudioBuffer | undefined
```

`audio_init()` の生成群（`sound_explode` の行の下）に追加:

```ts
  sonantxr_generate_sound(audio_ctx, sound_lighter, 160, (b) => { audio_sfx_lighter = b })
  sonantxr_generate_sound(audio_ctx, sound_exhale, 140, (b) => { audio_sfx_exhale = b })
  sonantxr_generate_sound(audio_ctx, sound_door, 110, (b) => { audio_sfx_door = b })
```

- [ ] **Step 3: 型チェックと既存テストを確認する**

Run: `npm run typecheck && npm test`
Expected: 両方 PASS（audio.test.ts は sonantx をモックしているので生成追加の影響なし）

- [ ] **Step 4: コミット**

```bash
git add source/sound-effects.ts source/audio.ts
git commit -m "ライター・吐息・防災扉の効果音を追加する"
```

---

### Task 3: 着火と吸引の演出

**Files:**
- Modify: `source/entity-smoking-area.ts`
- Modify: `source/entity-smoking-area.test.ts`（audio モックの差し替え + テスト追加）
- Modify: `source/game.test.ts:28-38`（audio モックに新 export を追加。実物の entity-smoking-area を import しているため、モックに export が無いと読み込みが落ちる）

**Interfaces:**
- Consumes: `smoke_puffs` / `ignite_flash_duration`（Task 1）、`audio_sfx_lighter`（Task 2）、`spawn_smoke(x, z)`（既存）
- Produces: なし（演出のみ。外部から読まれる新しい状態は増やさない）

- [ ] **Step 1: テストのモックを差し替え、失敗するテストを書く**

`source/entity-smoking-area.test.ts` の `mocks` に `sounds` を追加:

```ts
const mocks = vi.hoisted(() => ({
  notices: [] as string[],
  monologue: [] as string[],
  sounds: [] as string[],
  blocks: [] as number[][],
  sprites: [] as number[][],
  lights: [] as number[][],
}))
```

audio のモックを、どのバッファが鳴ったか記録できる形に差し替える（Task 4 で使う `exhale` / `door` もここでまとめて足す）:

```ts
vi.mock('./audio', () => ({
  audio_play: (buffer: unknown) => {
    if (buffer) { mocks.sounds.push(buffer as string) }
  },
  audio_toggle: () => {},
  audio_sfx_shoot: 'shoot',
  audio_sfx_hit: 'hit',
  audio_sfx_hurt: 'hurt',
  audio_sfx_beep: 'beep',
  audio_sfx_pickup: 'pickup',
  audio_sfx_explode: 'explode',
  audio_sfx_lighter: 'lighter',
  audio_sfx_exhale: 'exhale',
  audio_sfx_door: 'door',
}))
```

`beforeEach` に `mocks.sounds.length = 0` を追加。

describe 末尾に新しいテストを追加:

```ts
  it('吸い始めにライターが鳴り、一度だけ鳴る', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(mocks.sounds.filter((s) => s === 'lighter').length).toBe(1)

    tick(area, player, 0.5) // 吸い続けても着火し直さない
    expect(mocks.sounds.filter((s) => s === 'lighter').length).toBe(1)
  })

  it('着火フラッシュ中は灰皿のライトが明るく（falloff が小さく）なり、0.3 秒で戻る', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.1) // 着火（フラッシュはこのフレームの描画には乗らない）
    mocks.lights.length = 0
    tick(area, player, 0.1)
    expect(mocks.lights[0][6]).toBeCloseTo(0.012, 5)

    tick(area, player, 0.3) // フラッシュの 0.3 秒を超える
    mocks.lights.length = 0
    tick(area, player, 0.1)
    expect(mocks.lights[0][6]).toBeGreaterThan(0.02) // 通常の明滅（0.03±0.01）に戻る
  })

  it('吸引中は 0.6 秒ごとに高木の位置から煙が立ちのぼる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    const count = (): number =>
      state.entities.filter((e) => e instanceof entity_smoke_t).length

    tick(area, player, 0.5) // 進捗 0.5 秒
    expect(count()).toBe(0)
    tick(area, player, 0.5) // 1.0 秒（0.6 を跨ぐ）
    expect(count()).toBe(1)
    tick(area, player, 0.5) // 1.5 秒（1.2 を跨ぐ）
    expect(count()).toBe(2)
  })

  it('中断すると着火フラッシュが消え、吸い直しで再着火する', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.1) // 着火
    player.h = 4
    tick(area, player, 0.1) // 中断
    mocks.lights.length = 0
    idle(area, 0.1) // フラッシュが残っていればここで 0.012 が出る
    expect(mocks.lights[0][6]).toBeGreaterThan(0.02)

    tick(area, player, 0.1) // 吸い直し = 再着火
    expect(mocks.sounds.filter((s) => s === 'lighter').length).toBe(2)
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/entity-smoking-area.test.ts`
Expected: 新規 4 件が FAIL（既存テストは PASS のまま）

- [ ] **Step 3: entity-smoking-area.ts に着火と吸引を実装する**

import に追加:

```ts
import { audio_play, audio_sfx_beep, audio_sfx_lighter, audio_sfx_pickup } from './audio'
import { ignite_flash_duration, smoke_puffs } from './smoking-sequence-model'
```

フィールドを追加（`_smoke_timer` の下）:

```ts
  // 着火フラッシュの経過秒。負なら非表示
  private _flash_time = -1
```

`_advance()` を変更:

```ts
  private _advance(): boolean {
    const player = state.entity_player!

    // 着火。ライターの音とフラッシュは吸い始めの 1 フレームだけ
    if (this._progress === 0) {
      this._hp_mark = player.h
      audio_play(audio_sfx_lighter)
      this._flash_time = 0
    }

    // 被弾で中断。進捗は 0 に戻るが _done は立てないので吸い直せる。
    // 中断で喫煙所を消費すると非常口が永久に開かず、ゲージが尽きるまで
    // 何もできない詰み状態が発生する。
    if (player.h < this._hp_mark) {
      this._progress = 0
      this._flash_time = -1
      // 一服中は自機の速度を強制的にゼロにしている。接触が切れるまで
      // 再武装させないと、動けないまま押さえ込まれ続けて詰む。
      this._needs_release = true
      monologue_interrupt()
      return false
    }

    const progress_before = this._progress
    this._progress += state.time_elapsed
    // 吸引中の煙。高木の位置から立ちのぼる（魂の煙・完了後の煙と同じ見た目 =
    // 世界観の追加説明が要らない）
    for (let i = smoke_puffs(progress_before, this._progress); i > 0; i--) {
      spawn_smoke(player.x, player.z)
    }
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
```

`_render()` のライト描画を変更（フラッシュの進行と falloff の差し替え）:

```ts
    // 着火フラッシュ。_advance が立てた次のフレームから 0.3 秒だけ強く光る
    if (this._flash_time >= 0) {
      this._flash_time += state.time_elapsed
      if (this._flash_time >= ignite_flash_duration) { this._flash_time = -1 }
    }

    const revealed = this.revealed_dummy
    push_block(
      this.x, this.z,
      revealed ? tile_removed_top : tile_ashtray_top,
      revealed ? tile_removed_side : tile_ashtray_side,
    )
    // 標識は灰皿の右脇。開示後は撤去告知の貼り紙に変わる
    push_sprite(this.x + 9, 0, this.z + 1, revealed ? tile_removed_side : tile_sign)
    if (!revealed) {
      push_light(
        this.x + 4, 4, this.z + 12,
        1.0, 0.6, 0.1,
        this._flash_time >= 0 ? 0.012
          : this._done ? 0.08
            : 0.03 + Math.sin(this._animation_time * 3) * 0.01,
      )
    }
```

- [ ] **Step 4: game.test.ts の audio モックに新 export を追加する**

`source/game.test.ts` の `vi.mock('./audio', ...)` に 3 行追加（entity-smoking-area が実物のため、export が無いと import が落ちる）:

```ts
  audio_sfx_lighter: undefined,
  audio_sfx_exhale: undefined,
  audio_sfx_door: undefined,
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
git add source/entity-smoking-area.ts source/entity-smoking-area.test.ts source/game.test.ts
git commit -m "一服に着火と吸引の演出を付ける"
```

---

### Task 4: 吐き出しと煙感知の因果タイムライン

**Files:**
- Modify: `source/entity-smoking-area.ts`（`_complete()` と `_render()`）
- Modify: `source/entity-smoking-area.test.ts`（既存 1 件の修正 + 新規 2 件）
- Modify: `docs/gameplay.md`「一服」節（演出タイムラインの追記）

**Interfaces:**
- Consumes: `complete_beats`（Task 1）、`audio_sfx_exhale` / `audio_sfx_door`（Task 2）、`audio_sfx_beep` / `terminal_show_notice` / `spawn_smoke`（既存）
- Produces: なし

- [ ] **Step 1: 既存テストを新タイムラインに合わせて修正し、失敗するテストを書く**

既存テスト「本物が最後の 1 箇所でも完了のセリフを出す（誘導はターミナルのロック解除通知が担う）」の完了後に、通知が出る時刻まで進める 2 行を足す:

```ts
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true
    for (let i = 0; i < 5; i++) { tick(real, player, 0.5) }
    expect(mocks.monologue).toEqual(['complete'])
    // ロック解除通知は完了の 0.8 秒後（感知器のビート）に出る
    idle(real, 0.5)
    idle(real, 0.5)
    expect(mocks.notices.some((n) => n.includes('非常口'))).toBe(true)
    // 高木の一人称だった旧文言に戻っていないことをピン留めする
    // （ターミナルは高木の一人称を持たない）
    expect(mocks.notices.some((n) => n.includes('深く吸い込む'))).toBe(false)
```

新しいテストを 2 件追加:

```ts
  it('完了で吐息と煙 3 つ、0.8 秒後に感知器と通知、1.5 秒後に防災扉の音が続く', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    const smoke_count = (): number =>
      state.entities.filter((e) => e instanceof entity_smoke_t).length

    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 2.5 秒で完了
    expect(mocks.sounds).toContain('exhale')
    expect(smoke_count()).toBe(4 + 3) // 吸引中 4 つ + 吐き出し 3 つ
    expect(mocks.notices.length).toBe(0) // 通知はまだ
    expect(mocks.sounds).not.toContain('beep')

    idle(area, 0.5) // 完了から 0.5 秒
    expect(mocks.sounds).not.toContain('beep')

    idle(area, 0.5) // 完了から 1.0 秒（0.8 を跨ぐ）: 感知器
    expect(mocks.sounds).toContain('beep')
    expect(mocks.notices.some((n) => n.includes('煙を感知'))).toBe(true)
    expect(mocks.sounds).not.toContain('door')

    idle(area, 0.5) // 完了から 1.5 秒: 防災扉
    expect(mocks.sounds).toContain('door')
  })

  it('ラン終了後（state.game_running が 0）は感知器のタイムラインが進まない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 完了
    mocks.notices.length = 0
    mocks.sounds.length = 0

    state.game_running = 0
    for (let i = 0; i < 4; i++) { idle(area, 0.5) }
    expect(mocks.notices.length).toBe(0)
    expect(mocks.sounds).not.toContain('beep')
    expect(mocks.sounds).not.toContain('door')
  })
```

なお `exit_open` が完了の瞬間に立つことは既存テスト「本物は 2.5 秒で一服が完了し、非常口が開いて HP が 1 回復する」がそのまま守る（変更しない）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/entity-smoking-area.test.ts`
Expected: 修正 1 件 + 新規 2 件が FAIL

- [ ] **Step 3: 実装する**

import を更新:

```ts
import {
  audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_exhale,
  audio_sfx_lighter, audio_sfx_pickup,
} from './audio'
import {
  complete_beats, ignite_flash_duration, smoke_puffs,
} from './smoking-sequence-model'
```

フィールドを追加（`_flash_time` の下）:

```ts
  // 完了後の因果タイムライン（感知器 → 防災扉）の経過秒。負なら停止中
  private _complete_elapsed = -1
```

`_complete()` を変更（ビープと通知を取り除き、吐息・煙・タイムライン開始に置き換える）:

```ts
  private _complete(): void {
    const player = state.entity_player!
    this._done = true
    state.smoke_count++
    state.nicotine = state.nicotine_max
    player.h = Math.min(player.h + 1, 5)
    // 開通は演出を待たない。ここを遅らせると完了直後の死亡や降下との
    // 相互作用が生まれ、演出のためにコアループへ摩擦を足すことになる
    state.exit_open = 1
    // 吐き出し。感知器の音と通知は _render のタイムライン（0.8 秒後）が出す
    audio_play(audio_sfx_exhale)
    for (let i = 0; i < 3; i++) { spawn_smoke(player.x, player.z) }
    this._complete_elapsed = 0
    monologue_complete()
  }
```

`_render()` の完了後ブロック（煙を出し続ける処理の隣）にタイムラインを追加:

```ts
    // 一服完了後の本物は煙を出し続ける。「もう吸える場所ではない」ではなく
    // 「たった今誰かが吸った」ことが見た目で分かる
    if (this._done && this.is_real) {
      this._smoke_timer -= state.time_elapsed
      if (this._smoke_timer <= 0) {
        this._smoke_timer = 0.5
        spawn_smoke(this.x + 4, this.z + 4)
      }
    }

    // 完了後の因果タイムライン: 吸う → 感知される → 扉が動く、を耳で追わせる。
    // game_running が落ちたら進めない — リザルト表示中の terminal_show_notice() は
    // death_screen_show() が止めたターミナルの表示チェーンを再び動かしてしまう
    if (this._complete_elapsed >= 0 && state.game_running) {
      const elapsed_before = this._complete_elapsed
      this._complete_elapsed += state.time_elapsed
      const beats = complete_beats(elapsed_before, this._complete_elapsed)
      if (beats.detector) {
        audio_play(audio_sfx_beep)
        terminal_show_notice('煙を感知___非常口のロックが解除された')
      }
      if (beats.door) {
        audio_play(audio_sfx_door)
        this._complete_elapsed = -1 // 終端。以後このタイムラインは動かない
      }
    }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: docs/gameplay.md「一服」節に追記する**

「一服中は速度も明示的にゼロにする」の段落の後に追加:

```markdown
一服は「着火 → 吸引 → 吐き出し」の三幕で演出する（時間割は `smoking-sequence-model.ts`）。着火でライターの音と灰皿の 0.3 秒のフラッシュ、吸引中は進捗 0.6 秒ごとに高木の位置から煙、完了で吐息と煙 3 つ。完了後は 0.8 秒で感知器の音とロック解除通知、1.5 秒で遠くの防災扉の駆動音が続き、「吸う → 感知される → 扉が動く」という世界のルール（docs/story.md)が耳で追える。**`exit_open` は完了の瞬間に立てたまま**で、遅れるのは音と通知だけ — 開通自体を遅らせると完了直後の死亡や降下との相互作用が生まれ、演出のためにコアループへ摩擦を足すことになる。タイムラインは setTimeout ではなくフレーム駆動で、`state.game_running` が落ちたら進まない（リザルト表示中の `terminal_show_notice()` はターミナルの表示チェーンを壊す）。
```

- [ ] **Step 6: コミット**

```bash
git add source/entity-smoking-area.ts source/entity-smoking-area.test.ts docs/gameplay.md
git commit -m "一服完了後に煙感知の因果を音で時差配置する"
```

---

### Task 5: 死亡シーケンスの白フェード

**Files:**
- Modify: `source/death-sequence-model.ts`（`death_fade_opacity()` 追加）
- Modify: `source/death-sequence-model.test.ts`（テスト追加）
- Modify: `index.html`（`#wf` オーバーレイと CSS）
- Modify: `source/dom.ts`（`fade_el` 追加）
- Modify: `source/game.ts`（dying ブロック・`run_end()`・`run_start()`）
- Modify: `source/game.test.ts`（`./dom` モック追加 + 統合テスト 1 件）
- Modify: `docs/gameplay.md`「死亡シーケンス」節

**Interfaces:**
- Consumes: `death_duration`（既存 export）、モジュール内の `lift_at`（既存 private 定数）
- Produces: `death_fade_opacity(elapsed: number): number`（0〜1。game.ts が毎フレーム `fade_el.style.opacity` へ書く）、`fade_el: HTMLElement`（dom.ts export）

- [ ] **Step 1: モデルの失敗するテストを書く**

`source/death-sequence-model.test.ts` に追加:

```ts
import { death_fade_opacity } from './death-sequence-model'

describe('白フェード', () => {
  it('持ち上げ開始（1.8 秒）から終端（3.0 秒）へ直線で 0 → 1', () => {
    expect(death_fade_opacity(0)).toBe(0)
    expect(death_fade_opacity(1.8)).toBe(0)
    expect(death_fade_opacity(2.4)).toBeCloseTo(0.5, 5)
    expect(death_fade_opacity(3.0)).toBe(1)
    expect(death_fade_opacity(4.0)).toBe(1)
  })
})
```

（既存の import 行に `death_fade_opacity` を足す形でよい。）

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/death-sequence-model.test.ts`
Expected: 新規 1 件が FAIL

- [ ] **Step 3: モデルを実装する**

`source/death-sequence-model.ts` の末尾に追加し、ファイル冒頭の時間割コメントに `1.8s〜3.0s 白フェード` の行を足す:

```ts
// 白フェード。持ち上げ開始から終端へ直線で 0 → 1。「降りてきた白い光に
// 包まれて運ばれた」の完結で、機体を描かない表現（上記）は変えない
export function death_fade_opacity(elapsed: number): number {
  return Math.max(0, Math.min(1, (elapsed - lift_at) / (death_duration - lift_at)))
}
```

Run: `npx vitest run source/death-sequence-model.test.ts`
Expected: PASS

- [ ] **Step 4: index.html と dom.ts にオーバーレイを追加する**

`index.html` の `<style>` に追加:

```css
#wf{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:20;}
#wf.f{transition:opacity .6s;}
@media (prefers-reduced-motion: reduce){#wf{display:none;}}
```

（`z-index: 20` は死亡画面 `#ds` の `z-index: 10` より上。reduced-motion では `display:none` にして、JS 側の書き込みを無害化する — JS に matchMedia の分岐を持たない。）

`<body>` の `<code id="b"></code>` の下に追加:

```html
	<div id="wf"></div>
```

`source/dom.ts` に追加（冒頭コメントの ID 列挙 `c / m / a / h / sn / b` も `wf` を含めて更新する）:

```ts
export const fade_el = document.getElementById('wf') as HTMLElement
```

- [ ] **Step 5: game.test.ts に dom モックと失敗する統合テストを書く**

`source/game.test.ts` の `harness`（`vi.hoisted`）に fade を追加:

```ts
  const fade = {
    style: { opacity: '0' },
    classes: new Set<string>(),
    classList: {
      add(c: string) { fade.classes.add(c) },
      remove(c: string) { fade.classes.delete(c) },
    },
  }
```

を作り、`return { clock, pending, death_screens, notices, fade }` に含める。モックを追加:

```ts
vi.mock('./dom', () => ({ fade_el: harness.fade }))
```

`describe('死亡シーケンスの進行')` にテストを追加:

```ts
  it('白フェードは持ち上げ（1.8 秒）から掛かり、死亡画面が出ると明けはじめる', () => {
    kill_player()
    advance(1.75)
    expect(Number(harness.fade.style.opacity)).toBe(0)

    advance(0.625) // 2.375 秒: フェードの途中
    const mid = Number(harness.fade.style.opacity)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)

    advance(0.625) // 3.0 秒: run_end → 真っ白から明けはじめる
    expect(harness.fade.style.opacity).toBe('0')
    expect(harness.fade.classes.has('f')).toBe(true)
  })
```

Run: `npx vitest run source/game.test.ts`
Expected: 新規 1 件が FAIL（`fade_el` が game.ts から使われていない）

- [ ] **Step 6: game.ts を実装する**

import に追加:

```ts
import { fade_el } from './dom'
```

`death-sequence-model` の import に `death_fade_opacity` を足す。

`game_tick` の dying ブロック内、`push_light(...)` の後・`beats.done` 判定の前に追加:

```ts
    // 白フェード。持ち上げ以降、白い光に包まれていく。フェードインは
    // フレーム駆動の書き込み（トランジションを常時付けると毎フレームの
    // 書き込みに追従しない）。reduced-motion は CSS 側（#wf の display:none）
    // で無効化されるので、ここに分岐は持たない
    fade_el.style.opacity = String(death_fade_opacity(state.death_elapsed))
```

`run_end()` の `death_screen_show({...}, run_start)` の直前に追加:

```ts
  // 真っ白の状態で死亡画面を出し、.f のトランジション（0.6 秒）で白が明けて
  // 闇サイトが見える。トランジションはフェードアウト側にだけ使う
  fade_el.classList.add('f')
  fade_el.style.opacity = '0'
```

`run_start()` の `audio_music_restore()` の下に追加:

```ts
  fade_el.classList.remove('f') // 次の死のフレーム駆動フェードインに遅延を残さない
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `npm test && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 8: docs/gameplay.md「死亡シーケンス」節に追記する**

箇条書き（「BGM はテープストップ」の項の後）に追加:

```markdown
- 終端は白フェードでつなぐ: 持ち上げ開始（1.8 秒）から終端（3.0 秒）へ、白いオーバーレイ `#wf` の不透明度を `death_fade_opacity()` で 0 → 1 に上げ、真っ白の状態で死亡画面を出してから CSS トランジション（0.6 秒）で明ける。「降りてきた白い光に包まれて運ばれた」の完結で、機体を描かない表現は変えない。フェードインはフレーム駆動・フェードアウトだけトランジション（`.f`）— 常時トランジションだと毎フレームの書き込みに追従しない。`prefers-reduced-motion` では `#wf` を `display:none` にし、従来どおりカットで切り替える（JS に分岐を持たない）
```

- [ ] **Step 9: コミット**

```bash
git add source/death-sequence-model.ts source/death-sequence-model.test.ts index.html source/dom.ts source/game.ts source/game.test.ts docs/gameplay.md
git commit -m "死亡シーケンスの終端を白フェードでつなぐ"
```

---

### Task 6: 試聴・目視調整と全体検証

**Files:**
- Modify: `source/sound-effects.ts`（試聴結果でパラメータ調整）
- Modify: `source/entity-smoking-area.ts`（必要ならフラッシュの falloff 0.012 を調整）

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: 最終調整済みのパラメータ

- [ ] **Step 1: dev サーバーを起動する**

`.claude/launch.json` の `takagiaction` 設定でプレビューを開く（`npm run dev` 相当）。**ローカルでは音が既定でミュート**（`audio.ts`: localhost では `audio_enabled = false`）なので、ゲーム開始後に **M キーで音声を ON** にしてから確認する。

- [ ] **Step 2: 一服の三幕を確認・調整する**

深度 1 で喫煙所を見つけて一服し、以下を確認:

1. 触れた瞬間にライターの擦過音が鳴る（「シュボッ」に聞こえるか。長すぎる・高すぎる場合は `sound_lighter` の `env_release` / `fx_freq` を調整）
2. 灰皿のライトが 0.3 秒強く光る（まぶしすぎるなら falloff 0.012 を 0.015〜0.02 へ）
3. 吸引中に 0.6 秒ごとに煙が立ちのぼる
4. 完了時に深い吐息が聞こえる（ノイズが耳障りなら `sound_exhale` の `fx_freq` を下げる、音量は `env_master`）
5. 0.8 秒後にビープ + 「煙を感知」通知、1.5 秒後に低い駆動音（`sound_door` が「遠くの重い扉」に聞こえるか。軽すぎるなら `osc1_oct` を下げる・`env_attack` を延ばす）

- [ ] **Step 3: 中断の挙動を確認する**

敵に囲まれた喫煙所で一服し、被弾中断 → 吸い直しで再度ライター音が鳴ること、フラッシュが残らないことを確認。

- [ ] **Step 4: 白フェードを確認する**

わざと死んで、1.8 秒から白に包まれ → 真っ白で死亡画面 → 0.6 秒で白が明けることを確認。「地下へ戻る」で次のランが正常に始まり、白が残らないことも確認。ニコチン切れ死（ゲージ 0% 放置）と敵死の両方で確認する。

- [ ] **Step 5: reduced-motion を確認する**

ブラウザ DevTools のレンダリング設定で `prefers-reduced-motion: reduce` をエミュレートし、死亡時に白フェードが出ず従来どおりカットで切り替わることを確認。

- [ ] **Step 6: 最終検証とコミット**

Run: `npm test && npm run typecheck`
Expected: 全 PASS

調整があった場合のみ:

```bash
git add source/sound-effects.ts source/entity-smoking-area.ts
git commit -m "一服演出の音と光のパラメータを調整する"
```

---

## 完了の定義

- `npm test` / `npm run typecheck` が通る
- スペック（`docs/superpowers/specs/2026-08-22-smoke-presentation-design.md`）の 3 セクションがすべて動作として確認できる
- docs/gameplay.md がコードの現状と一致している（AGENTS.md の規約）
- 作業完了後、スペックの結論は docs/ 直下へ蒸留済みのため（Task 4・5 で gameplay.md へ反映）、`docs/superpowers/specs/2026-08-22-smoke-presentation-design.md` と本計画ファイルを削除するコミットを最後に行う
