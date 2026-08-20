# 喫煙所ビジュアル改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 喫煙所をスタンド灰皿＋標識の見た目にし、ダミーを踏んだ後は「灰皿撤去済み」が見た目とミニマップで分かるようにする。

**Architecture:** `m/q2.png`（1024×16、16×16タイル×64枠）の空き枠 32〜37 に新タイルを Codex 画像生成→`tools/atlas.py` で焼き込む。描画は既存の `push_block` / `push_sprite` / `push_light` の組み合わせだけで、`renderer.ts` は変更しない。煙は新設の `entity_smoke_t` が描く。

**Tech Stack:** TypeScript + Vite + Vitest。画像処理は Python（**必ず `uv run --with pillow`**、`python` 直叩き禁止）。

**Spec:** `docs/superpowers/specs/2026-08-20-smoking-area-visuals-design.md`

## Global Constraints

- `renderer.ts` は変更しない
- **触れる前は本物とダミーを完全に同一の見た目にする**（タイル・ライトとも差を出さない）
- 灰皿ブロックの側面タイルは 8 / 9 / 17 **以外**にする（この3つは `push_block` が高さ16にする。灰皿は高さ8で描く）
- Python は必ず `uv run` 経由（AGENTS.md）
- テストのモックパターンは既存の `entity-smoking-area.test.ts` に合わせる（`vi.hoisted` + `vi.mock('./renderer')` 等）
- コミットメッセージは既存に合わせ日本語の Conventional Commits 風（例: `feat: ...する`）

## タイル番号の割り当て（全タスク共通）

| # | 内容 | 用途 |
| --- | --- | --- |
| 32 | 灰皿の口（砂と吸い殻） | 灰皿ブロック天面 |
| 33 | ステンレス胴体＋オレンジ帯 | 灰皿ブロック側面 |
| 34 | ボルト跡＋色あせた円形の跡 | ダミー開示後の天面 |
| 35 | 「灰皿撤去済」貼り紙 | ダミー開示後の側面＋標識の差し替え |
| 36 | 青い「喫煙所」ピクトグラム看板 | 標識スプライト |
| 37 | 煙のひとかたまり | 煙スプライト |

---

### Task 1: アトラス焼き込みツール `tools/atlas.py`

**Files:**
- Create: `tools/atlas.py`

**Interfaces:**
- Consumes: なし
- Produces: CLI `uv run --with pillow python tools/atlas.py <src_dir>`。`<src_dir>` 内の `32.png`〜`37.png`（任意サイズ）を 16×16 に縮小し `m/q2.png` のタイル 32〜37 へ合成して上書き保存する。冪等（同じ入力なら何度実行しても同じ結果）

- [ ] **Step 1: スクリプトを書く**

```python
"""m/q2.png のタイル 32〜37 に画像を焼き込む。

使い方: uv run --with pillow python tools/atlas.py <src_dir>
<src_dir> に 32.png .. 37.png を置く（任意サイズ、正方形推奨）。
左上 (0,0) のピクセル色を背景キーとみなし、近い色を透過にする。
"""
import sys
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16
TILE_RANGE = range(32, 38)
# 背景キー色との距離（チャンネル毎の絶対差の和）がこの値以下なら透過
KEY_TOLERANCE = 90


def bake_tile(atlas: Image.Image, index: int, src_path: Path) -> None:
    src = Image.open(src_path).convert('RGBA')
    tile = src.resize((TILE_SIZE, TILE_SIZE), Image.BOX)

    key = tile.getpixel((0, 0))
    pixels = tile.load()
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            p = pixels[x, y]
            if sum(abs(p[i] - key[i]) for i in range(3)) <= KEY_TOLERANCE:
                pixels[x, y] = (0, 0, 0, 0)

    # 既存タイルを消してから貼る（冪等にするため）
    atlas.paste((0, 0, 0, 0), (index * TILE_SIZE, 0, (index + 1) * TILE_SIZE, TILE_SIZE))
    atlas.paste(tile, (index * TILE_SIZE, 0), tile)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('usage: uv run --with pillow python tools/atlas.py <src_dir>')
    src_dir = Path(sys.argv[1])

    atlas = Image.open(ATLAS).convert('RGBA')
    baked = []
    for index in TILE_RANGE:
        src_path = src_dir / f'{index}.png'
        if not src_path.exists():
            continue
        bake_tile(atlas, index, src_path)
        baked.append(index)

    if not baked:
        sys.exit(f'no source images (32.png..37.png) found in {src_dir}')
    atlas.save(ATLAS)
    print(f'baked tiles {baked} into {ATLAS}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 動作確認（単色のテスト画像で往復）**

scratch ディレクトリに単色 64×64 の `32.png` を作って焼き、該当タイルだけが変わることを確認する:

```bash
uv run --with pillow python -c "
from PIL import Image
import tempfile, pathlib
d = pathlib.Path(tempfile.mkdtemp())
img = Image.new('RGBA', (64, 64), (255, 0, 255, 255))  # 全面キー色
for x in range(16, 48):
    for y in range(16, 48):
        img.putpixel((x, y), (200, 120, 40, 255))
