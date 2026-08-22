# フロアの広さを深度でスケールする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浅い層のフロアを狭くし、深度 10 で現在の広さに達するようにして、序盤の「広すぎて迷う」を解消する。

**Architecture:** 64×64 のタイルグリッドは変えず、`level-generator.ts` の中で **部屋を置ける正方形の範囲** と **部屋数** を深度で開く。狭くしたぶんだけ浅い層が濃くならないよう、敵の総数は床タイル数で按分し、ダミー喫煙所は深度 5 まで出さない。変更は `source/level-generator.ts` とそのテスト、`docs/gameplay.md` に閉じる。

**Tech Stack:** TypeScript + Vite + Vitest（`npm test` = `vitest run`、`npm run typecheck` = `tsc --noEmit`）

**Spec:** 別立ての設計書は作っていない（bounded な変更のため）。設計の根拠と実測値はこの計画の「設計の根拠」節に内包する。

---

## Global Constraints

- **グリッドは 64×64 のまま。** `source/state.ts` の `level_width` / `level_height` と `level_data` は一切触らない。`minimap.ts`・`sniff.ts`・`entity.ts`・`game.ts` も触らない。
- **ミニマップは触らない。** 浅い層のフロアがミニマップ中央に小さく描かれるのは仕様。`minimap.ts` と `hud.css` に変更を入れないこと。
- **後方互換を残さない。** `enemy_budget()` は `enemy_count()` に置き換えて削除する。旧関数を残さない（AGENTS.md「後方互換性は維持しない」）。
- **`source/random.ts` は変更しない。** `random.test.ts` が旧実装との出力一致を固定しており、レベル生成の再現性がそこに乗っている。
- **深度 10 以上の間取りは現状とタイル単位で同一であること。** 満寸の一辺 62 と部屋数 8〜12 は現行の `random_int(1, level_width - w - 2)` = `random_int(1, 62 - w)` に一致する。深いフロアの手触りを変えないことが要件。
- **コメントは日本語**、既存ファイルの記法（`snake_case`、2 スペースインデント、セミコロンなし）に合わせる。
- 各タスクの最後に `npm test` と `npm run typecheck` を通してからコミットする。

---

## 設計の根拠

### 何が問題か（実測、各深度 200 シード）

| 深度 | 床タイル | 部屋数 | 外接矩形 | 開始→喫煙所 | 開始→非常口 | 敵 | 敵密度 |
|---|---|---|---|---|---|---|---|
| 1 | 1086 | 10.0 | 54×54 | 36 | **75** | 34 | 1/32 |
| 3 | 1080 | 10.0 | 54×54 | 43 | **76** | 42 | 1/26 |
| 10 | 1094 | 10.0 | 54×54 | 54 | **74** | 70 | 1/16 |
| 20 | 1089 | 9.9 | 55×54 | 72 | **70** | 100 | 1/11 |

フロアの広さは深度に対して**完全に一定**。深度で伸びるのは開始→喫煙所の距離だけで、非常口までの距離は全深度で約 75 タイル固定（非常口が「喫煙所を除いて最も遠い部屋」と定義されているため）。自機の終端速度は 3.2 タイル/秒なので、深度 1 でも最短経路で 37 秒ぶん歩かされる。

### どう変えるか（実測、各深度 300 シード）

進行度 `t = min(1, (depth - 1) / 9)` で、生成範囲の一辺を 32 → 62、部屋数を 5〜6 → 8〜12 に開く。

| 深度 | 一辺 | 部屋数 | 床 | 外接 | →喫煙所 | →非常口 | ダミー | 敵 |
|---|---|---|---|---|---|---|---|---|
| 1 | 32 | 5–6 | 400 | 29 | 25 | 34 | 0 | 12 |
| 3 | 39 | 6–7 | 528 | 34 | 34 | 45 | 0 | 20 |
| 5 | 45 | 6–9 | 660 | 39 | 38 | 54 | 1 | 30 |
| 8 | 55 | 7–11 | 915 | 48 | 47 | 68 | 1 | 52 |
| **10** | **62** | **8–12** | **1066** | **54** | **54** | **75** | **2** | **68** |
| 20 | 62 | 8–12 | 1066 | 54 | 71 | 70 | 3 | 96 |

深度 10 で現状の数字に合流する。深度 1 の最短ルートは 117 → 59 タイル（37 秒 → 18 秒）、探索範囲は面積比で約 1/4。

### なぜ範囲と部屋数をセットで動かすのか

範囲だけ縮めると 8〜12 部屋が入りきらず、`place_rooms()` が `room_place_attempts`（200）を使い切って**黙って少ない数を返す**。実測では一辺 26 で部屋数が 3〜8 の間で暴れ、`room_count_floor`（3）ぎりぎりのシードが出る。範囲と部屋数は必ず一緒に動かす。

### なぜ敵を床タイル数で按分するのか

狭くしたフロアに 34 体を置くと、深度 1 の敵密度が 1/32 → 1/12 タイルになり、難易度緩和のはずが逆行する。床タイル数で按分すると密度は全深度で従来比 1.00 倍に保たれる（実測: 深度 1 で 1.003、深度 5 で 1.000、深度 10 で 1.000）。

### なぜダミーを深度 5 からにするのか

