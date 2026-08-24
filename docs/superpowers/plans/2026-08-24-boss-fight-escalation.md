# ボス戦の増強（専用BGM・2フェーズ・移動・追尾弾）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 灰皿撤去ユニットとの戦いを、専用BGM・HP 半分での激昂・闘技場を動き回る移動・水色の追尾弾を備えた 2 幕構成の戦いに置き換える。

**Architecture:** 数値と幾何は純粋な葉モジュール `boss-model.ts` に集め、Node の Vitest で形の性質だけを固定する。`entity-boss.ts` は周回移動（線速度一定、角速度は `ω = v / r` で導出）と 14×14 の専用壁判定を持ち、柱には衝突して滑る。闘技場の柱リングを半径 8 タイルへ動かし、隣接する柱の隙間（32px）をボスの判定（14px）が通れるようにする。BGM は 2 曲目を通常曲の後追いで生成し、`music_source` の差し替えで切り替える。

**Tech Stack:** TypeScript 5.7 / Vite 6 / Vitest 2 / WebGL（自前レンダラ）/ Pillow（アトラス焼き込み、`uv run` 経由）

**Spec:** `docs/superpowers/specs/2026-08-24-boss-fight-escalation-design.md`

## Global Constraints

- **後方互換レイヤーを作らない。** 置き換えたら古い経路は消す。互換用の分岐・フォールバック・「一応残しておく」コードを残さない（`AGENTS.md`）
- **最もシンプルな実装を選ぶ。** 呼び出し元が 1 か所のものに抽象化を作らない。使う予定のないオプションやフラグを増やさない。ただし要件は完全に満たす（`AGENTS.md`）
- **Python は必ず `uv run` 経由で実行する。** `uv run --with pillow python tools/xxx.py`。`python` / `python3` を直接叩かない（`AGENTS.md`）
- **Windows で日本語を含む Python を走らせるときは `-X utf8` を付ける。** CP932 のデコードエラーを避ける（`LEARNINGS.md`）
- **`entity.ts` は `entity_t` のサブクラスを宣言するモジュールへ到達してはならない。** これが唯一の循環参照の不変条件で、`entity-*.ts` どうしの循環は許容されている（`docs/architecture.md`）
- **`_init()` には基底クラス（`entity_t`）のフィールドしか代入できない。** `useDefineForClassFields` によりサブクラスのフィールドは基底 constructor の後に define されるため、`_init()` での代入はサイレントに `undefined` で潰される。サブクラス固有の状態はフィールド初期化子に書く。初期化子は基底 constructor（`_init()` を含む）の後に走るので `this.x` や `this.h` を読める（既存の `entity_sentry_t._target_x` と同じ手）
- **`state.ts` は実行時 import を一切持たない。** 型は `import type` で受ける
- **`level-generator.ts` は `renderer` / `dom` / `audio` を import しない**
- **新しい sonantx の効果音パッチを足さない。** 効果音は既存のものを組み合わせる（BGM の楽曲データは別扱いで、今回 1 本追加する）
- **コメントと識別子は既存の流儀に合わせる。** コメントは日本語で「なぜそうなっているか」を書く。関数の処理を逐次説明するコメントは書かない
- **深度スケールの軸は砲口の本数（`boss_arms`）だけ。** 追尾弾の数・旋回速度・寿命を深度で動かさない
- 検証コマンドは `npm test`（Vitest）と `npm run typecheck`（`tsc --noEmit`）

## File Structure

**新規作成**

| ファイル | 責務 |
| --- | --- |
| `source/screen-flash.ts` | 全画面の赤いフラッシュ 1 回。DOM クラスの付け外しだけを持つ |
| `source/music-boss.ts` | ボス専用BGMの楽曲データ（`SonantSong`）。データのみ |
| `source/entity-boss.test.ts` | ボス本体の挙動テスト（壁判定・フェーズ移行・残弾掃除） |

**変更**

| ファイル | 変更内容 |
| --- | --- |
| `source/boss-model.ts` | 寸法定数の受け入れ、フェーズ、周回、追尾の旋回。純粋な葉モジュールのまま |
| `source/boss-model.test.ts` | 上記のテスト |
| `source/entity-boss.ts` | 浮遊化・周回移動・専用壁判定・フェーズ移行・追尾弾クラス・衝撃波 |
| `source/level-generator.ts` | 柱リングの半径 6 → 8 |
| `source/level-generator.test.ts` | 4 つ目の不変条件（隙間をボスが通れる） |
| `source/renderer.ts` | フラグメントシェーダの full-bright 規則に水色を追加 |
| `source/audio.ts` | ボス曲の生成・切替・レート・復帰 |
| `source/audio.test.ts` | 上記のテスト |
| `source/audio-data.test.ts` | ボス曲の構造テスト |
| `source/monologue.ts` | 激昂と灰皿ブロックのセリフ |
| `source/monologue-model.test.ts` | 変更なし（プール選択の規約は既存のまま） |
| `source/entity-smoking-area.ts` | ボス生存中に灰皿へ触れたときのセリフ呼び出し |
| `source/entity-smoking-area.test.ts` | 上記のテスト |
| `source/game.ts` | ボス階でのBGM切替、`boss_spawn_offset` の import 元変更 |
| `source/dom.ts` | `flash_el` |
| `index.html` | `#bf` レイヤと CSS |
| `tools/boss_tiles.py` | タイル 49（水色の追尾弾）を焼く |
| `docs/enemies.md` / `docs/gameplay.md` / `docs/architecture.md` | 設計書の更新 |

---

### Task 1: 闘技場の柱リングを半径 8 へ広げ、ボスの寸法を葉モジュールへ移す

ボスの当たり判定の寸法を純粋な葉モジュール `boss-model.ts` へ移す。`level-generator.test.ts` が「隙間をボスが通れる」を検証するために寸法を import する必要があり、`entity-boss.ts` から取ると `renderer` / `audio` に到達してモックが必要になるため。

**Files:**
- Modify: `source/boss-model.ts`
- Modify: `source/entity-boss.ts:33-46`（`boss_size` 以外の寸法定数を削除して import に置き換え）
- Modify: `source/game.ts:8`（`boss_spawn_offset` の import 元）
- Modify: `source/level-generator.ts:56`（`arena_pillar_radius`）
- Test: `source/level-generator.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `boss-model.ts` から `boss_hitbox: number`（= 14）、`boss_centre: number`（= 7）、`boss_spawn_offset: number`（= -3）

- [ ] **Step 1: 寸法定数を `boss-model.ts` の末尾へ移す**

`source/boss-model.ts` の末尾に追記する:

```ts
// 当たり判定の一辺（ワールド単位）。見た目だけ大きくして既定の 9 のまま
// 残すと、輪郭に撃った弾がすり抜ける。
// この値は闘技場の柱の間隔を縛る（docs/gameplay.md「ボス階」の 4 つ目の
// 不変条件）ため、レンダラや音に到達しない葉モジュールに置く。
// level-generator.test.ts が不変条件の検証のために読む
export const boss_hitbox = 14

// 判定・絵・銃口が共有する中心の、entity.x/z からの距離。game.ts の AABB は
// [x, x+w] なので、中心は半辺のところにある。3 つが別々の中心を持つと
// 「絵の左上に撃った弾がすり抜け、右下の素の床で当たる」ことになり、
// w を広げた意味が消える
export const boss_centre = boss_hitbox / 2

// 生成位置の補正。上の中心を灰皿タイル（8×8）の中心 = tile * 8 + 4 に重ねる
// ための戻し量で、game.ts が生成時に足す
export const boss_spawn_offset = 4 - boss_centre
```

- [ ] **Step 2: `entity-boss.ts` の重複した定義を削除して import に置き換える**

`source/entity-boss.ts` の `boss_hitbox` / `boss_centre` / `boss_spawn_offset` の 3 つの定義（`const boss_hitbox = 14` から `export const boss_spawn_offset = 4 - boss_centre` まで、コメントごと）を削除し、先頭の `boss-model` の import に足す:

```ts
import {
  boss_arm_angles, boss_bullet_speed, boss_centre, boss_hitbox, boss_hp,
  boss_spin_rate, boss_volleys,
} from './boss-model'
```

`_init()` の `this.w = boss_hitbox` はそのまま動く。`boss_size = 12` と `boss_body_y = 8` と `boss_muzzle = 10` と `boss_bullet_tile = 46` は `entity-boss.ts` に残す（見た目と弾の出所は本体の都合で、闘技場の幾何を縛らない）。

- [ ] **Step 3: `game.ts` の import 元を変える**

`source/game.ts:8` の

```ts
import { boss_spawn_offset, entity_boss_t } from './entity-boss'
```

を 2 行に分ける（`boss_arms` の import 行に混ぜず、`boss-model` の既存 import 行へ足す）:

```ts
import { boss_arms, boss_spawn_offset } from './boss-model'
import { entity_boss_t } from './entity-boss'
```

- [ ] **Step 4: 型チェックとテストが通ることを確認（ここまでは純粋な移動）**

Run: `npm run typecheck && npm test`
Expected: PASS（既存のテストがすべて緑）

- [ ] **Step 5: 不変条件の失敗するテストを書く**

`source/level-generator.test.ts` の末尾に追記する。`boss_hitbox` を import に足すこと（ファイル先頭の import に `import { boss_hitbox } from './boss-model'` を追加）。

```ts
// 4 つ目の不変条件。ボスは闘技場を動き回るので、判定 14×14 が隣接する柱の
// 隙間を通れなければリングの内側に閉じ込められる。柱の本数・半径・大きさを
// 触った人がこれを壊せるので、座標ではなく「通れること」で固定する。
// 座席（中央の灰皿）は壁タイルだがボスは通過できる（entity-boss.ts の免除）
describe('闘技場: ボスがリングの内外を行き来できる', () => {
  // 1px 刻みの占有格子で BFS する。生成位置から出発し、灰皿の中心から
  // 70px（目標半径の上限）より遠い位置に到達できることを見る
  function boss_can_reach(radius: number): boolean {
    const layout = generate_level(5, 12345)
    const tiles = layout.tiles
    const home_tx = layout.boss!.x
    const home_tz = layout.boss!.z
    const home_x = home_tx * 8 + 4
    const home_z = home_tz * 8 + 4

    const free = (x: number, z: number): boolean => {
      const x1 = (x + boss_hitbox) >> 3
      const z1 = (z + boss_hitbox) >> 3
      for (let tz = z >> 3; tz <= z1; tz++) {
        for (let tx = x >> 3; tx <= x1; tx++) {
          if (tx === home_tx && tz === home_tz) { continue }
          if (tiles[tx + tz * level_width] > 7) { return false }
        }
      }
      return true
    }

    const start_x = home_tx * 8 - 3
    const start_z = home_tz * 8 - 3
    const half = arena_side >> 1
    const min_x = (home_tx - half) * 8
    const min_z = (home_tz - half) * 8
    const span = arena_side * 8
    const seen = new Uint8Array(span * span)
    const key = (x: number, z: number) => (x - min_x) + (z - min_z) * span
    const queue: Array<[number, number]> = [[start_x, start_z]]
    seen[key(start_x, start_z)] = 1

    while (queue.length) {
      const [x, z] = queue.pop()!
      const dx = x + boss_hitbox / 2 - home_x
      const dz = z + boss_hitbox / 2 - home_z
      if (Math.sqrt(dx * dx + dz * dz) > radius) { return true }
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < min_x || nz < min_z || nx >= min_x + span || nz >= min_z + span) {
          continue
        }
        const k = key(nx, nz)
        if (seen[k]) { continue }
        seen[k] = 1
        if (free(nx, nz)) { queue.push([nx, nz]) }
      }
    }
    return false
  }

  it('生成位置から灰皿中心 70px 超の位置まで到達できる', () => {
    expect(boss_can_reach(70)).toBe(true)
  })
})
```

`level_width` と `arena_side` はこのテストファイルの既存 import にある（`arena_side` は既に import 済み。`level_width` が無ければ `import { level_width } from './state'` を足す）。

- [ ] **Step 6: テストを走らせて失敗を確認**

Run: `npx vitest run source/level-generator.test.ts -t "リングの内外"`
Expected: FAIL — 現在の柱リング（半径 6）では隣接する柱の隙間が 16px しかなく、14px の箱が通れないため `false` が返る

- [ ] **Step 7: 柱リングの半径を 8 にする**

`source/level-generator.ts:53-59` のコメントと定数を差し替える:

```ts
// ボス階（深度が 5 の倍数）の闘技場。一辺は深度で変えない — レンダラの霧が
// smoothstep(112, 16, 深度) で切れるので、中央から端まで 88px（11 タイル）なら
// どこに立ってもボスが見える。闘技場は相手が見えていないと成立しない。
// 広さを深度で動かすと、掃射の間合いが深度ごとに別物になる
export const arena_side = 23
// 柱は中心から半径 8 タイルのリングに 45° ごと 8 本、1 本 2×2。格子状に
// しないのは、中央のボスから見て全方向に等しく遮蔽が要るため（格子だと
// 隅が空いて安全地帯が偏り、周回が 360° 成立しない）。
// 半径が 6 ではなく 8 なのは、隣接する柱の隙間をボスの当たり判定（14px）が
// 通れる必要があるため。6 では隙間が 16px しかなく、ボスがリングを越えられず
// 生まれた側に閉じ込められる（8 なら 32px）
const arena_pillar_radius = 8
const arena_pillar_count = 8
const arena_pillar_size = 2
```

- [ ] **Step 8: テストを走らせて通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS。既存の闘技場テスト（`pillar_tiles === 32`、「柱は中央の灰皿にも外周の輪郭壁にも接しない」、1000 シードの連結性）も本数とサイズを変えていないので通る

- [ ] **Step 9: コミット**

```bash
git add source/boss-model.ts source/entity-boss.ts source/game.ts source/level-generator.ts source/level-generator.test.ts
git commit -m "闘技場の柱リングを半径8へ広げる