img.save(d / '32.png')
print(d)
"
```

出力されたディレクトリを引数に `uv run --with pillow python tools/atlas.py <dir>` を実行し、`baked tiles [32]` が出ること、`git diff --stat m/q2.png` が変更を示すことを確認。

- [ ] **Step 3: q2.png を元に戻してツールだけコミット**

```bash
git checkout -- m/q2.png
git add tools/atlas.py
git commit -m "feat: アトラス焼き込みツール tools/atlas.py を追加する"
```

---

### Task 2: Codex で6タイルぶんの画像を生成して焼き込む

**Files:**
- Modify: `m/q2.png`（タイル 32〜37）

**Interfaces:**
- Consumes: Task 1 の `tools/atlas.py`
- Produces: `m/q2.png` にタイル 32〜37 の絵が入った状態

- [ ] **Step 1: Codex に 6 枚の画像を生成させる**

scratch ディレクトリ（セッションの scratchpad）を出力先に指定し、Codex（codex CLI / codex:rescue エージェント）へ次を依頼する。**各画像は 512×512、背景はキー色マゼンタ `#ff00ff` の単色、低彩度で暗めのパレット（既存アトラスは暗い青灰・茶系）**。ファイル名はタイル番号。

| ファイル | プロンプト（英語で渡す） |
| --- | --- |
| `32.png` | pixel art, top-down view of a stainless steel standing ashtray opening: dark gray sand with a few cigarette butts, circular rim, dark muted palette, flat magenta #ff00ff background, no text |
| `33.png` | pixel art, front view of a stainless steel standing ashtray body: brushed metal, one horizontal orange stripe band, dark muted palette, flat magenta #ff00ff background, no text |
| `34.png` | pixel art, top-down view of a bare concrete floor patch where equipment was removed: four small bolt holes in a square, faded circular stain, dark muted palette, flat magenta #ff00ff background, no text |
| `35.png` | pixel art, small white paper notice taped to a wall, mostly blank with a few dark horizontal text-like lines, slightly crooked, dark muted palette, flat magenta #ff00ff background |
| `36.png` | pixel art, blue square smoking-area sign with a white cigarette pictogram (cigarette with smoke wisps), like a Japanese facility sign, dark muted palette, flat magenta #ff00ff background |
| `37.png` | pixel art, single small puff of light gray smoke, soft rounded cloud shape, semi-transparent look, flat magenta #ff00ff background |

Codex が画像生成ツールを持たない場合のフォールバック: Codex に「Pillow スクリプトで 64×64 のピクセルアートをプログラム描画する」形で同じ 6 枚を作らせる（`uv run --with pillow`）。

- [ ] **Step 2: 焼き込む**

```bash
uv run --with pillow python tools/atlas.py <生成画像のディレクトリ>
```

`baked tiles [32, 33, 34, 35, 36, 37]` が出ること。

- [ ] **Step 3: 目視確認**

タイル部分を 4 倍拡大して確認する（キー色の透過漏れ・つぶれのチェック）:

```bash
uv run --with pillow python -c "
from PIL import Image
img = Image.open('m/q2.png').crop((32*16, 0, 38*16, 16))
img.resize((img.width*8, img.height*8), Image.NEAREST).save('tile_preview.png')
"
```

`tile_preview.png` を開き、6 タイルそれぞれが判読できることを確認したら削除する。つぶれて判読できないタイルは Step 1 のプロンプトを調整して再生成→再焼き込み（冪等なのでそのまま上書きできる）。

- [ ] **Step 4: コミット**