浅い層でダミーを出すと、ミニマップに明滅するオレンジが複数あって片方はハズレという状態になり、フロアを狭めても探索の空振りだけが残る。深度 1〜4 は明滅するオレンジが 1 点だけ＝本物になり、「明滅は行き先を意味する」（docs/gameplay.md）がそのまま答えになる。

### ミニマップを触らない理由

`canvas#m` は 64×64 固定で、深度 1 のフロアはパネル中央に小さく描かれる。表示幅は 15vw ≒ 288px なので 32 タイルでも約 144px あり読める。フロア範囲へズームする案もあるが、`putImageData()` はスケールを無視するので `drawImage()` 経由への描画経路の変更が要り、`minimap.ts` の「1 タイル = 1 ピクセル」という不変条件も失われる。**この計画のスコープ外。**

---

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `source/level-generator.ts` | フロア生成。深度スケールの式もここに置く | 変更（全タスク） |
| `source/level-generator.test.ts` | 生成器の性質検証 | 変更（全タスク） |
| `docs/gameplay.md` | 設計書 | 変更（Task 1〜3） |

新規ファイルはない。深度スケールの式（`level_bounds_side` / `room_count_range`）を別モジュールに切り出さないのは、読み手が 1 箇所しかない（`level-generator.ts` 内の `place_rooms`）ため（AGENTS.md「呼び出し元が 1 箇所しかないものに抽象化レイヤーを作らない」）。テストのために `export` はする — `sentry_count` / `level_vert_cost` と同じ既存の扱い。

---

## Task 1: 生成範囲と部屋数を深度でスケールする

**Files:**
- Modify: `source/level-generator.ts:39-40`（`room_count_min` / `room_count_max` の定数）、`source/level-generator.ts:67-86`（`place_rooms`）、`source/level-generator.ts:211`（`build_layout` 内の `place_rooms()` 呼び出し）
- Modify: `source/level-generator.test.ts:2`（import）、`source/level-generator.test.ts:118-133`（部屋のテスト 2 本）、`source/level-generator.test.ts:268-278`（喫煙所距離の単調性テスト）
- Modify: `docs/gameplay.md`（「タイル値の意味と壁パス」節と「距離の定義」節の間に新節、および「距離の定義」の文言）

**Interfaces:**
- Produces:
  - `level_bounds_side(depth: number): number` — 部屋を置ける正方形の一辺（タイル）。深度 1 で 32、深度 10 以降で 62。
  - `room_count_range(depth: number): { min: number, max: number }` — その深度で狙う部屋数の範囲。深度 1 で `{min:5, max:6}`、深度 10 以降で `{min:8, max:12}`。
  - `place_rooms(depth: number)` — 非公開。引数が増える。
- Consumes: なし

- [ ] **Step 1: 曲線の失敗するテストを書く**

`source/level-generator.test.ts` の import 行（2 行目）を差し替える。

```ts
import {
  generate_level, level_bounds_side, level_vert_cost, enemy_budget,
  room_count_range, sentry_count,
} from './level-generator'
```

`describe('generate_level: 決定性', ...)` ブロックの**直前**に、新しい describe を挿入する。

```ts
describe('フロアの広さ', () => {
  it('生成範囲は深度 1 で 32、深度 10 で満寸の 62 になる', () => {
    expect(level_bounds_side(1)).toBe(32)
    expect(level_bounds_side(5)).toBe(45)
    expect(level_bounds_side(10)).toBe(62)
    expect(level_bounds_side(30)).toBe(62)
  })

  it('部屋数の範囲は深度 1 で 5〜6、深度 10 で 8〜12 になる', () => {
    expect(room_count_range(1)).toEqual({ min: 5, max: 6 })
    expect(room_count_range(5)).toEqual({ min: 6, max: 9 })
    expect(room_count_range(10)).toEqual({ min: 8, max: 12 })
    expect(room_count_range(30)).toEqual({ min: 8, max: 12 })
  })

  it('範囲も部屋数も深度に対して単調非減少で、min <= max を保つ', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(level_bounds_side(depth + 1))
        .toBeGreaterThanOrEqual(level_bounds_side(depth))
      expect(room_count_range(depth + 1).min)
        .toBeGreaterThanOrEqual(room_count_range(depth).min)
      expect(room_count_range(depth + 1).max)
        .toBeGreaterThanOrEqual(room_count_range(depth).max)
      expect(room_count_range(depth).min)
        .toBeLessThanOrEqual(room_count_range(depth).max)
    }
  })

  it('床タイルは生成範囲の内側に収まる', () => {
    for (const depth of [1, 5, 10, 20]) {
      const side = level_bounds_side(depth)
      for (let seed = 1; seed <= 200; seed++) {
        const { tiles } = generate_level(depth, seed)
        let min_x = level_width, max_x = -1
        let min_z = level_height, max_z = -1
        for (let i = 0; i < tiles.length; i++) {
          const x = i % level_width
          const z = (i / level_width) | 0
          if (!is_floor(tiles, x, z)) { continue }
          if (x < min_x) { min_x = x }
          if (x > max_x) { max_x = x }
          if (z < min_z) { min_z = z }
          if (z > max_z) { max_z = z }
        }
        expect(max_x - min_x + 1).toBeLessThanOrEqual(side)
        expect(max_z - min_z + 1).toBeLessThanOrEqual(side)
      }
    }
  }, 60000)

  it('浅い層のフロアは満寸のフロアより明らかに狭い', () => {
    // 1 シードでは間取りのばらつきに埋もれるので 100 シードの平均で見る
    const mean_floor_tiles = (depth: number): number => {
      let total = 0
      for (let seed = 1; seed <= 100; seed++) {
        for (const t of generate_level(depth, seed).tiles) {
          if (t > 0 && t < 8) { total++ }
        }
      }
      return total / 100
    }
    const shallow = mean_floor_tiles(1) // 実測 400
    const full = mean_floor_tiles(10) // 実測 1066
    expect(shallow).toBeLessThan(full * 0.5)
    expect(full).toBeGreaterThan(1000)
  }, 60000)
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t 'フロアの広さ'
```