ボスの当たり判定(14px)が隣接する柱の隙間を通れることを4つ目の
不変条件として立てる。半径6では隙間が16pxしかなく、動き回るボスが
リングの内側に閉じ込められる。

寸法定数(boss_hitbox/boss_centre/boss_spawn_offset)を boss-model.ts へ
移す。level-generator.test.ts が不変条件の検証で読むため、renderer や
audio に到達しない葉モジュールに置く必要がある。"
```

---

### Task 2: フェーズと、フェーズで変わる摘みを `boss-model.ts` に足す

**Files:**
- Modify: `source/boss-model.ts`
- Modify: `source/boss-model.test.ts`
- Modify: `source/entity-boss.ts`（`_update()` の再構成と弾の生成の一元化）

**Interfaces:**
- Consumes: Task 1 の `boss_centre`
- Produces:
  - `boss_phase_rage: number`（= 2）
  - `boss_phase(hp: number, hp_max: number): number` — 1 か `boss_phase_rage`
  - `boss_spin_rate(phase: number): number`
  - `boss_fire_step(phase: number): number`
  - `boss_bullet_speed(phase: number): number`
  - `boss_volleys(before: number, after: number, step: number): number` — 第 3 引数が増える

- [ ] **Step 1: 失敗するテストを書く**

`source/boss-model.test.ts` の import を差し替え、末尾に追記する。

import 行:

```ts
import {
  boss_arm_angles, boss_arms, boss_arms_max, boss_bullet_speed, boss_fire_step,
  boss_hp, boss_phase, boss_phase_rage, boss_spin_rate, boss_volleys,
} from './boss-model'
```

既存の `boss_volleys` の describe 内で `boss_fire_step` を使っている 6 か所を `boss_fire_step(1)` に書き換える（値から関数になるため）。差し替え後の既存 describe:

```ts
describe('boss_volleys', () => {
  const step = boss_fire_step(1)

  it('しきい値をまたいだ回数だけ斉射する', () => {
    expect(boss_volleys(0, step * 0.9, step)).toBe(0)
    expect(boss_volleys(0, step * 1.1, step)).toBe(1)
    expect(boss_volleys(step * 0.9, step * 1.1, step)).toBe(1)
    expect(boss_volleys(0, step * 2.1, step)).toBe(2)
  })

  it('掃引を細かく刻んでも合計の斉射数は変わらない', () => {
    const total = step * 10
    const coarse = boss_volleys(0, total, step)
    let fine = 0
    for (let i = 0; i < 1000; i++) {
      fine += boss_volleys(total * i / 1000, total * (i + 1) / 1000, step)
    }
    expect(fine).toBe(coarse)
    expect(coarse).toBe(10)
  })

  it('刻みを変えても同じ規則で数える', () => {
    expect(boss_volleys(0, 1.5, 1.4)).toBe(1)
    expect(boss_volleys(0, 2.9, 1.4)).toBe(2)
    expect(boss_volleys(1.5, 2.9, 1.4)).toBe(1)
  })
})
```

末尾に追記:

```ts
describe('boss_phase', () => {
  it('HP がちょうど半分で激昂に入る', () => {
    expect(boss_phase(60, 60)).toBe(1)
    expect(boss_phase(31, 60)).toBe(1)
    expect(boss_phase(30, 60)).toBe(boss_phase_rage)
    expect(boss_phase(1, 60)).toBe(boss_phase_rage)
  })
})