```bash
git add m/q2.png
git commit -m "feat: 喫煙所ビジュアル用のタイル 32〜37 をアトラスに追加する"
```

---

### Task 3: 喫煙所の描画をスタンド灰皿＋標識に置き換え、ダミー開示を実装する

**Files:**
- Modify: `source/entity-smoking-area.ts`
- Test: `source/entity-smoking-area.test.ts`

**Interfaces:**
- Consumes: アトラスのタイル 32〜36（Task 2）
- Produces: `entity_smoking_area_t.revealed_dummy: boolean`（getter。Task 5 の minimap が使う）

- [ ] **Step 1: テストのモックを、描画呼び出しを記録する形に拡張する**

`source/entity-smoking-area.test.ts` の `mocks` と `vi.mock('./renderer', ...)` を差し替える:

```ts
const mocks = vi.hoisted(() => ({
  notices: [] as string[],
  blocks: [] as number[][],
  sprites: [] as number[][],
  lights: [] as number[][],
}))

vi.mock('./renderer', () => ({
  push_sprite: (...args: number[]) => { mocks.sprites.push(args) },
  push_light: (...args: number[]) => { mocks.lights.push(args) },
  push_block: (...args: number[]) => { mocks.blocks.push(args) },
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
```

`beforeEach` の末尾に記録のクリアを足す:

```ts
    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0
```

- [ ] **Step 2: 失敗するテストを書く**

`describe('喫煙所', ...)` 内に追加:

```ts
  it('触れる前は本物とダミーが同一の見た目で描かれる', () => {
    const real = new entity_smoking_area_t(64, 0, 64, 0, 18)
    real.is_real = true
    const dummy = new entity_smoking_area_t(128, 0, 128, 0, 18)

    idle(real, 0.5)
    const real_block = mocks.blocks[0].slice(2) // タイル引数のみ比較
    const real_sprite_tile = mocks.sprites[0][3]
    const real_lights = mocks.lights.length

    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0

    idle(dummy, 0.5)
    expect(mocks.blocks[0].slice(2)).toEqual(real_block)
    expect(mocks.sprites[0][3]).toBe(real_sprite_tile)
    expect(mocks.lights.length).toBe(real_lights)
  })

  it('灰皿は低いブロック（側面タイルが 8/9/17 以外）で描かれる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    idle(area, 0.5)
    const side_tile = mocks.blocks[0][3]
    expect([8, 9, 17]).not.toContain(side_tile)
  })

  it('ダミーを踏むと撤去跡タイルに差し替わり、ライトが消え、revealed_dummy が立つ', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = false
    expect(area.revealed_dummy).toBe(false)

    tick(area, player, 0.5) // 踏む
    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0

    idle(area, 0.5)
    expect(area.revealed_dummy).toBe(true)
    expect(mocks.blocks[0][2]).toBe(34) // 天面 = ボルト跡
    expect(mocks.blocks[0][3]).toBe(35) // 側面 = 貼り紙
    expect(mocks.sprites[0][3]).toBe(35) // 標識も貼り紙に
    expect(mocks.lights.length).toBe(0) // 消灯
  })

  it('本物は完了しても revealed_dummy は立たず、灰皿タイルのまま', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 一服完了

    mocks.blocks.length = 0
    idle(area, 0.5)
    expect(area.revealed_dummy).toBe(false)
    expect(mocks.blocks[0][2]).toBe(32)
    expect(mocks.blocks[0][3]).toBe(33)
  })
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run source/entity-smoking-area.test.ts`
Expected: FAIL（`revealed_dummy` が存在しない / タイルが 4・17 のまま）

- [ ] **Step 4: 実装する**

`source/entity-smoking-area.ts` の class 冒頭にタイル定数を追加し、`_render()` の描画部を置き換える:

```ts
// アトラス上の割り当て（tools/atlas.py が 32〜37 に焼き込む）。
// 側面タイルは 8/9/17 以外であること — push_block はその3つだけ高さ16にする。
// スタンド灰皿は低い方（高さ8）で描く。
const tile_ashtray_top = 32
const tile_ashtray_side = 33
const tile_removed_top = 34
const tile_removed_side = 35
const tile_sign = 36
```

class 内に getter を追加:

```ts
  // ダミーだと開示済みか。minimap が灰色化に使う
  get revealed_dummy(): boolean {
    return this._done && !this.is_real
  }
```