期待: `level_bounds_side is not a function` / `room_count_range is not a function` で FAIL（`tsc` も未定義エクスポートで落ちる）。

- [ ] **Step 3: 深度スケールの式を実装する**

`source/level-generator.ts` の定数ブロックから `room_count_min` / `room_count_max` の 2 行を削除する。

```ts
const room_count_min = 8
const room_count_max = 12
```

削除後、`function tile_index` の直前（`spawn_min_distance` の定義の次）に以下を挿入する。

```ts
// 深度 1 → 10 でフロアを「狭い浅層」から満寸へ開く進行度。
// 満寸のまま浅い層を出すと、開始から非常口まで常に約 75 タイル歩かされる
// （非常口は最も遠い部屋なので、この距離は深度に依存しない）。
function depth_scale(depth: number): number {
  return Math.min(1, (depth - 1) / 9)
}

// 部屋を置ける正方形の一辺（タイル）。グリッド自体は 64×64 のまま変えない。
// state.ts の level_data もミニマップの ImageData も level_width * level_height の
// 固定長で、可変にすると生成器の外へ波及する。範囲だけ絞れば生成器の中で閉じる。
// 満寸が 62 なのは、輪郭壁のために外周 1 タイルを空けるため（使える内側が 1..62）。
export function level_bounds_side(depth: number): number {
  return Math.round(32 + 30 * depth_scale(depth))
}

// 範囲と部屋数はセットで動かす。範囲だけ縮めると 8〜12 部屋が入りきらず、
// place_rooms() が room_place_attempts を使い切って黙って少ない数を返し、
// 部屋数がシードごとに 3〜8 の間で暴れる（一辺 26 での実測）。
export function room_count_range(depth: number): { min: number, max: number } {
  const t = depth_scale(depth)
  return { min: Math.round(5 + 3 * t), max: Math.round(6 + 6 * t) }
}
```

- [ ] **Step 4: `place_rooms` を範囲対応にする**

`source/level-generator.ts` の `place_rooms` を丸ごと差し替える。

```ts
function place_rooms(depth: number): room_t[] {
  const rooms: room_t[] = []
  const count = room_count_range(depth)
  const target = random_int(count.min, count.max)
  const side = level_bounds_side(depth)
  // 範囲は盤面中央に寄せる。外周 1 タイルは輪郭壁のために空けておく。
  // side = 62 のとき x0 = 1 となり、範囲を導入する前の
  // random_int(1, level_width - w - 2) とタイル単位で一致する。
  const x0 = 1 + ((level_width - 2 - side) >> 1)
  const z0 = 1 + ((level_height - 2 - side) >> 1)

  for (let i = 0; i < room_place_attempts && rooms.length < target; i++) {
    const w = random_int(room_size_min, room_size_max)
    const h = random_int(room_size_min, room_size_max)
    const room: room_t = {
      x: random_int(x0, x0 + side - w - 1),
      z: random_int(z0, z0 + side - h - 1),
      w,
      h,
    }
    if (!rooms.some((other) => rooms_overlap(room, other))) {
      rooms.push(room)
    }
  }
  return rooms
}
```

`build_layout` の呼び出しを差し替える。

```ts
  const rooms = place_rooms(depth)
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t 'フロアの広さ'
```

期待: 5 件すべて PASS。

- [ ] **Step 6: 既存テストの深度カバレッジを広げる**

`source/level-generator.test.ts` の `describe('generate_level: 部屋', ...)` にある 2 本を差し替える。深度 1 だけを見ていたものが、狭い浅層しか検証しなくなるため。

```ts
  it('部屋は必ず 3 つ以上ある', () => {
    for (const depth of [1, 5, 10, 30]) {
      for (let seed = 1; seed <= 200; seed++) {
        expect(generate_level(depth, seed).rooms.length).toBeGreaterThanOrEqual(3)
      }
    }
  }, 60000)

  it('部屋は外周 1 タイルを空けて収まる', () => {
    for (const depth of [1, 5, 10, 30]) {
      for (let seed = 1; seed <= 200; seed++) {
        for (const room of generate_level(depth, seed).rooms) {
          expect(room.x).toBeGreaterThanOrEqual(1)
          expect(room.z).toBeGreaterThanOrEqual(1)
          expect(room.x + room.w).toBeLessThanOrEqual(level_width - 1)
          expect(room.z + room.h).toBeLessThanOrEqual(level_height - 1)
        }
      }
    }
  }, 60000)
```

- [ ] **Step 7: 喫煙所距離の単調性テストを統計版に書き換える**

深度ごとに間取りそのものが変わるため、**シード単位の単調性は成立しなくなる**。`describe('generate_level: 目標地点', ...)` 内の `it('同一シード内では深度が上がるほど喫煙所が遠くなる（単調非減少）', ...)` を丸ごと差し替える。