describe('フェーズで変わる摘み', () => {
  it('激昂ですべて強くなる（発射の刻みだけは小さくなる方向）', () => {
    expect(boss_spin_rate(boss_phase_rage)).toBeGreaterThan(boss_spin_rate(1))
    expect(boss_bullet_speed(boss_phase_rage)).toBeGreaterThan(boss_bullet_speed(1))
    expect(boss_fire_step(boss_phase_rage)).toBeLessThan(boss_fire_step(1))
  })

  it('斉射の頻度（回転 ÷ 刻み）が激昂で上がる', () => {
    const rate = (p: number) => boss_spin_rate(p) / boss_fire_step(p)
    expect(rate(boss_phase_rage)).toBeGreaterThan(rate(1))
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/boss-model.test.ts`
Expected: FAIL — `boss_phase is not a function` および `boss_fire_step is not a function`

- [ ] **Step 3: `boss-model.ts` を実装する**

`boss_spin_rate` / `boss_fire_step` / `boss_bullet_speed` の 3 つの `export const` 定義（コメントごと）を削除し、次に差し替える。`boss_volleys` は `step` 引数を取る形に置き換える（既定値は付けない — 呼び出し側にどちらの刻みか明示させる）。

```ts
// フェーズ。1 = 前半、2 = 激昂。段を 3 つ以上にしないのは、各段が短くなって
// 違いが読めなくなるため
export const boss_phase_rage = 2

// HP がちょうど半分のときは激昂に入れる。境界をどちらに寄せるかは
// 恣意的だが、決めておかないと実装とテストが食い違う
export function boss_phase(hp: number, hp_max: number): number {
  return hp <= hp_max / 2 ? boss_phase_rage : 1
}

// 以下 4 つは激昂で変わる摘み。倍率を 1 つの係数で表さず値を直に並べるのは、
// 上がり方が揃っていないため（回転 ×1.5 / 刻み ×0.83 / 弾速 ×1.25）。
// 係数にすると「揃っている」という嘘の情報が入る

// 砲塔の角速度（rad/s）。前半は 1 周 12.6 秒
export function boss_spin_rate(phase: number): number {
  return phase === boss_phase_rage ? 0.75 : 0.5
}

// 発射を刻む角度（rad）。時間ではなく掃引した角度で刻むのは、回転速度を
// 変えても弾の空間密度が変わらないようにするため
export function boss_fire_step(phase: number): number {
  return phase === boss_phase_rage ? 0.15 : 0.18
}

// 掃射の弾速。前半の 56 はセントリーの 64 より遅い。激昂の 70 はそれを
// 上回る — ラン中で最も速い弾を激昂したボスが撃つのは序列として正しい
export function boss_bullet_speed(phase: number): number {
  return phase === boss_phase_rage ? 70 : 56
}

// 掃引が発射のしきい値を何回またいだか。またいだ回数だけ斉射する。
// 引数は累積の掃引角（常に増える）で、回転の向きは含まない。
// step を引数に取るのは、掃射（boss_fire_step）と追尾弾（boss_homing_step）が
// 同じ規則を共有するため。時間で刻む別のタイマーを持ち込まない
export function boss_volleys(before: number, after: number, step: number): number {
  return Math.floor(after / step) - Math.floor(before / step)
}
```

- [ ] **Step 4: `entity-boss.ts` をフェーズ対応に組み替える**

まず import を差し替える:

```ts
import {
  boss_arm_angles, boss_bullet_speed, boss_centre, boss_fire_step, boss_hitbox,
  boss_hp, boss_phase, boss_phase_rage, boss_spin_rate, boss_volleys,
} from './boss-model'
```

`entity_boss_t` にフィールドと最大 HP を足す（`_arms` の直後）:

```ts
  // 最大 HP。_init() が h に代入した値をそのまま覚える。フィールド初期化子は
  // 基底 constructor（_init() を含む）の後に走るので、この順で正しい
  // （entity_sentry_t._target_x = this.x と同じ手）
  _hp_max = this.h
  // 現在のフェーズ。1 = 前半、2 = 激昂
  private _phase = 1
```

`_update()` を差し替える。弾の生成を `_spawn_bullet()` に一元化するのは、この後のタスクで衝撃波（Task 9）と追尾弾（Task 8）が同じ経路を使うため:

```ts
  override _update(): void {
    const t = this
    const swept_before = t._swept
    t._swept += boss_spin_rate(t._phase) * state.time_elapsed
    // 砲塔の向き。フレームを跨いで持つ状態は _swept だけで足りる
    const facing = t._swept * t._spin

    const volleys = boss_volleys(swept_before, t._swept, boss_fire_step(t._phase))
    for (let v = 0; v < volleys; v++) {
      for (const angle of boss_arm_angles(facing, t._arms)) {
        t._spawn_bullet(angle)
      }
    }

    // 基底の _update() は呼ばない。動かないので積分が要らないうえ、
    // 灰皿タイルは壁なので毎フレーム _collides() が真になる
  }

  // 判定と絵が共有する中心から、銃口の半径だけ離して 1 発出す。
  // 中から出すと、生まれた次のフレームで _collides() が壁を返して弾が
  // 即座に消える。弾の判定は 6×4 なので、タイルから抜けるには x で 7・
  // z で 6 の余裕が要る。半径 10 なら最悪の角度（斜め 45°）でも成分が
  // 7.07 になり、必ずどちらかの軸で抜ける
  private _spawn_bullet(angle: number): void {
    const t = this
    const mx = t.x + boss_centre + Math.cos(angle) * boss_muzzle
    const mz = t.z + boss_centre + Math.sin(angle) * boss_muzzle
    // 弾の y は 0。ビュー行列は 45° 傾いているので y は画面上で奥行きに
    // 化け、砲口の高さ（14）に出すと絵が当たり判定（x/z のみ）から
    // 1 タイルぶんずれる。弾を避け続ける戦いなので、砲口の高さより
    // 絵と判定の一致を取る（自機も他の弾もすべて y = 0）
    const bullet = new entity_boss_plasma_t(mx - 3, 0, mz - 2, 0, boss_bullet_tile)
    const speed = boss_bullet_speed(t._phase)
    bullet.vx = Math.cos(angle) * speed
    bullet.vz = Math.sin(angle) * speed
  }
```

`entity_boss_plasma_t` の `_init(angle)` を削除する（速度は生成側が代入するようになったため）。クラス冒頭を次にする:

```ts
export class entity_boss_plasma_t extends entity_t {
  // 速度は生成側（entity_boss_t._spawn_bullet）が vx/vz に直接代入する。
  // フェーズで弾速が変わるので、_init() の引数 1 本では足りない

  // ライトを積まない。同時に最大 40 発以上飛ぶので max_lights = 16 を超え、
```

（残りのコメントとメソッド `_expire` / `_did_collide` / `_check` はそのまま）

- [ ] **Step 5: テストと型チェックを走らせて通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add source/boss-model.ts source/boss-model.test.ts source/entity-boss.ts
git commit -m "ボスに2フェーズを入れ、摘みをフェーズの関数にする

HP が半分以下で激昂に入る。砲塔の回転・発射の刻み・弾速をフェーズの
関数に変え、boss_volleys は刻みを引数に取る形へ一般化する（追尾弾が
同じ規則を共有するため）。

弾の生成を _spawn_bullet() に一元化する。衝撃波と追尾弾が同じ経路を
使うため。"
```

---

### Task 3: 周回の摘みを `boss-model.ts` に足す

**Files:**
- Modify: `source/boss-model.ts`
- Modify: `source/boss-model.test.ts`

**Interfaces:**
- Consumes: Task 2 の `boss_phase_rage`
- Produces:
  - `boss_orbit_radius_min: number`（= 10）、`boss_orbit_radius_max: number`（= 70）
  - `boss_wander_interval: number`（= 2.5）、`boss_wander_retry_min: number`（= 0.4）
  - `boss_orbit_speed(phase: number): number`
  - `boss_pick_radius(rand: number): number`
  - `boss_pick_speed_factor(rand: number): number`
  - `boss_radius_step(current: number, target: number, speed: number, dt: number): number`
  - `boss_orbit_omega(speed: number, radius: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`source/boss-model.test.ts` の import に追加:

```ts
  boss_orbit_omega, boss_orbit_radius_max, boss_orbit_radius_min, boss_orbit_speed,
  boss_pick_radius, boss_pick_speed_factor, boss_radius_step,
```

末尾に追記:

```ts
describe('周回の摘み', () => {
  it('目標半径は帯の中に収まり、端を取り切る', () => {
    expect(boss_pick_radius(0)).toBe(boss_orbit_radius_min)
    expect(boss_pick_radius(1)).toBe(boss_orbit_radius_max)
    for (let i = 0; i <= 100; i++) {
      const r = boss_pick_radius(i / 100)
      expect(r).toBeGreaterThanOrEqual(boss_orbit_radius_min)
      expect(r).toBeLessThanOrEqual(boss_orbit_radius_max)
    }
  })

  it('速度係数は 1 を挟む帯に収まる', () => {
    expect(boss_pick_speed_factor(0)).toBeLessThan(1)
    expect(boss_pick_speed_factor(1)).toBeGreaterThan(1)
  })

  it('周回の線速度は激昂で上がる', () => {
    expect(boss_orbit_speed(boss_phase_rage)).toBeGreaterThan(boss_orbit_speed(1))
  })
})

describe('boss_radius_step', () => {
  it('目標へ寄る（行き過ぎない）', () => {
    expect(boss_radius_step(10, 70, 36, 1)).toBeCloseTo(28, 6) // 36 * 0.5 * 1
    expect(boss_radius_step(70, 10, 36, 1)).toBeCloseTo(52, 6)
  })

  it('1 フレームで届くなら目標そのものになる', () => {
    expect(boss_radius_step(10, 10.5, 36, 1)).toBe(10.5)
    expect(boss_radius_step(10, 10, 36, 1)).toBe(10)
  })
})

describe('boss_orbit_omega', () => {
  it('線速度が半径に依らず保たれる（ω = v / r）', () => {
    for (const r of [10, 20, 40, 70]) {
      expect(boss_orbit_omega(36, r) * r).toBeCloseTo(36, 6)
    }
  })

  it('半径が下限を下回っても発散しない', () => {
    expect(boss_orbit_omega(36, 0)).toBe(36 / boss_orbit_radius_min)
    expect(boss_orbit_omega(36, -5)).toBe(36 / boss_orbit_radius_min)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/boss-model.test.ts -t "周回"`
Expected: FAIL — `boss_pick_radius is not a function`

- [ ] **Step 3: `boss-model.ts` に実装する**

末尾に追記する:

```ts
// 周回の目標半径の帯（px。灰皿タイルの中心から測る）。
// 下限 10 は灰皿の上にまだ被る位置。上限 70 は、外周壁の内面（中心から
// 88px）からボスの半辺（7px）と余白を引いた値 — 壁に張り付くと自機が
// 背後を取れなくなる。柱リング（半径 8 タイル）を跨ぐ帯なので、ボスは
// 隙間を通って内外を行き来する
export const boss_orbit_radius_min = 10
export const boss_orbit_radius_max = 70

// 目標を引き直す間隔（秒）
export const boss_wander_interval = 2.5
// 柱に塞がれて引き直すときの下限（秒）。置かないと、引いた先も塞がれて
// いる間は毎フレーム引き直し続け、半径がその場で震えて進まない
export const boss_wander_retry_min = 0.4

// 速度係数の帯。1 を挟むので、平均すれば基準の線速度になる
const boss_speed_factor_min = 0.7
const boss_speed_factor_max = 1.3

// 半径を目標へ寄せる速さは、周回の線速度に対する比で持つ。1 にすると
// 接線方向と動径方向が同じ速さになり、合成速度が基準の 1.41 倍まで出る。
// 0.5 なら 1.12 倍に収まり、docs が示す線速度の帯と食い違わない
const boss_radius_speed_factor = 0.5

// 周回の線速度（px/s）。角速度ではなく線速度を一定にする — 角速度を
// 一定にすると半径 10 と 70 で線速度が 7 倍違い、同じ相手が半径によって
// 別の速さで動いて見える。自機の約 130 に対して十分遅く、逃げ切れる
export function boss_orbit_speed(phase: number): number {
  return phase === boss_phase_rage ? 54 : 36
}

// rand は [0, 1] を呼び出し側が渡す（テストで決定的にするため）
export function boss_pick_radius(rand: number): number {
  return boss_orbit_radius_min +
    rand * (boss_orbit_radius_max - boss_orbit_radius_min)
}

export function boss_pick_speed_factor(rand: number): number {
  return boss_speed_factor_min +
    rand * (boss_speed_factor_max - boss_speed_factor_min)
}

export function boss_radius_step(
  current: number, target: number, speed: number, dt: number,
): number {
  const max = speed * boss_radius_speed_factor * dt
  const delta = target - current
  return Math.abs(delta) <= max ? target : current + Math.sign(delta) * max
}

// 角速度は線速度から導く。半径が 0 に近いと発散するので下限で割る
export function boss_orbit_omega(speed: number, radius: number): number {
  return speed / Math.max(radius, boss_orbit_radius_min)
}
```

- [ ] **Step 4: テストを走らせて通ることを確認**

Run: `npx vitest run source/boss-model.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add source/boss-model.ts source/boss-model.test.ts
git commit -m "ボスの周回の摘みを boss-model に足す

目標半径の帯[10,70]、速度係数、半径の寄せ、角速度の導出。角速度では
なく線速度を一定にする(ω = v / r)。角速度一定だと半径10と70で線速度が
7倍違い、同じ相手が半径によって別の速さで動いて見える。"
```

---

### Task 4: 追尾弾の旋回と摘みを `boss-model.ts` に足す

**Files:**
- Modify: `source/boss-model.ts`
- Modify: `source/boss-model.test.ts`

**Interfaces:**
- Consumes: Task 2 の `boss_phase_rage`
- Produces:
  - `boss_homing_step: number`（= 1.4）、`boss_homing_count: number`（= 2）
  - `boss_homing_spread: number`（= 0.25）、`boss_homing_turn_rate: number`（= 1.6）
  - `boss_homing_life: number`（= 5）
  - `boss_homing_speed(phase: number): number`
  - `boss_homing_turn(vx, vz, dx, dz, turn_rate, dt): [number, number]`

- [ ] **Step 1: 失敗するテストを書く**

`source/boss-model.test.ts` の import に追加:

```ts
  boss_homing_life, boss_homing_speed, boss_homing_step, boss_homing_turn,
  boss_homing_turn_rate,
```

末尾に追記:

```ts
describe('boss_homing_turn', () => {
  const mag = (v: [number, number]) => Math.sqrt(v[0] * v[0] + v[1] * v[1])

  it('速度の大きさを変えない', () => {
    const out = boss_homing_turn(44, 0, 0, 1, 1.6, 1 / 60)
    expect(mag(out)).toBeCloseTo(44, 6)
  })

  it('目標の方向へ寄る', () => {
    // +x へ飛んでいる弾に、+z 方向の目標を与える
    const [vx, vz] = boss_homing_turn(44, 0, 0, 100, 1.6, 1 / 60)
    expect(vz).toBeGreaterThan(0)
    expect(vx).toBeGreaterThan(0) // 1 フレームで振り向き切らない
  })

  it('1 フレームの旋回角が上限を超えない', () => {
    const dt = 1 / 60
    // 真後ろ（180°）の目標でも上限ぶんしか回らない
    const [vx, vz] = boss_homing_turn(44, 0, -100, 0.001, 1.6, dt)
    const turned = Math.abs(Math.atan2(vz, vx))
    expect(turned).toBeLessThanOrEqual(1.6 * dt + 1e-9)
  })

  it('回る向きは近いほうを選ぶ（-π〜π で正規化する）', () => {
    // わずかに -z 側の目標。+z 側へ大回りしてはいけない
    const [, vz] = boss_homing_turn(44, 0, 100, -1, 1.6, 1 / 60)
    expect(vz).toBeLessThan(0)
  })

  it('十分な時間をかければ目標の方向へ収束する', () => {
    let v: [number, number] = [44, 0]
    for (let i = 0; i < 600; i++) {
      v = boss_homing_turn(v[0], v[1], 0, 100, 1.6, 1 / 60)
    }
    expect(Math.atan2(v[1], v[0])).toBeCloseTo(Math.PI / 2, 4)
  })
})

describe('追尾弾の摘み', () => {
  it('掃射より遅く、激昂で速くなる', () => {
    expect(boss_homing_speed(1)).toBeLessThan(boss_bullet_speed(1))
    expect(boss_homing_speed(boss_phase_rage))
      .toBeGreaterThan(boss_homing_speed(1))
  })

  it('刻みは掃射と桁が離れている（別の攻撃として読める）', () => {
    expect(boss_homing_step).toBeGreaterThan(boss_fire_step(1) * 5)
  })

  it('寿命と旋回速度は深度で動かさない定数である', () => {
    expect(typeof boss_homing_life).toBe('number')
    expect(typeof boss_homing_turn_rate).toBe('number')
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/boss-model.test.ts -t "追尾"`
Expected: FAIL — `boss_homing_turn is not a function`

- [ ] **Step 3: `boss-model.ts` に実装する**

末尾に追記する:

```ts
// 追尾弾。掃射と同じ「掃引した角度」で刻む（時間で刻む別のタイマーを
// 持ち込まない）。刻みは掃射の 0.18 と桁を離してあるので、2 つは別の
// 攻撃として読める。前半で約 2.8 秒ごと、激昂では砲塔が速くなるぶん
// 自動的に約 1.87 秒ごとになる — 摘みを増やさずに頻度が上がる
export const boss_homing_step = 1.4

// 1 回に出す数。深度で増やさない。増やすと深度スケールの軸が 2 本になり、
// 「回転速度と弾速を一緒に動かさない」（docs/enemies.md）と同じ二重スケールの
// 問題が再発する
export const boss_homing_count = 2

// 2 発を自機方向から左右へ開く角（rad）
export const boss_homing_spread = 0.25

// 旋回速度（rad/s）。速度 44 との組で旋回半径 27.5px になる。曲がれるが、
// 自機（約 130）が全力で離れれば必ず振り切れる
export const boss_homing_turn_rate = 1.6

// 寿命（秒）。壁で消える掃射と違い、開けた場所では永久に追い続けて溜まる
export const boss_homing_life = 5

// 掃射（56）より遅い。追尾弾は「横によける」ではなく「振り切る」弾なので、
// 速いと理不尽になる
export function boss_homing_speed(phase: number): number {
  return phase === boss_phase_rage ? 55 : 44
}

// 速度ベクトルを目標方向へ、1 フレームぶんの上限まで回す。速度の大きさは
// 変えない（速さは boss_homing_speed が持つ）
export function boss_homing_turn(
  vx: number, vz: number, dx: number, dz: number, turn_rate: number, dt: number,
): [number, number] {
  const speed = Math.sqrt(vx * vx + vz * vz)
  const current = Math.atan2(vz, vx)
  let delta = Math.atan2(dz, dx) - current
  // -π〜π に正規化してから上限で切る。しないと、わずかに逆側の目標へ
  // ほぼ一周ぶん遠回りして回ることになる
  while (delta > Math.PI) { delta -= Math.PI * 2 }
  while (delta < -Math.PI) { delta += Math.PI * 2 }
  const max = turn_rate * dt
  const angle = current + Math.max(-max, Math.min(max, delta))
  return [Math.cos(angle) * speed, Math.sin(angle) * speed]
}
```

- [ ] **Step 4: テストを走らせて通ることを確認**

Run: `npx vitest run source/boss-model.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add source/boss-model.ts source/boss-model.test.ts
git commit -m "追尾弾の旋回と摘みを boss-model に足す

掃引角で刻む(1.4rad)。速度44・旋回速度1.6rad/s・寿命5秒。数を深度で
増やさないのは、深度スケールの軸を砲口の本数だけに保つため。"
```

---

### Task 5: ボス専用の 14×14 壁判定と座席の免除

**Files:**
- Modify: `source/entity-boss.ts`
- Create: `source/entity-boss.test.ts`

**Interfaces:**
- Consumes: Task 1 の `boss_centre` / `boss_hitbox`
- Produces: `entity_boss_t` に `_home_x` / `_home_z` / `_home_tx` / `_home_tz`（いずれも `number`）と、`protected override _collides(x, z): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-boss.test.ts` を新規作成する。

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer は dom.ts 経由で document と canvas に触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_quad: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
// audio は AudioContext をモジュール初期化時に生成するため同様
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
}))
vi.mock('./terminal', () => ({ terminal_show_notice: vi.fn() }))
vi.mock('./monologue', () => ({
  monologue_boss_kill: vi.fn(),
  monologue_death: vi.fn(),
  monologue_drone_kill: vi.fn(),
}))
vi.mock('./screen-slash', () => ({ screen_slash: () => {} }))
// 報酬ダイアログは DOM を組む
vi.mock('./boss-reward', () => ({ boss_reward_show: vi.fn() }))

import { boss_centre, boss_hitbox } from './boss-model'
import { entity_boss_t } from './entity-boss'
import { entity_player_t } from './entity-player'
import { level_data, level_width, state } from './state'

// タイル座標に壁（値 8）を立てる
function wall(tx: number, tz: number): void {
  level_data[tx + tz * level_width] = 8
}

// ボスを 1 体、指定のタイルの中心に立てる。座席はそのタイルになる
function spawn_boss(tx: number, tz: number): entity_boss_t {
  const boss = new entity_boss_t(
    tx * 8 + 4 - boss_centre, 0, tz * 8 + 4 - boss_centre, 0, 45,
  )
  boss._spin = 1
  boss._arms = 2
  return boss
}

// _collides は protected。テストはサブクラス経由で呼ぶ（既存の流儀）
class probe_boss_t extends entity_boss_t {
  collides_at(x: number, z: number): boolean {
    return this._collides(x, z)
  }
}

describe('ボスの壁判定', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.kills = 0
    state.boss_alive = 1
    state.boss_levels = []
    vi.clearAllMocks()
    const player = new entity_player_t(8, 0, 8, 5, 18)
    state.entity_player = player
  })

  it('座席（生成時に居た灰皿タイル）は壁でも通過できる', () => {
    wall(20, 20) // 灰皿タイル
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    expect(boss.collides_at(boss.x, boss.z)).toBe(false)
  })

  it('座席以外の壁タイルは通れない', () => {
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    wall(24, 20)
    // 判定の右端が 24 列に届く位置へ
    expect(boss.collides_at(24 * 8 - boss_hitbox + 1, 20 * 8)).toBe(true)
  })

  it('真ん中の列にある壁を見落とさない（四隅だけでは足りない）', () => {
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    // 判定 14px を x = 8k+7 に置くと 3 タイル列（k, k+1, k+2）にまたがる。
    // 四隅だけを見る実装だと真ん中の k+1 列を見落とす
    const x = 30 * 8 + 7
    const z = 30 * 8 + 7
    wall(31, 31)
    expect(boss.collides_at(x, z)).toBe(true)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/entity-boss.test.ts`
Expected: FAIL — `boss.collides_at` が基底の 6×4 実装を呼ぶため、「座席は通過できる」と「真ん中の列」の 2 件が落ちる

- [ ] **Step 3: `entity-boss.ts` に座席と専用の壁判定を実装する**

`entity-boss.ts` の import に `level_data` と `level_width` を足す:

```ts
import { level_data, level_width, state } from './state'
```

`entity_boss_t` のフィールド群（`_hp_max` の後）に追記する:

```ts
  // 座席。判定と絵が共有する中心の、生成時の位置（＝灰皿タイルの中心）。
  // 周回はここを原点にする。フィールド初期化子は基底 constructor の後に
  // 走るので this.x を読める（entity_sentry_t._target_x と同じ手）
  _home_x = this.x + boss_centre
  _home_z = this.z + boss_centre
  // 座席のタイル座標。灰皿は壁タイルとして立っているので、免除しないと
  // 生まれた瞬間から壁の中にいることになる。非常口も同じタイル値（8）を
  // 持つのでタイル値では区別できず、位置で覚える
  _home_tx = (this.x + boss_centre) >> 3
  _home_tz = (this.z + boss_centre) >> 3
```

`_receive_damage()` の前に追記する:

```ts
  // 判定 14×14 が覆うタイル範囲を走査する。基底の実装は x・x+6・z・z+4 の
  // 四隅を見る 6×4 固定で this.w を読まないため、ボスには使えない。
  // 四隅だけを見る形にもできない — 14px は最大 3 タイル列にまたがるので、
  // 真ん中の列にある壁を見落とす
  protected override _collides(x: number, z: number): boolean {
    const t = this
    const tx1 = (x + t.w) >> 3
    const tz1 = (z + t.w) >> 3
    for (let tz = z >> 3; tz <= tz1; tz++) {
      for (let tx = x >> 3; tx <= tx1; tx++) {
        if (tx === t._home_tx && tz === t._home_tz) { continue }
        if (level_data[tx + tz * level_width] > 7) { return true }
      }
    }
    return false
  }
```

- [ ] **Step 4: テストを走らせて通ることを確認**

Run: `npx vitest run source/entity-boss.test.ts && npm run typecheck`
Expected: PASS（3 件すべて）

- [ ] **Step 5: コミット**

```bash
git add source/entity-boss.ts source/entity-boss.test.ts
git commit -m "ボスに14x14の専用壁判定と座席の免除を足す

基底の _collides は6x4固定で this.w を読まないため使えない。四隅だけの
走査でも足りない(14pxは最大3タイル列にまたがり真ん中を見落とす)。
灰皿は壁タイルなので、生成時のタイルだけ通過可能に扱う。"
```

---

### Task 6: ボスを周回で動かす（浮遊化）

このタスクの完了時点で、ボスは灰皿を離れる。**灰皿に触れても無反応になる退行がここで入り、Task 12 で埋まる。** レビュー時にこれを欠陥として扱わないこと。

**Files:**
- Modify: `source/entity-boss.ts`
- Modify: `source/entity-boss.test.ts`
- Modify: `docs/enemies.md`（「据え置き」の 1 文だけ。全面更新は Task 13）

**Interfaces:**
- Consumes: Task 3 の周回の摘み、Task 5 の `_collides` / `_home_x` / `_home_z`
- Produces: `entity_boss_t` は毎フレーム `x` / `z` を更新する

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-boss.test.ts` の `./boss-model` の import 行を差し替える（同じモジュールから 2 本目の import 文を作らない）:

```ts
import {
  boss_centre, boss_hitbox, boss_orbit_radius_max, boss_orbit_radius_min,
} from './boss-model'
```

末尾に追記する:

```ts
describe('ボスの周回', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.boss_alive = 1
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  function radius(boss: entity_boss_t): number {
    const dx = boss.x + boss_centre - boss._home_x
    const dz = boss.z + boss_centre - boss._home_z
    return Math.sqrt(dx * dx + dz * dz)
  }

  it('毎フレーム位置が動く', () => {
    const boss = spawn_boss(20, 20)
    const x0 = boss.x
    const z0 = boss.z
    for (let i = 0; i < 30; i++) { boss._update() }
    expect(boss.x !== x0 || boss.z !== z0).toBe(true)
  })

  it('座席からの距離が目標半径の帯の中に収まる', () => {
    const boss = spawn_boss(20, 20)
    for (let i = 0; i < 60 * 30; i++) {
      boss._update()
      // 下限は「寄っていく途中」があるので 0 から許すが、上限は超えない
      expect(radius(boss)).toBeLessThanOrEqual(boss_orbit_radius_max + 1)
    }
  })

  it('十分な時間で座席から離れる（灰皿に居座り続けない）', () => {
    const boss = spawn_boss(20, 20)
    let max_r = 0
    for (let i = 0; i < 60 * 30; i++) {
      boss._update()
      max_r = Math.max(max_r, radius(boss))
    }
    expect(max_r).toBeGreaterThan(boss_orbit_radius_min)
  })

  it('壁に囲まれていても壁の中へ入らない', () => {
    // 座席の周りを壁で囲む
    for (let tz = 18; tz <= 22; tz++) {
      for (let tx = 18; tx <= 22; tx++) {
        if (tx === 20 && tz === 20) { continue }
        wall(tx, tz)
      }
    }
    const boss = spawn_boss(20, 20)
    for (let i = 0; i < 60 * 10; i++) {
      boss._update()
      // 座席タイルの中に留まっているはず（判定が座席から出られない）
      expect(boss._home_tx).toBe(20)
      const tx1 = (boss.x + boss.w) >> 3
      const tz1 = (boss.z + boss.w) >> 3
      for (let tz = boss.z >> 3; tz <= tz1; tz++) {
        for (let tx = boss.x >> 3; tx <= tx1; tx++) {
          if (tx === 20 && tz === 20) { continue }
          expect(level_data[tx + tz * level_width]).toBeLessThan(8)
        }
      }
    }
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/entity-boss.test.ts -t "周回"`
Expected: FAIL — 「毎フレーム位置が動く」が落ちる（現在の `_update()` は位置を触らない）

- [ ] **Step 3: 周回を実装する**

`entity-boss.ts` の import に周回の摘みを足す:

```ts
import {
  boss_arm_angles, boss_bullet_speed, boss_centre, boss_fire_step, boss_hitbox,
  boss_hp, boss_orbit_omega, boss_orbit_radius_min, boss_orbit_speed,
  boss_phase, boss_phase_rage, boss_pick_radius, boss_pick_speed_factor,
  boss_radius_step, boss_spin_rate, boss_volleys, boss_wander_interval,
  boss_wander_retry_min,
} from './boss-model'
```

フィールドに追記する（`_home_tz` の後）:

```ts
  // 周回の目標。周回角と半径そのものは位置から毎フレーム導くので持たない。
  // 別に持つと、柱に塞がれて動けなかったフレームで持っている角と実際の
  // 位置がずれ、抜けた瞬間に飛ぶ
  private _radius_target = boss_pick_radius(Math.random())
  private _speed_factor = boss_pick_speed_factor(Math.random())
  private _wander_timer = boss_wander_interval
```

`_update()` の先頭に `t._move()` を足す（掃射の前に位置を決める。銃口の位置が同じフレームの位置と一致する）:

```ts
  override _update(): void {
    const t = this
    t._move()

    const swept_before = t._swept
    t._swept += boss_spin_rate(t._phase) * state.time_elapsed
    // 砲塔の向き。フレームを跨いで持つ状態は _swept だけで足りる
    const facing = t._swept * t._spin

    const volleys = boss_volleys(swept_before, t._swept, boss_fire_step(t._phase))
    for (let v = 0; v < volleys; v++) {
      for (const angle of boss_arm_angles(facing, t._arms)) {
        t._spawn_bullet(angle)
      }
    }

    // 基底の _update() は呼ばない。加速度で動かさないので積分が要らず、
    // 壁は _move() が専用の _collides() で自分で見る
  }

  // 座席を中心に回りながら、目標半径へ寄る。柱には衝突して滑る
  private _move(): void {
    const t = this
    const dt = state.time_elapsed
    const speed = boss_orbit_speed(t._phase) * t._speed_factor

    t._wander_timer -= dt
    if (t._wander_timer <= 0) { t._repick(boss_wander_interval) }

    const dx = t.x + boss_centre - t._home_x
    const dz = t.z + boss_centre - t._home_z
    const radius = Math.max(
      Math.sqrt(dx * dx + dz * dz), boss_orbit_radius_min,
    )
    const angle = Math.atan2(dz, dx) +
      boss_orbit_omega(speed, radius) * t._spin * dt
    const next = boss_radius_step(radius, t._radius_target, speed, dt)

    const nx = t._home_x + Math.cos(angle) * next - boss_centre
    const nz = t._home_z + Math.sin(angle) * next - boss_centre

    // 全体が塞がれていても、x だけ / z だけなら通れることが多い。基底の
    // _update() と同じ滑りで、擦りながら回り込む動きがこれで出る
    if (!t._collides(nx, nz)) {
      t.x = nx
      t.z = nz
    } else if (!t._collides(nx, t.z)) {
      t.x = nx
    } else if (!t._collides(t.x, nz)) {
      t.z = nz
    } else {
      // どちらの軸でも通れない。専用の脱出挙動は作らず、目標を引き直して
      // 次のフレームに別の半径を試す
      t._repick(boss_wander_retry_min)
    }
  }

  private _repick(interval: number): void {
    const t = this
    t._radius_target = boss_pick_radius(Math.random())
    t._speed_factor = boss_pick_speed_factor(Math.random())
    t._wander_timer = interval
  }
```

- [ ] **Step 4: 浮遊砲台としてコメントを直す**

`entity-boss.ts` の冒頭コメント（`// 灰皿撤去ユニット。…` のブロック）を差し替える:

```ts
// 灰皿撤去ユニット。深度が 5 の倍数のフロアで、中央の灰皿の上に生まれる。
// 倒すまで一服できない（entity-smoking-area.ts が state.boss_alive を見る）。
//
// 据え置きではなく、床から低く浮いた機体である。浮いている高さは柱より
// 低いので、柱は依然として遮蔽として効く。この像が要るのは、灰皿ブロック
// （壁タイル）の上に居られることと、柱（壁タイル）は越えられないことを
// 同時に成立させる唯一の読み方だから。
//
// 砲口が等角に並んだまま全体が回り、掃引が一定角度進むごとに全砲口から
// 1 発ずつ吐く。加えて座席を中心に周回するので、柱の陰（安全地帯）は
// 「回る」だけでなく「動く」。自機は陰を追い続けることになり、回りながら
// 撃ち返す形は docs/gameplay.md「操作」の後退射撃そのもので、膠着が
// 構造的に起きない。
```

`boss_body_y` のコメントを差し替える:

```ts
// 本体の足元の高さ。灰皿ブロック（高さ 8）と同じ高さで浮くので、座席に
// 居るときは「灰皿に座り込んだ大型機」に、離れたときは「低く浮いて動く
// 大型機」に読める。衝突判定は x/z だけなのでこれは見た目専用の値
// （弾は y = 0 に出す。理由は _spawn_bullet()）
const boss_body_y = 8
```

`_receive_damage()` のノックバックのコメントを差し替える:

```ts
    // ノックバックを受けない。浮いていても軽くはないことが被弾の反応で
    // 読める（docs/enemies.md「被弾のノックバックは硬さの表現である」）
```

`_check()` のコメントを差し替える:

```ts
  override _check(other: entity_t): void {
    // 触れば削られる。座席に居る間は灰皿へ詰めること自体が塞がれ、離れて
    // からは動く脅威になる
    if (other instanceof entity_player_t) {
      other._receive_damage(this, 1)
    }
  }
```

- [ ] **Step 5: `docs/enemies.md` の「据え置き」の記述を直す**

`docs/enemies.md` の「ボス（灰皿撤去ユニット）」節の 1 段落目にある

> 中央に固定で、移動もせず被弾のノックバックも受けない — 据え置きの砲台であることが被弾の反応で読める

を次に差し替える（節全体の更新は Task 13 で行う）:

> 床から低く浮いて座席（中央の灰皿）を中心に周回し、被弾のノックバックは受けない — 浮いていても軽くはないことが被弾の反応で読める

- [ ] **Step 6: テストを走らせて通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 実機で動きを見る**

Run: `npm run dev`
確認すること:
1. ボス階に着くまで潜る（開発中は `source/game.ts` の `run_start` で `state.depth` を一時的に 4 にして非常口を 1 回通ると早い。**確認後に必ず戻すこと**）
2. ボスが灰皿の周りを回り、柱リングの内外を行き来する
3. 柱に食い込まない・柱の中で止まり続けない
4. 空中に浮いた絵が不自然でない

- [ ] **Step 8: コミット**

```bash
git add source/entity-boss.ts source/entity-boss.test.ts docs/enemies.md
git commit -m "ボスを周回で動かし、浮遊砲台に読み替える

座席(生成時の灰皿タイル)を中心に、線速度一定で周回しながら目標半径へ
寄る。柱には衝突して x だけ/z だけの滑りで回り込み、両方塞がれたら
目標を引き直す。周回角と半径は位置から毎フレーム導く(別に持つと、
塞がれたフレームでずれて抜けた瞬間に飛ぶ)。

据え置きから低く浮いた機体へ読み替える。灰皿ブロックの上に居られる
ことと柱を越えられないことを同時に成立させる唯一の読み方。

この時点でボスが灰皿を離れるため、灰皿に触れても無反応になる。
セリフでの埋めは後続のコミットで行う。"
```

---

### Task 7: full-bright 規則に水色を加え、タイル 49 を焼く

**Files:**
- Modify: `source/renderer.ts:70`
- Modify: `tools/boss_tiles.py`
- Modify: `m/q2.png`（ツールが焼く）

**Interfaces:**
- Consumes: なし
- Produces: アトラスのタイル 49 が水色の点になる。シェーダが `b>0.95 && g>0.25 && r==0` の texel を full-bright で描く

- [ ] **Step 1: シェーダに条件を足す**

`source/renderer.ts:70` の 1 行を差し替える:

```ts
    // 2) 霧もライトも受けない色。赤（蜘蛛の目・ボスの掃射）と
    //    水色（ボスの追尾弾）の 2 つ。闘技場の端でも全弾が見えることが
    //    要件なので、弾はここを通す（docs/gameplay.md「ボス階」）
    "if((t.r>0.95&&t.g>0.25&&t.b==0.0)||(t.b>0.95&&t.g>0.25&&t.r==0.0))" +
```

- [ ] **Step 2: `tools/boss_tiles.py` に追尾弾を足す**

docstring を差し替える:

```python
"""m/q2.png のタイル 46・49 を焼き込む。

使い方: uv run --with pillow python -X utf8 tools/boss_tiles.py

46（ボスの掃射）と 49（ボスの追尾弾）は絵ではなく単色の点なので、
tools/slash_tiles.py と同じくコードが原本になる。何度流しても同じ結果に
なる（冪等）。

46 の色は既存の敵の赤 (255,66,0) — 蜘蛛（27）とセントリー（32）の目に
使われているまさにその色で、フラグメントシェーダの full-bright 規則
（r>0.95 && g>0.25 && b==0）を満たす。

49 は水色で、同じシェーダに足したもう 1 本の規則
（b>0.95 && g>0.25 && r==0）を満たす。掃射と同じ赤の帯に置くと弾が密な
ときに埋もれるため、帯の外へ出す必要がある。追尾弾は「横によける」では
なく「振り切る」弾なので、一目で別物と分かることに価値がある。

この規則を満たす texel はライトも霧も通さないので、弾は push_light()
なしで等しく明るく見える。ボスの弾は同時に 40 発以上飛び、
max_lights = 16 には載せられないため、これが唯一の経路。

45（ボス本体）は tools/atlas.py で画像から焼き込まれており、m/q2.png が
唯一の原本になる。この tool は 45 を変更しない。
"""
```

定数部を差し替える:

```python
BULLET_TILE = 46
HOMING_TILE = 49

# full-bright 規則（r>0.95 && g>0.25 && b==0）を満たす 2 色。
# 外周は敵の赤、芯だけ橙に寄せて厚みを出す
BULLET_EDGE = (255, 66, 0)
BULLET_CORE = (255, 150, 0)
# もう 1 本の規則（b>0.95 && g>0.25 && r==0）を満たす 2 色。
# g を 102 と 220 に取るのは、下限 64 を確実に超えつつ水色に見せるため
HOMING_EDGE = (0, 102, 255)
HOMING_CORE = (0, 220, 255)
BULLET_RADIUS = 3.2
BULLET_CORE_RADIUS = 1.6
```

`bake_bullet` を色を引数に取る形へ一般化し、`main` から 2 回呼ぶ:

```python
def bake_dot(pixels, tile: int, edge, core) -> None:
    ox = tile * TILE_SIZE
    clear(pixels, tile)
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            dx = x - 7.5
            dy = y - 7.5
            d = (dx * dx + dy * dy) ** 0.5
            if d <= BULLET_CORE_RADIUS:
                pixels[ox + x, y] = (*core, 255)
            elif d <= BULLET_RADIUS:
                pixels[ox + x, y] = (*edge, 255)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    pixels = atlas.load()
    bake_dot(pixels, BULLET_TILE, BULLET_EDGE, BULLET_CORE)
    bake_dot(pixels, HOMING_TILE, HOMING_EDGE, HOMING_CORE)
    atlas.save(ATLAS)
    print(f'baked tiles {BULLET_TILE}, {HOMING_TILE} into {ATLAS}')
```

- [ ] **Step 3: ツールを走らせる**

Run: `uv run --with pillow python -X utf8 tools/boss_tiles.py`
Expected: `baked tiles 46, 49 into ...m/q2.png`

- [ ] **Step 4: 新しい規則が既存のアトラスを誤爆していないことを確認**

Run:

```bash
uv run --with pillow python -X utf8 -c "
from PIL import Image
im = Image.open('m/q2.png').convert('RGBA'); px = im.load(); w,h = im.size
hits = {}
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a >= 204 and b > 242 and g > 63 and r == 0:
            hits.setdefault(x//16, 0)
            hits[x//16] += 1
print('tiles matching cyan rule:', sorted(hits.items()))
"
```

Expected: `tiles matching cyan rule: [(49, <正の数>)]` — 49 だけが並ぶこと。他のタイルが出たらそのタイルの色を確認し、規則を満たしてしまう texel を潰すか色の下限を上げる

- [ ] **Step 5: 型チェックとテストを走らせる**

Run: `npm test && npm run typecheck`
Expected: PASS（シェーダは文字列なのでテストは触らない）

- [ ] **Step 6: コミット**

```bash
git add source/renderer.ts tools/boss_tiles.py m/q2.png
git commit -m "full-bright規則に水色を加え、追尾弾のタイル49を焼く

シェーダに b>0.95 && g>0.25 && r==0 を1本足す。掃射と同じ赤の帯に置くと
弾が密なときに埋もれるため、追尾弾は帯の外へ出す必要がある。
既存アトラス64タイルを全走査し、この規則を誤って満たす texel が
1つもないことを確認済み。"
```

---

### Task 8: 追尾弾

**Files:**
- Modify: `source/entity-boss.ts`
- Modify: `source/entity-boss.test.ts`

**Interfaces:**
- Consumes: Task 4 の追尾の摘み、Task 7 のタイル 49、Task 2 の `_spawn_bullet` の並び
- Produces: `entity_boss_homing_t`（`entity_boss_plasma_t` の派生）

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-boss.test.ts` の 2 本の import 行を差し替える（`./boss-model` へ `boss_homing_life` を足し、`./entity-boss` へ 2 クラスを足す）:

```ts
import {
  boss_centre, boss_hitbox, boss_homing_life, boss_orbit_radius_max,
  boss_orbit_radius_min,
} from './boss-model'
import { entity_boss_homing_t, entity_boss_plasma_t, entity_boss_t } from './entity-boss'
```

末尾に追記:

```ts
describe('追尾弾', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.boss_alive = 1
    state.boss_levels = []
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  function homing(): entity_boss_homing_t[] {
    return state.entities.filter(
      (e): e is entity_boss_homing_t => e instanceof entity_boss_homing_t && !e._dead,
    )
  }

  it('掃引が刻みをまたぐと 2 発出る', () => {
    const boss = spawn_boss(20, 20)
    // 掃引が boss_homing_step を越えるまで回す
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    expect(homing().length).toBe(2)
  })

  it('掃射よりずっと少ない頻度で出る', () => {
    const boss = spawn_boss(20, 20)
    for (let i = 0; i < 60 * 6; i++) { boss._update() }
    const sweep = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t && !(e instanceof entity_boss_homing_t),
    ).length
    expect(homing().length).toBeLessThan(sweep)
  })

  it('自機のほうへ曲がる', () => {
    const boss = spawn_boss(20, 20)
    // 自機を +z の遠方に置く。弾は生成時に自機方向を向くので、
    // ここでは自機を動かして「曲がる」ことを見る
    state.entity_player!.x = 20 * 8
    state.entity_player!.z = 20 * 8 + 200
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    const bullet = homing()[0]
    // 自機を反対側へ動かす
    state.entity_player!.z = 20 * 8 - 200
    const before = bullet.vz
    for (let i = 0; i < 30; i++) { bullet._update() }
    expect(bullet.vz).toBeLessThan(before)
  })

  it('寿命で消える', () => {
    const boss = spawn_boss(20, 20)
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    const bullet = homing()[0]
    state.time_elapsed = boss_homing_life + 0.1
    bullet._update()
    expect(bullet._dead).toBe(true)
  })

  it('撃破で掃射と一緒に消える', () => {
    const boss = spawn_boss(20, 20)
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    expect(homing().length).toBeGreaterThan(0)
    boss._receive_damage(boss, boss._hp_max)
    expect(homing().length).toBe(0)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/entity-boss.test.ts -t "追尾弾"`
Expected: FAIL — `entity_boss_homing_t` が存在しない（import エラー）

- [ ] **Step 3: 追尾弾を実装する**

`entity-boss.ts` の import に追加:

```ts
import {
  ..., boss_homing_count, boss_homing_life, boss_homing_speed, boss_homing_spread,
  boss_homing_step, boss_homing_turn, boss_homing_turn_rate, ...
} from './boss-model'
```

タイル定数の隣に追記:

```ts
const boss_bullet_tile = 46
const boss_homing_tile = 49
```

`_update()` の掃射のループの後に追尾弾の発射を足す:

```ts
    const homing = boss_volleys(swept_before, t._swept, boss_homing_step)
    for (let v = 0; v < homing; v++) { t._spawn_homing() }
```

`_spawn_bullet()` の後に追記:

```ts
  // 自機の方向へ、左右へ開いて 2 発。掃射と同じ銃口の半径から出す
  // （中から出すと生まれた次のフレームで壁判定に消える）
  private _spawn_homing(): void {
    const t = this
    const player = state.entity_player
    if (!player) { return }
    const base = Math.atan2(
      player.z - (t.z + boss_centre), player.x - (t.x + boss_centre),
    )
    const speed = boss_homing_speed(t._phase)
    for (let i = 0; i < boss_homing_count; i++) {
      // 本数の中央を 0 にずらして左右対称に開く
      const angle = base +
        (i - (boss_homing_count - 1) / 2) * boss_homing_spread * 2
      const mx = t.x + boss_centre + Math.cos(angle) * boss_muzzle
      const mz = t.z + boss_centre + Math.sin(angle) * boss_muzzle
      const bullet = new entity_boss_homing_t(mx - 3, 0, mz - 2, 0, boss_homing_tile)
      bullet.vx = Math.cos(angle) * speed
      bullet.vz = Math.sin(angle) * speed
    }
  }
```

`_kill()` の残弾掃除のコメントを差し替える（`instanceof entity_boss_plasma_t` は追尾弾も拾う）:

```ts
    // 残弾を消す。消さないと、勝った直後に流れ弾で一服が中断され
    // （docs/gameplay.md「一服」）、勝利の実感が濁る。
    // 追尾弾は entity_boss_plasma_t の派生なので、この 1 本の判定で
    // 掃射と一緒に拾える
```

ファイル末尾の `drop_container` の前に追尾弾のクラスを追記する:

```ts
// 追尾弾。掃射（entity_boss_plasma_t）の派生にしてあるのは、撃破時の
// 残弾掃除がその 1 本の instanceof で走っているため。壁で消える・接触で
// 1 ダメージという性質も共通で、素直に is-a である
export class entity_boss_homing_t extends entity_boss_plasma_t {
  private _life = boss_homing_life

  override _update(): void {
    const t = this
    t._life -= state.time_elapsed
    if (t._life <= 0) {
      // 壁で消える掃射と違い、開けた場所では永久に追い続けて溜まる。
      // O(n²) の衝突ループに乗る弾の数を抑える意味もある
      t._expire()
      return
    }
    const player = state.entity_player
    // 死体を追わない。死亡シーケンス中に弾が寄ってくると演出が濁る
    if (player && !state.dying) {
      const [vx, vz] = boss_homing_turn(
        t.vx, t.vz,
        player.x - t.x, player.z - t.z,
        boss_homing_turn_rate, state.time_elapsed,
      )
      t.vx = vx
      t.vz = vz
    }
    // 基底（entity_t）の _update() が積分と壁判定をやる。摩擦 0 なので
    // 速度はそのまま乗る
    super._update()
  }
}
```

- [ ] **Step 4: テストを走らせて通ることを確認**

Run: `npx vitest run source/entity-boss.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 実機で確認**

Run: `npm run dev`
確認すること:
1. 水色の弾が出て、闘技場の端でも霧に沈まず明るく見える
2. 自機を追ってくるが、走れば振り切れる
3. 壁と柱で消える
4. 追わせ続けても画面が水色の弾で埋まらない（寿命が効いている）

- [ ] **Step 6: コミット**

```bash
git add source/entity-boss.ts source/entity-boss.test.ts
git commit -m "ボスに水色の追尾弾を足す

掃射と同じ掃引角で刻む(1.4rad)。自機方向へ左右に開いて2発、速度44、
旋回1.6rad/s、寿命5秒。数を深度で増やさないのは深度スケールの軸を
砲口の本数だけに保つため。

entity_boss_plasma_t の派生にしてあるのは、撃破時の残弾掃除がその1本の
instanceof で走っているため。"
```

---

### Task 9: フェーズ移行の演出

**Files:**
- Modify: `index.html`（`#bf` の CSS と div）
- Modify: `source/dom.ts`
- Create: `source/screen-flash.ts`
- Modify: `source/entity-boss.ts`
- Modify: `source/entity-boss.test.ts`

**Interfaces:**
- Consumes: Task 2 の `boss_phase` / `_hp_max` / `_phase`、Task 8 の `_spawn_bullet`
- Produces: `screen_flash(): void`。`entity_boss_t` は HP 半分で 1 度だけ移行する

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-boss.test.ts` の先頭のモック群に追加する:

```ts
vi.mock('./screen-flash', () => ({ screen_flash: vi.fn() }))
```

`./monologue` のモックに `monologue_boss_rage: vi.fn()` を追加し、import を 4 本足す（`./boss-model` と `./entity-boss` の行はそのまま。この 4 本はこのファイルに未登場）:

```ts
import { monologue_boss_rage } from './monologue'
import { camera } from './renderer'
import { screen_flash } from './screen-flash'
import { terminal_show_notice } from './terminal'
```

末尾に追記:

```ts
describe('フェーズ移行', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.kills = 0
    state.boss_alive = 1
    state.boss_levels = []
    camera.shake = 0
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  it('HP 半分で閃光・シェイク 7・通知・セリフが 1 度ずつ走る', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2)

    expect(screen_flash).toHaveBeenCalledTimes(1)
    expect(camera.shake).toBe(7)
    expect(terminal_show_notice).toHaveBeenCalledTimes(1)
    expect(monologue_boss_rage).toHaveBeenCalledTimes(1)
  })

  it('半分を割ってさらに削っても 2 度目は走らない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2)
    vi.clearAllMocks()
    boss._receive_damage(boss, 1)
    boss._receive_damage(boss, 1)

    expect(screen_flash).not.toHaveBeenCalled()
    expect(monologue_boss_rage).not.toHaveBeenCalled()
  })

  it('半分より上では走らない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2 - 1)
    expect(screen_flash).not.toHaveBeenCalled()
  })

  it('撃破のフレームでは移行しない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max)
    expect(screen_flash).not.toHaveBeenCalled()
    // 撃破のシェイクは 8（移行の 7 で上書きされていないこと）
    expect(camera.shake).toBe(8)
  })

  it('移行の瞬間に衝撃波が一斉に出る', () => {
    const boss = spawn_boss(20, 20)
    const before = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length
    boss._receive_damage(boss, boss._hp_max / 2)
    const after = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length
    expect(after - before).toBe(12)
  })

  it('移行後は掃射が速くなる', () => {
    const slow = spawn_boss(20, 20)
    for (let i = 0; i < 60; i++) { slow._update() }
    const slow_count = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length

    state.entities = []
    const fast = spawn_boss(20, 20)
    fast._receive_damage(fast, fast._hp_max / 2)
    state.entities = state.entities.filter((e) => e instanceof entity_boss_t)
    for (let i = 0; i < 60; i++) { fast._update() }
    const fast_count = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length

    expect(fast_count).toBeGreaterThan(slow_count)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/entity-boss.test.ts -t "フェーズ移行"`
Expected: FAIL — `./screen-flash` が存在しない（モックの対象がないため解決に失敗する）

- [ ] **Step 3: `index.html` にレイヤを足す**

`<style>` の `#wf` のブロックの直前に追記する:

```css
		/* ボスのフェーズ移行の合図。#wf の白フェードと同じ形の赤い全画面
		   フラッシュ。詳細は source/screen-flash.ts。z-index は #sl の下 */
		#bf{position:fixed;inset:0;background:#f30;opacity:0;pointer-events:none;z-index:18;}
		#bf.on{animation:bff .25s forwards;}
		@keyframes bff{0%{opacity:0}15%{opacity:.55}100%{opacity:0}}
		@media (prefers-reduced-motion: reduce){#bf{display:none;}}
```

`<body>` 内の `<div id="sl"></div>` の直前に 1 行足す。差し替え後はこの並びになる（z-index の 18 < 19 < 20 と読み順を揃える）:

```html
	<code id="b"></code>
	<div id="bf"></div>
	<div id="sl"></div>
	<div id="wf"></div>
	<script type="module" src="/source/main.ts"></script>
```

- [ ] **Step 4: `dom.ts` に要素を足す**

先頭のコメントの ID 一覧に `bf` を足し、末尾に追記する:

```ts
export const flash_el = document.getElementById('bf') as HTMLElement
```

コメント 1 行目を差し替える:

```ts
// index.html の要素 ID による暗黙グローバル（c / m / a / h / sn / b / wf / sl / bf）の置き換え。
```

- [ ] **Step 5: `source/screen-flash.ts` を作る**

```ts
import { flash_el } from './dom'

// ボスのフェーズ移行の合図。画面全体を赤く 1 度光らせる。
//
// screen-slash.ts（一撃必殺の決め）は使えない。あちらの実体は
// rotate(-19deg) の斜めの閃光帯で「斬った」という意味を持つ絵なので、
// 流用すると意味が濁る。
//
// CSS の層は画面の実解像度で描かれる（canvas は 320×180 を 6 倍に引き伸ばして
// いる）。画面全体のフラッシュは「別の層であるべき演出」なので、実解像度で
// 鋭いほうが正しい。#wf の白フェードと同じ位置づけ。
export function screen_flash(): void {
  flash_el.classList.remove('on')
  // 外してすぐ付け直すだけでは同じアニメーションが再生されない。レイアウトを
  // 読んでリフローを起こし、外れた状態を確定させる（screen-slash.ts と同じ）
  void flash_el.offsetWidth
  flash_el.classList.add('on')
}
```

- [ ] **Step 6: `entity-boss.ts` に移行を実装する**

import に追加:

```ts
import { screen_flash } from './screen-flash'
import { monologue_boss_kill, monologue_boss_rage } from './monologue'
```

衝撃波の本数を定数で持つ（`boss_homing_tile` の隣）:

```ts
// 移行の瞬間に全方向へ一斉放出する本数。_arms に依らない固定値にする。
// 深度で変わると掃射の一部に見え、事件として読めない
const boss_shockwave_count = 12
```

`_receive_damage()` を差し替える:

```ts
  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    // ノックバックを受けない。浮いていても軽くはないことが被弾の反応で
    // 読める（docs/enemies.md「被弾のノックバックは硬さの表現である」）
    // 中心は entity.x/z から boss_centre ぶん離れている（_render() と同じ理由）
    spawn_particles(this.x + boss_centre, this.z + boss_centre, 3)

    // 撃破のフレームでは移行させない（_kill() が既に走っていて、移行の
    // シェイク 7 が撃破の 8 を上書きしてしまう）
    if (!this._dead && this._phase !== boss_phase_rage &&
        boss_phase(this.h, this._hp_max) === boss_phase_rage) {
      this._enter_rage()
    }
  }

  // 激昂へ移る。HP バーを持たないので、この 1 回の演出が「半分削った」の
  // 合図を兼ねる
  private _enter_rage(): void {
    const t = this
    t._phase = boss_phase_rage
    const cx = t.x + boss_centre
    const cz = t.z + boss_centre

    screen_flash()
    // 序列は 蜘蛛 1 < セントリー 3 < 銘品 4 < 自機の死 5 < 清掃ドローン 6 <
    // フェーズ移行 7 < ボス撃破 8。揺れの大きさがそれ自体「何が起きたか」の
    // 合図なので、この 7 つは 1 つの尺度として一緒に見る（docs/enemies.md）
    camera.shake = 7
    spawn_particles(cx, cz, 16)

    for (let i = 0; i < boss_shockwave_count; i++) {
      t._spawn_bullet((i * Math.PI * 2) / boss_shockwave_count)
    }

    // 事実はターミナルが即時に、感情は 2 秒遅れて高木が言う（docs/story.md
    // 「声の使い分け」）。ボス自身は喋らない — 声は 2 つに保つ
    terminal_show_notice('灰皿撤去ユニット___出力制限を解除')
    monologue_boss_rage()
  }
```

`_render()` のライトを差し替える:

```ts
    // ライトを持つのは本体だけ。弾は full-bright で描くので光を要らない。
    // 板の法線は +z なので、面と同じ奥行きに置くと拡散項（頂点シェーダの
    // dot(n, lp - p)）が 0 になって自分の光で照らせない。半身ぶん手前に
    // 出すのは entity-sentry.ts の弾と同じ。
    // 激昂では赤く明るくする。HP バーを持たないので、これが「後半に入って
    // いる」ことの恒常的な印になる
    const rage = t._phase === boss_phase_rage
    push_light(
      x + half, y + half, z + half,
      rage ? 1.6 : 1.2, rage ? 0.2 : 0.4, rage ? 0.1 : 0.2, rage ? 0.04 : 0.05,
    )
```

- [ ] **Step 7: `monologue.ts` に呼び出し口を仮置きする**

Task 12 が本体を書くが、このタスクを緑にするために先に関数を作る。`source/monologue.ts` のボス撃破の関数の後に追記する（プールの中身と遅延の定数は Task 12 で確定させる）:

```ts
// ボスの激昂。世界の危機ではなく、まだ席を明け渡さないことだけに反応する
const lines_boss_rage = [
  'まだどく気はねえのか……',
  'そんなに座りたいのかよ……',
  'うるせえ、俺の番だ',
]
// フェーズ移行も同じ理由で遅らせる。値はボス撃破と同じ 2 秒だが、
// 固有の理由ではないので別の定数に持つ
const boss_rage_delay = 2

export function monologue_boss_rage(): void {
  say(lines_boss_rage, false, boss_rage_delay)
}
```

- [ ] **Step 8: テストを走らせて通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 9: 実機で確認**

Run: `npm run dev`
確認すること:
1. HP を半分削ると赤い閃光・揺れ・粒子・衝撃波が同時に出る
2. 以後ボスのライトが赤く明るいままになる
3. ターミナルに通知が出て、2 秒後に高木が喋る
4. 移行後にボスと弾が明らかに速くなる
5. 2 度目の移行が起きない

- [ ] **Step 10: コミット**

```bash
git add index.html source/dom.ts source/screen-flash.ts source/entity-boss.ts source/entity-boss.test.ts source/monologue.ts
git commit -m "フェーズ移行の演出を入れる

赤い全画面フラッシュ・シェイク7・粒子16・衝撃波12発を同時に出し、
以後ボスのライトを赤く明るいままにする(HPバーを持たないので、これが
後半に入っていることの恒常的な印になる)。

screen_slash は使えない。実体が斜めの閃光帯で「斬った」という意味を
持つ絵なので、流用すると意味が濁る。#wf と同じ形の #bf を1枚足す。

シェイクの序列に段を1つ挿す(ドローン6 < 移行7 < ボス撃破8)。"
```

---

### Task 10: ボス専用BGMの楽曲データ

**Files:**
- Create: `source/music-boss.ts`
- Modify: `source/audio-data.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `music_boss: SonantSong`

このタスクは耳で仕上げる創作作業である。数値の出発点は下に具体的に示すが、**最終的な値は試聴で決める。** 完了の判定は「構造テストが通り、ハッシュが記録され、通常BGMと聞き分けられる」こと。

- [ ] **Step 1: 通常BGMを複製して土台にする**

```bash
cp source/music-dark-meat-beat.ts source/music-boss.ts
```

`source/music-boss.ts` の中で、エクスポート名を差し替える:

```ts
export const music_boss: SonantSong = {
```

ファイル冒頭に意図のコメントを足す:

```ts
import type { SonantSong } from './sonantx-reduced'

// ボス階専用のBGM。music-dark-meat-beat.ts を土台に、テンポを上げて
// リバーブ／ディレイを詰め、頭から最も密なパターンで始まるように組み替えた
// もの。ボスのテーマは盛り上がりを待たせずに全開で始まる必要がある。
//
// 通常BGMとは別のバッファとして生成し、ボス階のロードで差し替える
// （audio.ts）。フェーズ 2 では playbackRate を上げて使い回す
```

- [ ] **Step 2: 出発点の数値を当てる**

`music-boss.ts` に次の 3 点を適用する。

1. `rowLen: 5513` → `rowLen: 4410`
   （44100 / 4410 = 1 行 0.1 秒。約 25% 速くなり、ボス戦の駆動感が出る）

2. 1 番目の楽器（`songData[0]`）の 2 つの値を締める:
   - `env_release: 100000` → `env_release: 40000`
   - `fx_delay_amt: 60` → `fx_delay_amt: 30`
   （残響を詰めて輪郭を出す。通常BGMの「漂う」質感との差がここで出る）

3. `songData` の各楽器の `p:` 配列を、いちばん密なパターン番号から始まるように回転させる。通常BGMの `songData[0].p` は `[2,3,4,5,2,3,4,5,...]` なので、たとえば `[5,4,5,3,5,4,5,3,...]` のように最も動きのあるパターン（この楽器では 5）が頭と偶数拍に来るよう並べ替える。**他の楽器も同じ長さの配列を保つこと**（長さが揃っていないと `songLen` と合わなくなる）

- [ ] **Step 3: 音を出して聴く**

Run: `npm run dev`

ブラウザで開き、`source/audio.ts` の `audio_init()` の `music_dark_meat_beat` を一時的に `music_boss` に差し替えて試聴する（**確認後に必ず戻すこと**。恒久的な切替は Task 11）。

判定基準:
- 通常BGMと**聞き間違えない**こと（これが最低条件）
- 駆動感があること（待たされる感じがしない）
- 30 秒ループで耳が痛くならないこと

満たさなければ Step 2 の 3 点を調整して繰り返す。触ってよい範囲は `rowLen`・各楽器の `env_*` / `fx_*` / `p:` 配列。**`songData` の楽器の数（6）と `songLen`（101）と `endPattern`（25）は変えない** — 変えると `sonantx-reduced.js` の生成側と食い違う。

- [ ] **Step 4: 構造テストを書き、ハッシュを記録する**

`source/audio-data.test.ts` の import に追加:

```ts
import { music_boss } from './music-boss'
```

`describe('音色データ')` の末尾に追記する:

```ts
  it('ボス曲の構造が通常曲と揃っている', async () => {
    // 生成側（sonantx-reduced.js）が読む形は 2 曲で同じでなければならない
    expect(music_boss.songData.length).toBe(music_dark_meat_beat.songData.length)
    expect(music_boss.songLen).toBe(music_dark_meat_beat.songLen)
    expect(music_boss.endPattern).toBe(music_dark_meat_beat.endPattern)
    for (const instr of music_boss.songData) {
      expect(Object.keys(instr).filter((k) => k !== 'p' && k !== 'c').length).toBe(27)
    }
  })

  it('ボス曲が通常曲と別物である', () => {
    // 複製したまま名前だけ変えた状態を防ぐ
    expect(music_boss.rowLen).not.toBe(music_dark_meat_beat.rowLen)
  })

  it('ボス曲の値が変わっていない', async () => {
    // 落ちたときは git diff で何が変わったかを確認する。値を意図して
    // 変えたなら、ここのハッシュを新しい値に差し替える。
    // ↓ この 16 桁は Step 5 で実測値に置き換える。既存の 7 パッチと
    //   同じ「値そのものを固定する」テスト（このファイル冒頭のコメント）
    expect(await digest(music_boss)).toBe('0000000000000000')
  })
```

- [ ] **Step 5: テストを走らせ、実際のハッシュに差し替える**

Run: `npx vitest run source/audio-data.test.ts`
Expected: FAIL。「ボス曲の値が変わっていない」が `expected '<実測値>' to be '0000000000000000'` の形で実測のハッシュを報告する。

**その実測値を Step 4 のコードの `'0000000000000000'` に貼り替えてから再実行し、PASS を確認する。** ここでプレースホルダを残したままにしないこと。曲を調整したら同じ手順でハッシュを更新する。

`27` というフィールド数は、既存パッチの 29 から `p` と `c` を除いた数である。実際の数が違ったら、実測に合わせて数値を直すこと（テストの意図は「打ち間違いでフィールドが増減したら気づく」ことなので、正しい実測値を固定すればよい）。

- [ ] **Step 6: 全体のテストと型チェック**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add source/music-boss.ts source/audio-data.test.ts
git commit -m "ボス階専用のBGMを足す

music-dark-meat-beat.ts を土台に、テンポを上げて残響を詰め、頭から
最も密なパターンで始まるよう組み替えた。ボスのテーマは盛り上がりを
待たせずに全開で始まる必要がある。

生成側が読む形(楽器数・songLen・endPattern)は通常曲と揃える。"
```

---

### Task 11: BGMの切替・レート・復帰

**Files:**
- Modify: `source/audio.ts`
- Modify: `source/audio.test.ts`
- Modify: `source/game.ts`
- Modify: `source/entity-boss.ts`
- Modify: `source/entity-boss.test.ts`（`./audio` モックに新しい関数を足す）

**Interfaces:**
- Consumes: Task 10 の `music_boss`
- Produces:
  - `audio_music_boss(): void` — ボス曲へ切替
  - `audio_music_boss_rage(): void` — レートを上げる
  - `audio_music_normal(): void` — 通常曲へ戻す
  - `audio_music_restore(): void` — バッファとレートも戻すよう拡張

- [ ] **Step 1: 失敗するテストを書く**

`source/audio.test.ts` の `vi.mock('./sonantx-reduced', ...)` を差し替える。2 曲を区別できるようにするため、呼ばれた順で別のバッファを返す:

```ts
vi.mock('./sonantx-reduced', () => ({
  // 1 曲目が通常BGM、2 曲目がボス曲（audio.ts の生成順）
  sonantxr_generate_song: (_ctx: unknown, _song: unknown, cb: (b: unknown) => void) => {
    fake.song_calls++
    cb(fake.song_calls === 1 ? fake.music : fake.music_boss)
  },
  sonantxr_generate_sound: (_ctx: unknown, _inst: unknown, _note: number, cb: (b: unknown) => void) => {
    cb({})
  },
}))
```

`vi.hoisted` の中に追加する（`const music = { music: true }` の隣）:

```ts
  const music_boss = { music_boss: true }
```

および `return { ctx, started, gains, filters, music, music_boss, song_calls: 0 }` へ差し替え。`fake.song_calls` は可変なので `load_audio()` で 0 に戻す:

```ts
async function load_audio() {
  vi.resetModules()
  fake.started.length = 0
  fake.gains.length = 0
  fake.filters.length = 0
  fake.ctx.resume_count = 0
  fake.ctx.state = 'suspended'
  fake.song_calls = 0
  const audio = await import('./audio')
  audio.audio_init(() => {})
  return audio
}
```

末尾に追記:

```ts
describe('ボス階のBGM', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('ボス曲へ切り替えると、その曲をループ再生で鳴らす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    fake.started.length = 0

    audio.audio_music_boss()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music_boss)
    expect(fake.started[0].loop).toBe(true)
  })

  it('通常曲へ戻すと、通常曲を鳴らす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    fake.started.length = 0

    audio.audio_music_normal()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music)
  })

  it('同じ曲への切替は鳴らし直さない（ループの頭出しが起きない）', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    fake.started.length = 0

    audio.audio_music_boss()

    expect(fake.started.length).toBe(0)
  })

  it('激昂で再生レートを上げる', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    const rate = fake.started[fake.started.length - 1].playbackRate

    audio.audio_music_boss_rage()

    // ctx.currentTime = 7、ランプは 0.6 秒
    expect(rate.calls).toContainEqual(['linear', 1.12, 7.6])
  })

  it('ラン開始の復帰で通常曲へ戻し、レートを 1 にする', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    audio.audio_music_boss_rage()
    fake.started.length = 0

    audio.audio_music_restore()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music)
    expect(fake.started[0].playbackRate.value).toBe(1)
  })

  it('解錠前は切り替えても鳴らさない', async () => {
    const audio = await load_audio()

    audio.audio_music_boss()

    expect(fake.started.length).toBe(0)
  })
})
```

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/audio.test.ts -t "ボス階のBGM"`
Expected: FAIL — `audio.audio_music_boss is not a function`

- [ ] **Step 3: `audio.ts` を実装する**

import に追加:

```ts
import { music_boss } from './music-boss'
```

モジュール変数を差し替える。`let audio_music: AudioBuffer | undefined` の隣に追記:

```ts
// ボス階専用のBGM。通常BGMの生成が終わってから続けて生成を始めるので、
// 起動の臨界パス（audio_init のコールバックがゲーム開始のクリックハンドラを
// 張る経路）には載らない。最初のボス階（深度 5）に着くのは数分後なので
// 実際に間に合わないことはないが、未生成なら通常BGMのまま続ける
let audio_music_boss_buffer: AudioBuffer | undefined
// 今鳴っている曲のバッファ。同じ曲への切替を鳴らし直さないために持つ
// （鳴らし直すとループの頭出しが起きて、フロアを跨ぐたび曲が巻き戻る）
let music_current: AudioBuffer | undefined
```

レート上げの定数を足す（`music_filter_open_hz` の隣）:

```ts
// 激昂の再生レートと、そこへ寄せる時間（秒）。1.12 はテンポとピッチが
// 「上がった」と分かり、かつ曲が破綻しない幅。レート操作は死亡の
// テープストップで既に使っている経路なので、新しい仕組みが要らない
const music_rage_rate = 1.12
const music_rage_ramp = 0.6
// 曲を差し替えるときのランプ（秒）。ポップを避けるためだけの短い長さ
const music_swap_ramp = 0.25
```

`audio_init()` の 1 曲目のコールバックを差し替える:

```ts
export function audio_init(callback: () => void): void {
  sonantxr_generate_song(audio_ctx, music_dark_meat_beat, (buffer) => {
    audio_music = buffer
    callback()
    // 通常BGMが出来てから続けてボス曲を生成する。同時に走らせると
    // （MusicGenerator は setTimeout で刻む）1 曲目の完成が遅れ、起動が伸びる
    sonantxr_generate_song(audio_ctx, music_boss, (boss) => {
      audio_music_boss_buffer = boss
    })
  })
  // 以下、効果音の生成はそのまま
```

`audio_unlock()` を差し替える:

```ts
export function audio_unlock(): void {
  audio_unlocked = true
  audio_ctx.resume()
  music_start(audio_music)
}

// BGM は audio_play()（効果音チェーン直結）ではなく専用チェーンで鳴らす。
// 同じ曲なら何もしない — 鳴らし直すとループの頭出しが起きて、フロアを
// 跨ぐたび曲が巻き戻る
function music_start(buffer: AudioBuffer | undefined): void {
  if (!audio_unlocked || !buffer || buffer === music_current) { return }
  const now = audio_ctx.currentTime
  music_source?.stop()
  music_current = buffer
  music_source = audio_ctx.createBufferSource()
  music_source.buffer = buffer
  music_source.loop = true
  music_source.connect(music_gain)
  // 差し替えのポップを避けるためだけの短いランプ。0 から立ち上げる
  const gain = music_gain.gain
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(0, now)
  gain.linearRampToValueAtTime(1, now + music_swap_ramp)
  music_source.start()
}

// ボス階のロードで呼ぶ。生成が間に合っていなければ通常BGMのまま続ける
export function audio_music_boss(): void {
  music_start(audio_music_boss_buffer)
}

// ボス撃破とボス階以外のロードで呼ぶ
export function audio_music_normal(): void {
  music_start(audio_music)
}

// 激昂。テンポとピッチを上げる
export function audio_music_boss_rage(): void {
  if (!music_source) { return }
  const now = audio_ctx.currentTime
  const rate = music_source.playbackRate
  rate.cancelScheduledValues(now)
  rate.setValueAtTime(rate.value, now)
  rate.linearRampToValueAtTime(music_rage_rate, now + music_rage_ramp)
}
```

`audio_music_restore()` を差し替える:

```ts
// 次のラン開始で通常再生へ即時復帰する（run_start が呼ぶ）。
// バッファも戻すのが要る — レートとフィルタと音量だけ戻すと、ボス階で
// 死んだ次のランがボス曲で始まる
export function audio_music_restore(): void {
  const now = audio_ctx.currentTime
  music_filter.frequency.cancelScheduledValues(now)
  music_filter.frequency.setValueAtTime(music_filter_open_hz, now)
  music_gain.gain.cancelScheduledValues(now)
  music_gain.gain.setValueAtTime(1, now)
  if (music_source) {
    const rate = music_source.playbackRate
    rate.cancelScheduledValues(now)
    rate.setValueAtTime(1, now)
  }
  // 現在の曲がボス曲なら通常曲へ戻す。music_start() が同一なら何もしない
  audio_music_normal()
}
```

`music_start()` がレートを引き継がないよう、新しい source は既定 1 で始まる（`createBufferSource()` の既定）。`audio_music_restore()` は差し替えの前にレートを戻すので、順序はこのままで正しい。

- [ ] **Step 4: テストを走らせて通ることを確認**

Run: `npx vitest run source/audio.test.ts`
Expected: PASS。既存の「BGM のテープストップ」の 2 件も通ること（`music_source` の扱いは変えていない）

- [ ] **Step 5: `game.ts` からボス階の切替を呼ぶ**

`source/game.ts:1` を差し替える:

```ts
import { audio_music_boss, audio_music_normal, audio_music_restore } from './audio'
```

`load_level()` の中の `const boss_floor = is_boss_depth(depth)` の直後に追記する:

```ts
  // ボス階だけ専用BGM。生成が間に合っていなければ通常BGMのまま続く
  if (boss_floor) { audio_music_boss() } else { audio_music_normal() }
```

- [ ] **Step 6: `entity-boss.ts` から激昂と撃破の切替を呼ぶ**

import を差し替える:

```ts
import {
  audio_music_boss_rage, audio_music_normal, audio_play, audio_sfx_explode,
} from './audio'
```

`_enter_rage()` の `screen_flash()` の直前に追記:

```ts
    audio_music_boss_rage()
```

`_kill()` の 3 連の爆発音の後に追記:

```ts
    // 戦いが終わったので通常BGMへ戻す。報酬ダイアログは通常BGMの上で出る
    audio_music_normal()
```

- [ ] **Step 7: `entity-boss.test.ts` の `./audio` モックに新しい関数を足す**

```ts
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_music_boss_rage: vi.fn(),
  audio_music_normal: vi.fn(),
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
}))
```

- [ ] **Step 8: テストと型チェック**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 9: 実機で確認**

Run: `npm run dev`
確認すること:
1. ボス階に入るとBGMが切り替わる（ポップが鳴らない）
2. HP 半分でテンポが上がる
3. 撃破で通常BGMへ戻る
4. ボス階で死ぬとテープストップが効き、次のランは通常BGMで、レートが 1 に戻っている
5. 通常フロアを何度も跨いでも曲が巻き戻らない

- [ ] **Step 10: コミット**

```bash
git add source/audio.ts source/audio.test.ts source/game.ts source/entity-boss.ts source/entity-boss.test.ts
git commit -m "ボス階でBGMを切り替え、激昂でレートを上げる

ボス曲は通常曲の生成が終わってから続けて生成する。起動の臨界パスに
載せないため。未生成なら通常BGMのまま続ける。

同じ曲への切替は鳴らし直さない(鳴らし直すとループの頭出しが起きて
フロアを跨ぐたび曲が巻き戻る)。

audio_music_restore がバッファとレートも戻すようにする。今までは
レート・フィルタ・音量だけを戻していたため、ボス階で死んだ次のランが
ボス曲で始まっていた。"
```

---

### Task 12: セリフ（激昂と、灰皿がまだ塞がれていること）

Task 6 で入った退行（灰皿に触れても無反応）をここで埋める。

**Files:**
- Modify: `source/monologue.ts`
- Modify: `source/entity-smoking-area.ts`
- Modify: `source/entity-smoking-area.test.ts`

**Interfaces:**
- Consumes: Task 9 の `monologue_boss_rage`
- Produces: `monologue_boss_blocked(): void`

- [ ] **Step 1: 失敗するテストを書く**

`source/entity-smoking-area.test.ts` の `vi.mock('./monologue', ...)` に 1 行足す（このファイルは `vi.fn()` ではなく `mocks.monologue` へ文字列を積む流儀なので、それに倣う）:

```ts
vi.mock('./monologue', () => ({
  monologue_all_done: () => { mocks.monologue.push('all_done') },
  monologue_complete: () => { mocks.monologue.push('complete') },
  monologue_dummy: () => { mocks.monologue.push('dummy') },
  monologue_interrupt: () => { mocks.monologue.push('interrupt') },
  monologue_boss_blocked: () => { mocks.monologue.push('boss_blocked') },
}))
```

既存の `describe('喫煙所')` の `beforeEach` に 1 行足す（既存テストへ `boss_alive` が漏れないようにする。`state.ts` の既定は 0 だが、明示しないと新しいテストの後始末に依存する）:

```ts
    state.boss_alive = 0
```

ファイル末尾に新しい `describe` を追記する。`tick()` は既存のヘルパー（`area._check(player)` → `area._render()` の順で 1 フレーム進める）をそのまま使う:

```ts
describe('ボス生存中の灰皿', () => {
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
    state.game_running = 1
    state.dying = 0
    state.boss_alive = 1
    mocks.monologue.length = 0
    mocks.notices.length = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('触れると高木が理由を口にする', () => {
    // ボスが灰皿を離れて動くようになったので、触れても無反応だと
    // 「なぜ吸えないのか」が画面のどこにも出ない
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 1 / 60)

    expect(mocks.monologue).toEqual(['boss_blocked'])
    // 一服は始まらない
    expect(state.exit_open).toBe(0)
    expect(state.nicotine).toBe(0)
  })

  it('触れている間は毎フレーム呼ぶ（連呼を抑えるのはセリフ側の役目）', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    for (let i = 0; i < 60; i++) { tick(area, player, 1 / 60) }

    // クールダウンは monologue.ts が持つ。このファイルは ./monologue を
    // モックしているのでクールダウンは効かず、ここで「連呼しない」は
    // 検証できない。呼び出し側が余計なゲートを持っていないこと
    // （＝抑制の責任が 1 か所にあること）をここで固定する。
    // クールダウン自体は実機で確認する — 既存の whisper_interval も同じ
    // 理由で単体テストを持たない（monologue.ts は dom.ts に触る）
    expect(mocks.monologue.length).toBe(60)
    expect([...new Set(mocks.monologue)]).toEqual(['boss_blocked'])
  })

  it('ボスが居なければ出さず、普通に一服できる', () => {
    state.boss_alive = 0
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }

    expect(mocks.monologue).toEqual(['complete'])
    expect(state.exit_open).toBe(1)
  })
})
```

`player` を `(0, 0, 0)` に置き、喫煙所を `(64, 0, 64)` に置いてもエンティティ判定は重ならない。既存テストは同じ座標で `tick()` が接触を成立させているので（`_check` は距離を見ずに呼ばれた側が `_touching` を立てる形）、この並びで正しく動く。動かなければ既存の通っているテストと同じ座標・同じ呼び出し順に合わせること。

- [ ] **Step 2: テストを走らせて失敗を確認**

Run: `npx vitest run source/entity-smoking-area.test.ts -t "ボス生存中の灰皿"`
Expected: FAIL — `monologue_boss_blocked` が存在しない

- [ ] **Step 3: `monologue.ts` に実装する**

`lines_boss_rage` の隣に追記する:

```ts
// ボスが生きている間に灰皿へ触れたとき。ボスが灰皿を離れて動くように
// なったので、触れても無反応だと「なぜ吸えないのか」が画面のどこにも
// 出ない。事実ではなく高木の都合として言う（docs/story.md「声の使い分け」）
const lines_boss_blocked = [
  'あいつをどけねえと座れねえ',
  'まだ吸わせてもらえねえのか……',
  '先にあれを片付けるか……',
]
// 灰皿への接触は毎フレーム続くので、アンビエント扱い（表示中なら譲る）に
// これを重ねる。8 秒は、状況を忘れさせない頻度と、同じセリフの繰り返しが
// うるさく感じない頻度の両方に収まる間隔（whisper_interval と同じ流儀）
const boss_blocked_interval = 8

let boss_blocked_timer = 0
```

`monologue_boss_rage` の隣に追記する:

```ts
export function monologue_boss_blocked(): void {
  if (boss_blocked_timer > 0) { return }
  boss_blocked_timer = boss_blocked_interval
  say(lines_boss_blocked, true)
}
```

`monologue_update()` の先頭にクールダウンの進行を足す。`monologue_update()` は `game_tick` が毎フレーム呼ぶ（`source/game.ts:391`）ので、これでクールダウンが進む:

```ts
export function monologue_update(px: number, pz: number): void {
  if (boss_blocked_timer > 0) { boss_blocked_timer -= state.time_elapsed }
  bubble_advance(bubble, state.time_elapsed)
```

`monologue_reset()` にクールダウンのリセットを足す（フロアを跨いだ持ち越しを避ける）:

```ts
export function monologue_reset(): void {
  bubble = bubble_idle()
  boss_blocked_timer = 0
  bubble_el.style.opacity = '0'
  bubble_el.classList.remove('tr')
}
```

- [ ] **Step 4: `entity-smoking-area.ts` から呼ぶ**

import に追加する（既存の `./monologue` の import 行へ）:

```ts
import { monologue_boss_blocked, ... } from './monologue'
```

`_render()` の一服のガードを差し替える:

```ts
    let smoking = false
    // state.game_running: ラン終了後に terminal_show_notice() を呼ぶと、run_end() が
    // death_screen_show() で止めたターミナルの表示チェーンを再び動かしてしまう
    // （レビュー Finding 1）。state.dying: 死亡シーケンス中（game_running はまだ 1）に
    // 死体が一服を始めない・中断のセリフを出さないため。
    // state.boss_alive: ボス階の灰皿はボスの席である。倒すまで吸わせない
    // （docs/gameplay.md「ボス階」）
    const ready = touching && !this._done && !this._needs_release &&
      state.game_running && !state.dying
    if (ready && state.boss_alive) {
      // ボスは灰皿を離れて動くので、触れても無反応だと「なぜ吸えないのか」が
      // 画面のどこにも出ない。連呼はセリフ側のクールダウンが抑える
      monologue_boss_blocked()
    } else if (ready) {
      if (this.is_real) {
        smoking = this._advance()
      } else {
        this._take_dummy()
      }
    }
```

- [ ] **Step 5: テストを走らせて通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: 実機で確認**

Run: `npm run dev`
確認すること:
1. ボス階でボスが灰皿を離れているとき、灰皿に触れると高木が一言口にする
2. 触れ続けても連呼しない
3. ボスを倒すと普通に一服が始まる
4. 通常フロアの喫煙所とダミーの挙動が変わっていない

- [ ] **Step 7: コミット**

```bash
git add source/monologue.ts source/entity-smoking-area.ts source/entity-smoking-area.test.ts
git commit -m "ボス生存中に灰皿へ触れたとき高木が理由を言う

ボスが灰皿を離れて動くようになったので、触れても無反応だと「なぜ
吸えないのか」が画面のどこにも出ない。事実ではなく高木の都合として
言う。接触は毎フレーム続くのでアンビエント扱い＋8秒のクールダウンで
連呼を抑える。"
```

---

### Task 13: 設計書の更新

**Files:**
- Modify: `docs/enemies.md`
- Modify: `docs/gameplay.md`
- Modify: `docs/architecture.md`
- Delete: `docs/superpowers/specs/2026-08-24-boss-fight-escalation-design.md`
- Delete: `docs/superpowers/plans/2026-08-24-boss-fight-escalation.md`

`AGENTS.md`: docs/ は常にコードの現状と一致させる。現在形で書く。コードから読み取れないことだけを書く（契約・不変条件・数値の意図・採用しなかった代替案とその理由）。関数一覧や処理の逐次説明は書かない。作業が完了したら `docs/superpowers/` の spec と plan は削除する。

- [ ] **Step 1: `docs/enemies.md` を更新する**

1. 冒頭の表のボスの行に、2 フェーズであることを足す
2. カメラシェイクの序列（`docs/enemies.md:21`）に段を挿す:
   > **カメラシェイクの序列は 蜘蛛 1 < セントリー 3 < 銘品の開封 4 < 自機の死 5 < 清掃ドローン 6 < ボスのフェーズ移行 7 < ボス撃破 8。** 揺れの大きさがそれ自体「何が起きたか」の合図なので、この 7 つは 1 つの尺度として一緒に見ること。
3. 「ボス（灰皿撤去ユニット）」節に次を書く（spec の該当節から蒸留する。実装手順・移行前の状況説明は書かない）:
   - 床から低く浮いた機体であること。この像が要る理由（灰皿ブロックの上に居られる／柱は越えられない、を同時に満たす唯一の読み方）
   - 座席を中心に周回すること。**角速度ではなく線速度を一定にする**理由
   - 目標半径の帯 10〜70px と、その上下限の根拠
   - 柱には衝突して滑ること。専用の `_collides()` が必要な理由（基底は 6×4 固定）と座席タイルの免除
   - HP 半分で激昂に入ること。フェーズ 2 の摘みの表
   - 追尾弾: 掃引角で刻む理由、数を深度で増やさない理由、速度・旋回・寿命の意図
   - HP バーを持たず、ライトの色が恒常的な印を兼ねること
   - 耐久を上げない理由
   - 深度スケールの軸が砲口の本数だけであることは変わらない、と明記
   - **ミニマップにボスを出さない**こと。中央の喫煙所は未訪問なのでオレンジに明滅しており、ボスが動くようになってもそれは灰皿（座席）の位置として正しい
   - 同時飛行数の目安（深度 5 で約 13 / 18 発、深度 25 以上で約 30 / 43 発）と、摘みが `boss-model.ts` の定数に集まっていること
4. spec の「採用しなかった案」から、ボスの挙動に関わる行を蒸留して残す

- [ ] **Step 2: `docs/gameplay.md` を更新する**

1. 「ボス階」節の柱の記述を差し替える:
   > **柱は中心から半径 8 タイルのリング上に 45° ごと 8 本、1 本 2×2 タイル。**
2. 不変条件を 3 つから 4 つにする:
   > - どの柱も中央の灰皿タイルに接しない（詰めた自機が柱と灰皿に挟まれない）
   > - どの柱も外周の輪郭壁に接しない（柱の裏を通り抜けられる）
   > - 柱を置いたあとも全床タイルが連結している
   > - **隣接する柱の隙間は、ボスの当たり判定（14px）が通れる幅であること（半径 8 で 32px）。** ボスは闘技場を動き回るので、これが満たされないとリングの内側に閉じ込められる。半径 6 では隙間が 16px しかなく成立しない
3. full-bright 規則を引用している箇所（`docs/gameplay.md:107` 付近）を、規則が 2 本になったことに合わせて直す（赤 `r>0.95 && g>0.25 && b==0` と水色 `b>0.95 && g>0.25 && r==0`）
4. 「置かないもの」の表は変えない

- [ ] **Step 3: `docs/architecture.md` を更新する**

1. 「アトラスの焼き込み」に、タイル 49（水色の追尾弾）が `tools/boss_tiles.py` で焼かれることを足す
2. フラグメントシェーダの full-bright 規則が 2 本になったこと、水色を足す前に既存アトラスの全走査で誤爆がないことを確認する必要があることを書く
3. 音の節に次を足す:
   - BGM が 2 曲（通常・ボス階）であること
   - 生成順の契約: 通常曲だけが起動の臨界パスに載り、ボス曲はその完成後に続けて生成される。同時に走らせると 1 曲目の完成が遅れて起動が伸びる
   - 切替の契約: `music_source` の差し替えで行い、同じ曲への切替は鳴らし直さない（ループの頭出しが起きるため）
   - `audio_music_restore()` はバッファ・レート・フィルタ・音量のすべてを戻す。バッファを戻さないと、ボス階で死んだ次のランがボス曲で始まる

- [ ] **Step 4: docs がコードと一致していることを確認する**

次の値を docs とコードで突き合わせる:

```bash
grep -n "arena_pillar_radius" source/level-generator.ts
grep -n "半径 8" docs/gameplay.md
grep -n "boss_orbit_radius_min\|boss_orbit_radius_max\|boss_orbit_speed" source/boss-model.ts
grep -n "10〜70\|36px\|54" docs/enemies.md
grep -n "0.95" source/renderer.ts docs/gameplay.md docs/architecture.md
```

食い違いがあれば docs を直す（コードが正）。

- [ ] **Step 5: テストと型チェックとビルド**

Run: `npm test && npm run typecheck && npm run build`
Expected: すべて PASS

- [ ] **Step 6: 作業用ドキュメントを削除する**

```bash
git rm docs/superpowers/specs/2026-08-24-boss-fight-escalation-design.md
git rm docs/superpowers/plans/2026-08-24-boss-fight-escalation.md
```

- [ ] **Step 7: コミット**

```bash
git add docs/enemies.md docs/gameplay.md docs/architecture.md
git commit -m "設計書をボス戦の増強に合わせて更新する

enemies.md: 浮遊化・周回・2フェーズ・追尾弾。シェイクの序列に
フェーズ移行7を挿す。
gameplay.md: 柱リング半径8。不変条件に4つ目(隙間をボスが通れる)を
追加。full-bright規則が2本に。
architecture.md: タイル49、シェーダの規則2本、BGM2曲の生成順と
切替・復帰の契約。

結論を docs/ 直下へ蒸留したので、作業用の spec と plan を削除する。"
```

---

## 最終確認

- [ ] `npm test` — 全テストが緑
- [ ] `npm run typecheck` — エラーなし
- [ ] `npm run build` — 通る
- [ ] 実機で 1 ラン通す。深度 5 のボスを撃破して報酬を選び、次のフロアへ降りられる
- [ ] 実機でボス階で死ぬ。テープストップが効き、次のランが通常BGM・レート 1 で始まる
- [ ] `git status` がクリーン

## 試遊で判断する 2 点（実装の完了条件には含めない）

spec の「リスクと確認事項」に対応する。どちらも摘みが `boss-model.ts` の定数に集まっているので調整は安い。

1. **命中率の低下がゲージ寿命を圧迫していないか。** 深度 5 のボスを、装備なしで撃破できるか試す。`docs/enemies.md` の想定は「回避しながら 20〜40 秒」、同深度のゲージ寿命は約 72 秒。届かないなら `boss_hp` の係数ではなく `boss_orbit_speed` を落とす（撃破時間を伸ばさず命中を戻すため）
2. **深度 25 以上のフェーズ 2 の可読性。** 同時 40 発超が一辺 184px の闘技場に飛ぶ。確認するには `source/game.ts` の `run_start` で `state.depth` を一時的に 25 にする（**確認後に必ず戻すこと**）。過密なら `boss_fire_step` の激昂側（0.15）を緩める