`_render()` 冒頭の `push_block(...)` と `push_light(...)` を差し替え:

```ts
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
        this._done ? 0.08 : 0.03 + Math.sin(this._animation_time * 3) * 0.01,
      )
    }
```

import に `push_sprite` を追加する（`push_block, push_light` と同じ `./renderer` から）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run source/entity-smoking-area.test.ts`
Expected: PASS（既存テスト含め全件）

- [ ] **Step 6: 型チェックとコミット**

```bash
npm run typecheck
git add source/entity-smoking-area.ts source/entity-smoking-area.test.ts
git commit -m "feat: 喫煙所をスタンド灰皿と標識で描き、ダミー開示で撤去跡に差し替える"
```

---

### Task 4: 煙エンティティと、完了した本物からの排出

**Files:**
- Create: `source/entity-smoke.ts`
- Create: `source/entity-smoke.test.ts`
- Modify: `source/entity-smoking-area.ts`
- Test: `source/entity-smoking-area.test.ts`

**Interfaces:**
- Consumes: `entity_t`（`./entity`）、アトラスのタイル 37
- Produces: `spawn_smoke(x: number, z: number): void`（`./entity-smoke`）

- [ ] **Step 1: 煙エンティティの失敗するテストを書く**

`source/entity-smoke.test.ts` を新規作成:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// entity.ts が renderer を import するため、Node 環境ではモックが要る
// （entity-smoking-area.test.ts と同じパターン）。
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))

import { entity_smoke_t, spawn_smoke } from './entity-smoke'
import { state } from './state'

describe('煙', () => {
  beforeEach(() => {
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
  })

  it('spawn_smoke はタイル 37 の煙エンティティを 1 個生成する', () => {
    spawn_smoke(64, 64)
    expect(state.entities.length).toBe(1)
    const smoke = state.entities[0]
    expect(smoke).toBeInstanceOf(entity_smoke_t)
    expect(smoke.s).toBe(37)
  })

  it('上昇し続け、約 2 秒で消える', () => {
    spawn_smoke(64, 64)
    const smoke = state.entities[0]

    state.time_elapsed = 0.5
    smoke._update()
    expect(smoke.y).toBeGreaterThan(0)
    expect(smoke._dead).toBe(false)

    for (let i = 0; i < 4; i++) { smoke._update() } // 累計 2.5 秒
    expect(smoke._dead).toBe(true)
    expect(state.entities_to_kill).toContain(smoke)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run source/entity-smoke.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: `source/entity-smoke.ts` を実装する**

```ts
import { entity_t } from './entity'
import { state } from './state'

// 一服完了後の喫煙所から立ちのぼる煙。物理（重力・摩擦・壁判定）は不要なので
// 基底の _update() は呼ばず、上昇と横揺れだけを自前で積分する。
const smoke_tile = 37
const smoke_lifetime = 2
const smoke_rise_speed = 8

export class entity_smoke_t extends entity_t {
  private _age = 0

  override _update(): void {
    this._age += state.time_elapsed
    this.y += smoke_rise_speed * state.time_elapsed
    this.x += Math.sin(this.y) * 2 * state.time_elapsed
    if (this._age > smoke_lifetime) {
      this._kill()
    }
  }
}

export function spawn_smoke(x: number, z: number): void {
  new entity_smoke_t(x, 0, z, 0, smoke_tile)
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run source/entity-smoke.test.ts`
Expected: PASS

- [ ] **Step 5: 排出側の失敗するテストを書く**

`source/entity-smoking-area.test.ts` に追加。**ファイル先頭の import に `entity_smoke_t` を足す**（`import { entity_smoke_t } from './entity-smoke'`）:

```ts
  it('完了した本物は 0.5 秒ごとに煙を 1 個ずつ出す', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 一服完了

    const count = (): number =>
      state.entities.filter((e) => e instanceof entity_smoke_t).length

    const before = count()
    idle(area, 0.5)
    idle(area, 0.5)
    expect(count()).toBe(before + 2)
  })

  it('ダミーと未完了の本物は煙を出さない', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5) // 踏んで開示
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true

    idle(dummy, 0.5)
    idle(real, 0.5)
    expect(state.entities.some((e) => e instanceof entity_smoke_t)).toBe(false)
  })