```ts
  // 深度で生成範囲そのものが変わるため、同一シードの深度間比較は成立しない
  // （同じ seed でも間取りが別物になる）。「潜るほど喫煙所が遠い」は
  // 100 シード平均の性質として検証する。
  it('深度が上がるほど喫煙所が遠くなる（100 シード平均で単調非減少）', () => {
    let last = -1
    for (const depth of [1, 3, 6, 9, 12, 15, 30]) {
      let total = 0
      for (let seed = 1; seed <= 100; seed++) {
        const layout = generate_level(depth, seed)
        total += bfs_distance_near(layout, layout.smoking_area)
      }
      const mean = total / 100
      expect(mean).toBeGreaterThanOrEqual(last)
      last = mean
    }
  }, 60000)
```

実測の平均値: 深度 1 で 25.2、3 で 34.0、6 で 43.5、9 で 54.2、12 で 61.5、15 で 66.9、30 で 76.7。

- [ ] **Step 8: 全テストと型チェックを通す**

```bash
npm test
```

期待: 全 PASS。

```bash
npm run typecheck
```

期待: エラーなしで終了（終了コード 0）。

- [ ] **Step 9: docs/gameplay.md に新節を足す**

`## タイル値の意味と壁パス` 節の末尾（`## 距離の定義` の直前）に、以下の節を挿入する。

```markdown
## フロアの広さは深度で開く

グリッドは常に 64×64 だが、**部屋を置ける範囲**を深度で広げる。一辺は深度 1 で 32 タイル、深度 10 以降で満寸の 62 タイル（`level_bounds_side()`）。62 が満寸なのは、輪郭壁のために外周 1 タイルを空けるため。範囲は盤面中央に寄せる。

グリッドそのものを可変にしない理由は、`state.ts` の `level_data` とミニマップの `ImageData` がどちらも `level_width * level_height` の固定長で、可変にすると生成器の外へ波及するため。範囲だけを絞れば生成器の中で閉じる。

部屋数も同じ進行度で 5〜6 → 8〜12 に開く（`room_count_range()`）。**範囲と部屋数はセットで動かす。** 範囲だけ縮めると 8〜12 部屋が入りきらず、`place_rooms()` が試行回数を使い切って黙って少ない数を返し、部屋数がシードごとに 3〜8 の間で暴れる。

深度 10 で満寸に達したあとの間取りは、範囲を導入する前とタイル単位で同一（一辺 62 のとき部屋の x 座標の抽選が `random_int(1, 62 - w)` に一致する）。深いフロアの手触りは変えない。

狭めるのは広さであって密度ではない。敵の総数は床タイル数で按分し（「敵の総数」）、ダミー喫煙所は深度 5 まで出さない（「ダミー喫煙所」）。どちらも欠くと、狭くしたぶんだけ浅い層が濃くなって緩和にならない。

ミニマップはフロアの広さに追従しない。`canvas#m` は 64×64 固定なので、浅い層のフロアはパネル中央に小さく描かれる。フロア範囲へズームするには `putImageData()` から `drawImage()` へ描画経路を変える必要があり、`minimap.ts` の「1 タイル = 1 ピクセル」という不変条件も失われる。表示幅は 15vw なので 32 タイルでも読める大きさが残る。
```

同じファイルの `## 距離の定義` 節にある次の文を修正する。

変更前:
```
部屋は 64×64 にランダム配置されるため、部屋リストの添字順
```

変更後:
```
部屋は深度ごとの生成範囲（「フロアの広さは深度で開く」）にランダム配置されるため、部屋リストの添字順
```

- [ ] **Step 10: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts docs/gameplay.md && git commit -m "$(cat <<'EOF'
浅い層のフロアを狭くし、深度 10 で現在の広さに開くようにする

部屋を置ける範囲と部屋数を深度でスケールする。グリッドは 64x64 のまま。
深度 10 以降の間取りは従来とタイル単位で同一。

喫煙所距離の単調性は、深度ごとに間取りが変わるためシード単位では
成立しなくなる。100 シード平均の性質として検証し直す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: ダミー喫煙所を深度 5 から出す

**Files:**
- Modify: `source/level-generator.ts:266`（`dummy_target` の式）
- Modify: `source/level-generator.test.ts:256-266`（ダミー数のテスト。直上の `// レビュー B-8` コメントを含む）
- Modify: `docs/gameplay.md`（`## ダミー喫煙所` 節）

**Interfaces:**
- Consumes: Task 1 の `level_bounds_side` / `room_count_range`（間接。部屋数が変わったことでダミーの空き部屋数が変わる）
- Produces: `level_layout_t.dummies` の長さが深度 1〜4 で 0 になる

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` の `it('ダミー数は min(1 + floor(深度/4), 3) を上限とし、空き部屋数でも抑えられる', ...)` を丸ごと差し替える。

```ts
  // 浅い層でダミーを出すと、明滅するオレンジが複数あって片方はハズレという
  // 状態になり、フロアを狭めても探索の空振りだけが残る。深度 1〜4 は
  // 明滅するオレンジが 1 点だけ = 本物になる。
  // レビュー B-8: 空き部屋数でクランプしないと部屋数の少ないシードで足りなくなる
  it('ダミーは深度 5 から出る。数は min(floor(深度/5), 3) を上限とし、空き部屋数でも抑えられる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 4, 5, 9, 10, 14, 15, 40]) {
        const layout = generate_level(depth, seed)
        const want = Math.min(Math.floor(depth / 5), 3)
        const available = layout.rooms.length - 3 // 開始・喫煙所・非常口を除く
        expect(layout.dummies.length).toBe(Math.max(0, Math.min(want, available)))
      }
    }
  }, 60000)

  it('深度 1〜4 にダミーは 1 つも出ない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 2, 3, 4]) {
        expect(generate_level(depth, seed).dummies.length).toBe(0)
      }
    }
  }, 60000)
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t 'ダミー'
```

期待: 両方 FAIL。現行の式 `min(1 + floor(深度/4), 3)` は深度 1 で 1 を返すため、`expected 1 to be 0`。

- [ ] **Step 3: 実装する**

`source/level-generator.ts` の `build_layout` 内、次の 1 行を差し替える。

変更前:
```ts
  const dummy_target = Math.min(1 + Math.floor(depth / 4), 3)
```

変更後:
```ts
  // 深度 5 から。深度 1〜4 でダミーを出すと、ミニマップに明滅するオレンジが
  // 複数あって片方はハズレという状態になり、フロアを狭めても探索の空振りだけが
  // 残る。浅い層は明滅するオレンジ 1 点 = 本物にして、明滅をそのまま答えにする。
  const dummy_target = Math.min(Math.floor(depth / 5), 3)
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t 'ダミー'
```

期待: 両方 PASS。

- [ ] **Step 5: 全テストと型チェックを通す**

```bash
npm test
```

期待: 全 PASS。特に `it('喫煙所・ダミー・非常口は互いに別のタイル', ...)` が深度 1 でダミー 0 件でも通ること（`Set` の要素数比較なので 0 件でも成立する）。

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 6: docs/gameplay.md を更新する**

`## ダミー喫煙所` 節の見出しの直後に、以下の段落を**先頭の段落として**挿入する（既存の「ミニマップ上は本物と見分けがつかない…」の段落より前）。

```markdown
**深度 5 から出る**（`min(floor(深度/5), 3)`。深度 1〜4 は 0、5〜9 は 1、10〜14 は 2、15 以降は 3）。浅い層でダミーを出すと、ミニマップに明滅するオレンジが複数あって片方はハズレという状態になり、フロアを狭めても（「フロアの広さは深度で開く」）探索の空振りだけが残る。深度 1〜4 は明滅するオレンジが 1 点だけ = 本物で、「明滅は行き先を意味する」がそのまま答えになる。
```

- [ ] **Step 7: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts docs/gameplay.md && git commit -m "$(cat <<'EOF'
ダミー喫煙所を深度 5 から出す

浅い層でダミーを出すと、明滅するオレンジが複数あって片方はハズレという
状態になり、フロアを狭めても探索の空振りだけが残る。深度 1-4 は
明滅するオレンジ 1 点 = 本物にする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 敵の総数を床タイル数で按分する

**Files:**
- Modify: `source/level-generator.ts:176-182`（`enemy_budget` とその直上のコメント）、`source/level-generator.ts:282-287`（`spawnable` の収集）、`source/level-generator.ts:301-302`（`sentries` / `spiders` の取得）
- Modify: `source/level-generator.test.ts:2`（import）、`source/level-generator.test.ts:281-296`（`describe('敵の総数', ...)`）、`source/level-generator.test.ts:327-336`（`it('敵の総数は予算を超えない', ...)`）
- Modify: `docs/gameplay.md`（`## 敵の総数` 節）

**Interfaces:**
- Consumes: Task 1 の生成範囲（フロアの床タイル数が深度で変わる）
- Produces:
  - `enemy_count(depth: number, floor_tiles: number): number` — 敵の総数。`enemy_budget` を置き換える（`enemy_budget` は削除）。
  - `reference_floor_tiles: number` — 満寸のフロアの床タイル数（1090）。テストが基準値として読む。

- [ ] **Step 1: 失敗するテストを書く**

`source/level-generator.test.ts` の import 行（2 行目）を差し替える。`enemy_budget` を落として `enemy_count` と `reference_floor_tiles` を足す。

```ts
import {
  enemy_count, generate_level, level_bounds_side, level_vert_cost,
  reference_floor_tiles, room_count_range, sentry_count,
} from './level-generator'
```

`describe('敵の総数', ...)` ブロックを丸ごと差し替える。

```ts
describe('敵の総数', () => {
  // レビュー A-3: 既存の式は深度 8 で当選率 100%、深度 9 以降で非単調になる
  it('深度が上がると単調非減少で、上限で頭打ちになる', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(enemy_count(depth + 1, reference_floor_tiles))
        .toBeGreaterThanOrEqual(enemy_count(depth, reference_floor_tiles))
      expect(sentry_count(depth + 1)).toBeGreaterThanOrEqual(sentry_count(depth))
    }
    expect(enemy_count(1000, reference_floor_tiles)).toBe(100)
    expect(sentry_count(1000)).toBe(10)
  })

  it('満寸のフロアでは深度 1 が 34 体、うちセントリー 1 体', () => {
    expect(enemy_count(1, reference_floor_tiles)).toBe(34)
    expect(sentry_count(1)).toBe(1)
  })

  it('床タイル数に比例する', () => {
    expect(enemy_count(1, reference_floor_tiles / 2)).toBe(17)
    expect(enemy_count(10, reference_floor_tiles / 2)).toBe(35)
  })

  // 上限は按分のあとに掛ける。先に掛けると、床タイル数が基準を上回るフロアで
  // 按分が上限を押し上げ、100 を超えうる。上限は O(n²) の衝突判定を守る要件。
  it('床タイル数が基準を上回っても上限 100 を超えない', () => {
    expect(enemy_count(30, reference_floor_tiles * 2)).toBe(100)
    expect(enemy_count(200, reference_floor_tiles * 10)).toBe(100)
  })
})
```