```

Run: `npx vitest run source/entity-smoking-area.test.ts`
Expected: 新規 2 件が FAIL

- [ ] **Step 6: 排出を実装する**

`source/entity-smoking-area.ts` に import を追加:

```ts
import { spawn_smoke } from './entity-smoke'
```

class にフィールドを追加:

```ts
  private _smoke_timer = 0
```

`_render()` の `this._animation_time += state.time_elapsed` の直後に追加:

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
```

- [ ] **Step 7: 全テストと型チェック**

Run: `npx vitest run` と `npm run typecheck`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add source/entity-smoke.ts source/entity-smoke.test.ts source/entity-smoking-area.ts source/entity-smoking-area.test.ts
git commit -m "feat: 一服完了した喫煙所から煙が立ちのぼるようにする"
```

---

### Task 5: ミニマップで開示済みダミーを灰色にする

**Files:**
- Modify: `source/minimap.ts:99-100`

**Interfaces:**
- Consumes: `entity_smoking_area_t.revealed_dummy`（Task 3）

`minimap.ts` は module 初期化時に canvas へ触るため Node でテストできない（既存テストなし）。Task 3 で `revealed_dummy` の遷移はテスト済みなので、ここは色分岐の 3 行だけを変更し、確認は Task 6 のブラウザ検証で行う。

- [ ] **Step 1: 色分岐を実装する**

`minimap_draw()` の喫煙所の分岐を差し替え:

```ts
    if (e instanceof entity_smoking_area_t) {
      // 開示済みダミーだけ灰色。それ以外（未接触・本物）は同じオレンジで、
      // 見分けは足で確かめるしかない
      if (e.revealed_dummy) {
        minimap_set_pixel(index, 110, 110, 110)
      } else {
        minimap_set_pixel(index, 238, 153, 0)
      }
    } else if (e instanceof entity_exit_t && state.exit_open) {
```

- [ ] **Step 2: 型チェックとコミット**

```bash
npm run typecheck
git add source/minimap.ts
git commit -m "feat: 開示済みダミー喫煙所をミニマップで灰色にする"
```

---

### Task 6: ブラウザ検証と docs への蒸留

**Files:**
- Modify: `docs/gameplay.md`
- Delete: `docs/superpowers/specs/2026-08-20-smoking-area-visuals-design.md`
- Delete: `docs/superpowers/plans/2026-08-20-smoking-area-visuals.md`

- [ ] **Step 1: `npm run dev` で目視確認**

確認項目:

1. 本物とダミーが、触れる前は見た目で区別できない（灰皿＋標識＋オレンジ点滅ライト）
2. 灰皿ブロックが壁より低い
3. ダミーを踏むと、ボルト跡＋貼り紙に変わりライトが消える
4. 本物で一服完了すると煙が立ちのぼり続ける
5. ミニマップ: 踏んだダミーだけ灰色、他はオレンジ
6. タイルの絵が判読できる（つぶれていたら Task 2 Step 1 に戻ってプロンプト調整→再焼き込み）

ヘッドレスで確認する場合は `docs/architecture.md`「ブラウザでの動作検証」の手順（rAF 停止・`performance.now` スタブ・同一ターン `readPixels`）に従う。

- [ ] **Step 2: docs/gameplay.md に結論を蒸留する**

「ダミー喫煙所」セクションの末尾に追記:

```markdown
触れる前は本物とダミーは in-world でも同一の見た目（スタンド灰皿＋喫煙所標識＋オレンジの点滅ライト）で描かれる。踏んで開示された後だけ、ボルト跡と「灰皿撤去済」の貼り紙に差し替わり、ライトが消え、ミニマップ上も灰色になる。一服完了した本物は煙を出し続ける。喫煙所まわりのタイル（アトラス 32〜37）は `tools/atlas.py` で焼き込む。灰皿ブロックの側面タイルが 8/9/17 以外であることが「低いブロック」の条件（`push_block` の仕様）。
```

- [ ] **Step 3: スペックと本計画を削除してコミット**

```bash
git rm docs/superpowers/specs/2026-08-20-smoking-area-visuals-design.md docs/superpowers/plans/2026-08-20-smoking-area-visuals.md
git add docs/gameplay.md
git commit -m "docs: 喫煙所ビジュアルの結論を gameplay.md に蒸留し作業ドキュメントを削除する"
```