さらに `describe('generate_level: 配置', ...)` 内の `it('敵の総数は予算を超えない', ...)` を差し替え、密度のテストを足す。

```ts
  it('敵の総数は床タイル数から決まる予算を超えない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 10, 30]) {
        const layout = generate_level(depth, seed)
        let floor_tiles = 0
        for (const t of layout.tiles) { if (t > 0 && t < 8) { floor_tiles++ } }
        expect(layout.spiders.length + layout.sentries.length)
          .toBeLessThanOrEqual(enemy_count(depth, floor_tiles))
        expect(layout.sentries.length).toBeLessThanOrEqual(sentry_count(depth))
      }
    }
  }, 60000)

  // フロアを狭めたぶん体数を減らさないと、浅い層ほど敵密度が上がって
  // 難易度緩和にならない（狭くする前の深度 1 は 1090 タイルに 34 体 = 1/32）
  it('敵の密度は狭くする前と変わらない', () => {
    for (const depth of [1, 5, 10]) {
      let enemies = 0
      let floors = 0
      for (let seed = 1; seed <= 100; seed++) {
        const layout = generate_level(depth, seed)
        enemies += layout.spiders.length + layout.sentries.length
        for (const t of layout.tiles) { if (t > 0 && t < 8) { floors++ } }
      }
      const before = enemy_count(depth, reference_floor_tiles) / reference_floor_tiles
      expect(enemies / floors).toBeGreaterThan(before * 0.95)
      expect(enemies / floors).toBeLessThan(before * 1.05)
    }
  }, 60000)
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t '敵'
```

期待: `enemy_count is not a function` / `reference_floor_tiles is not defined` で FAIL。

- [ ] **Step 3: `enemy_budget` を `enemy_count` に置き換える**

`source/level-generator.ts` の `enemy_budget` を丸ごと差し替える（旧関数は残さない）。

変更前:
```ts
// 深度あたりの敵の総数。既存の「床タイルごとに random_int(0, 16 - id*2) == 0」は
// 深度 8 で当選率 100%、深度 9 以降で負のレンジになり当選率が非単調に振れる。
// 総数で管理すれば単調性も上限も保証できる。上限があること自体が要件で、
// game.ts のエンティティ衝突判定は O(n²)。
export function enemy_budget(depth: number): number {
  return Math.min(30 + depth * 4, 100)
}
```

変更後:
```ts
// 満寸のフロアの床タイル数（実測平均）。敵の総数を按分する基準。
export const reference_floor_tiles = 1090

// 総数の上限。game.ts のエンティティ衝突判定は O(n²) なので、上限がないと
// フロアが進むほどフレームレートが落ちる。上限があること自体が要件。
const enemy_count_max = 100

// 敵の総数。既存の「床タイルごとに random_int(0, 16 - id*2) == 0」は深度 8 で
// 当選率 100%、深度 9 以降で負のレンジになり当選率が非単調に振れる。
// 総数で管理すれば単調性も上限も保証できる。
//
// 床タイル数で按分するのは、フロアの広さが深度で開くため
// （level_bounds_side）。体数を深度だけから決めると、狭い浅い層ほど
// 敵密度が上がり、広さを絞った意味が消える。
//
// 上限は按分のあとに掛ける。先に掛けると、床タイル数が基準を上回るフロアで
// 按分が上限を押し上げ、100 を超えうる。
export function enemy_count(depth: number, floor_tiles: number): number {
  const scaled = (30 + depth * 4) * floor_tiles / reference_floor_tiles
  return Math.min(Math.round(scaled), enemy_count_max)
}
```

- [ ] **Step 4: `build_layout` で床タイル数を数えて渡す**

`source/level-generator.ts` の `spawnable` を収集するループを差し替える。

変更前:
```ts
  // 湧き先の候補。目標地点は直前に壁へ変えたのでここで自然に除外される。
  const spawnable: number[] = []
  for (let i = 0; i < dist.length; i++) {
    const t = tiles[i]
    if (dist[i] >= spawn_min_distance && t > 0 && t < 8) { spawnable.push(i) }
  }
```

変更後:
```ts
  // 湧き先の候補。目標地点は直前に壁へ変えたのでここで自然に除外される。
  // 床タイル数も同じ走査で数える（敵の総数の按分に使う）。目標地点を壁へ
  // 変えたあとに数えるので、enemy_count が見る床の数と実際の床が一致する。
  const spawnable: number[] = []
  let floor_tiles = 0
  for (let i = 0; i < dist.length; i++) {
    const t = tiles[i]
    if (t > 0 && t < 8) {
      floor_tiles++
      if (dist[i] >= spawn_min_distance) { spawnable.push(i) }
    }
  }
```

続いて `spiders` の行を差し替える。

変更前:
```ts
  const spiders = take(enemy_budget(depth) - sentries.length)
```

変更後:
```ts
  const spiders = take(enemy_count(depth, floor_tiles) - sentries.length)
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run source/level-generator.test.ts -t '敵'
```

期待: 6 件すべて PASS。

- [ ] **Step 6: `enemy_budget` の参照が `source/` に残っていないことを確認する**

```bash
grep -rn "enemy_budget" source/ docs/
```

期待: `docs/gameplay.md` の 1 件だけ（次の Step で書き換える）。`source/` にヒットが残っていたら差し替え漏れ。

- [ ] **Step 7: docs/gameplay.md の「敵の総数」節を書き換える**

`## 敵の総数` 節の本文（2 段落）を丸ごと差し替える。

```markdown
深度と **床タイル数** から総数を決めて、床タイルから抽選で配置する（`enemy_count(depth, floor_tiles) = min(round((30 + depth*4) * floor_tiles / 1090), 100)`）。

「床タイルごとに確率抽選」という原作の方式は有限のフロア数を前提にしたもので、無限深度に引き延ばすと深度 8 で当選確率が 100% に達し、深度 9 以降は確率の分母が負になって当選率が非単調に振れる。総数を先に決める方式なら、深度に対する単調性も上限も式の形だけで保証できる。

床タイル数で按分するのは、フロアの広さが深度で開くため（「フロアの広さは深度で開く」）。体数を深度だけから決めると、狭い浅い層ほど敵密度が上がり、広さを絞った意味が消える。基準の 1090 は満寸のフロアの床タイル数の実測平均で、床がこの値のとき従来どおりの体数（深度 1 で 34、深度 10 で 70）になる。

総数に上限があること自体も要件で、`game.ts` のエンティティ衝突判定は O(n²) であるため、上限がないとフロアが進むほどフレームレートが落ちる。上限は按分の **あと** に掛ける。先に掛けると、床タイル数が基準を上回るフロアで按分が上限を押し上げ、100 を超えうる。
```

- [ ] **Step 8: 全テストと型チェックを通す**

```bash
npm test
```

期待: 全 PASS。

```bash
npm run typecheck
```

期待: エラーなし。

```bash
grep -rn "enemy_budget" source/ docs/
```

期待: 出力なし。

- [ ] **Step 9: コミット**

```bash
git add source/level-generator.ts source/level-generator.test.ts docs/gameplay.md && git commit -m "$(cat <<'EOF'
敵の総数を床タイル数で按分し、深度ごとの密度を保つ

フロアの広さが深度で開くようになったため、体数を深度だけから決めると
狭い浅い層ほど敵密度が上がり、広さを絞った意味が消える。
enemy_budget(depth) を enemy_count(depth, floor_tiles) に置き換える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 深度に依存しない不変条件を満寸でも検証する

既存の連結性・壁・頂点コストのテストは深度 1 だけを見ている。Task 1 のあと深度 1 は「狭いフロア」しか表さなくなるため、満寸のフロアが無検証になる。総実行時間を増やさないよう、シード数を分割して深度を 2 つに広げる。

**Files:**
- Modify: `source/level-generator.test.ts:137-148`（連結性）、`source/level-generator.test.ts:152-176`（壁。直上の `// レビュー A-1` コメントを含む）、`source/level-generator.test.ts:178-184`（頂点コスト。直上の `// レビュー A-2` コメントを含む）

**Interfaces:**
- Consumes: Task 1〜3 の実装。新しい公開 API は増やさない。
- Produces: なし

- [ ] **Step 1: 連結性テストを 2 つの深度に分ける**

`describe('generate_level: 連結性', ...)` 内のテストを差し替える。1000 シード × 深度 1 だったものを、500 シード × 深度 1 と 500 シード × 深度 10 にする。総走査量は変わらない。

```ts
  it('浅い層と満寸の両方で、全床タイルが開始地点から到達可能', () => {
    // 深度 1 は生成範囲が狭く、深度 10 は満寸。連結性は範囲に依存しないはずだが、
    // 一本鎖でつなぐ構築が範囲の端で崩れないことを両側で押さえる。
    for (const depth of [1, 10]) {
      for (let seed = 1; seed <= 500; seed++) {
        const layout = generate_level(depth, seed)
        const seen = reachable_from(layout)
        for (let i = 0; i < layout.tiles.length; i++) {
          const t = layout.tiles[i]
          if (t > 0 && t < 8) {
            expect(seen[i]).toBe(1)
          }
        }
      }
    }
  }, 60000)
```

- [ ] **Step 2: 壁テストを 2 つの深度に分ける**

`describe('generate_level: 壁', ...)` 内の `it('床に 8 近傍で隣接する非床タイルはすべて壁になっている', ...)` を差し替える。300 シード × 深度 1 を、150 シード × 深度 1 と 150 シード × 深度 10 にする。

```ts
  it('床に 8 近傍で隣接する非床タイルはすべて壁になっている', () => {
    // 素の expect で回すと数百万回に達し、このテスト 1 本で 2 分近くかかる。
    // 走査範囲は変えず、違反を見つけたときだけ記録する。
    // 深度 1 は床が狭いぶん空タイルが多いので、走査量は深度 10 より大きい。
    const violations: string[] = []
    for (const depth of [1, 10]) {
      for (let seed = 1; seed <= 150; seed++) {
        const { tiles } = generate_level(depth, seed)
        for (let z = 0; z < level_height; z++) {
          for (let x = 0; x < level_width; x++) {
            if (tiles[tile_index(x, z)] !== 0) { continue }
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (is_floor(tiles, x + dx, z + dz) && violations.length < 5) {
                  violations.push(
                    `深度 ${depth} seed ${seed}: 空タイル (${x},${z}) が床 (${x + dx},${z + dz}) に隣接`,
                  )
                }
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
  }, 60000)
```

- [ ] **Step 3: 頂点コストのテストを満寸で見る**

`it('頂点コストが renderer の予算を超えない', ...)` を差し替える。頂点コストの最悪ケースは満寸のフロアなので、深度 1 だけを見るのは意味がなくなる（実測: 深度 1 の最大 9,264 に対し深度 10 の最大 29,226）。

```ts
  // レビュー A-2: 非床を全部壁で埋めると 2800〜3400 タイルになり
  // buffer_data.set() が RangeError を投げる（壁だけなら 2730 タイルが上限）。
  // 最悪ケースは満寸のフロアなので深度 10 で見る。
  it('頂点コストが renderer の予算を超えない', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(level_vert_cost(generate_level(10, seed).tiles)).toBeLessThanOrEqual(60000)
    }
  }, 60000)
```

- [ ] **Step 4: 全テストと型チェックを通す**

```bash
npm test
```

期待: 全 PASS。実行時間が Task 1 前とおおむね同等であること（1 本でも 60 秒のタイムアウトに掛かったら、そのテストのシード数を半分にする）。

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 5: 実際に遊んで確認する**

```bash
npm run dev
```

表示された URL を開き、次を目視で確認する。

1. 深度 1 のフロアが明らかに狭い（ミニマップの描き込みがパネル中央の狭い範囲に収まる）
2. 深度 1 でミニマップに明滅するオレンジが **1 点だけ** ある（ダミーがない）
3. その 1 点へ行くと本物の喫煙所で、一服できる
4. 深度が進むにつれてミニマップの描き込みが広がっていく
5. 深度 5 以降でオレンジの明滅が 2 点以上出るフロアがある（ダミーが復活する）

- [ ] **Step 6: コミット**

```bash
git add source/level-generator.test.ts && git commit -m "$(cat <<'EOF'
連結性・壁・頂点コストのテストを満寸のフロアでも回す

深度 1 は生成範囲が狭くなったため、深度 1 だけを見ると満寸のフロアが
無検証になる。総走査量を保ったままシードを 2 つの深度に分ける。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 作業用ドキュメントを片付ける

AGENTS.md の「docs/superpowers/ — 作業用ドキュメント」に従い、実装が終わったらこの計画を削除する。設計の結論は Task 1〜3 の docs 更新で `docs/gameplay.md` に反映済み。

**Files:**
- Delete: `docs/superpowers/plans/2026-08-23-map-difficulty-scaling.md`

- [ ] **Step 1: docs/gameplay.md に結論が入っていることを確認する**

```bash
grep -n "フロアの広さは深度で開く\|深度 5 から出る\|enemy_count" docs/gameplay.md
```

期待: 3 つとも 1 件以上ヒットする。ヒットしないものがあれば、対応する Task の docs 更新に戻る。

- [ ] **Step 2: 計画ファイルを削除してコミット**

```bash
git rm docs/superpowers/plans/2026-08-23-map-difficulty-scaling.md && git commit -m "$(cat <<'EOF'
完了したフロア広さスケーリングの作業用ドキュメントを削除する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 付録: 実測値の一覧（テストの期待値の根拠）

`level_bounds_side` / `room_count_range` の値:

| 深度 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---|---|---|---|---|---|---|---|---|---|
| 一辺 | 32 | 35 | 39 | 42 | 45 | 49 | 52 | 55 | 59 | 62 |
| 部屋数 | 5–6 | 5–7 | 6–7 | 6–8 | 6–9 | 7–9 | 7–10 | 7–11 | 8–11 | 8–12 |

seed 1..300 での実測（Task 1〜3 適用後）:

| 深度 | 最小部屋数 | 空き部屋の最小 | 床の外接最大辺 | 最小の湧き候補数 | 最大頂点コスト |
|---|---|---|---|---|---|
| 1 | 5 | 2 | 31（上限 32） | 185 | 9,264 |
| 5 | 6 | 3 | 44（上限 45） | 331 | 17,340 |
| 10 | 8 | 5 | 61（上限 62） | 585 | 29,226 |
| 30 | 8 | 5 | 61（上限 62） | 585 | 29,226 |

湧き候補は「敵 + ヘルス最大 4 + ヤニ最大 3 + ドローン 1」に対して 10 倍以上の余裕があるため、`take()` が候補切れで打ち切られることはない。頂点コストは予算 60,000 に対して最大でも半分以下。

喫煙所距離の 100 シード平均（seed 1..100）: 深度 1 → 25.2、3 → 34.0、6 → 43.5、9 → 54.2、12 → 61.5、15 → 66.9、30 → 76.7。

敵密度の従来比: 深度 1 で 1.003、深度 3 で 1.002、深度 5 で 1.000、深度 10 で 1.000、深度 20 で 0.981（上限 100 が効くため）。
