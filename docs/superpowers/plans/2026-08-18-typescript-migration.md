# TypeScript + Vite 移行 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 素の JavaScript を `<script>` 20 本で読み込む現構成を、TypeScript + Vite + Vitest の ESM 構成に一括移行する。

**Architecture:** グローバル `var` による結合を ESM の import/export に置き換える。境界を越えて再代入される変数は `state.ts` の `state` オブジェクトと `renderer.ts` の `camera` オブジェクトに集約する。`state.ts` が実行時 import を持たないことで循環参照を断つ。新しい `.ts` は既存の `.js` と並存させ、最終タスクで `index.html` を切り替えて `.js` を一括削除する。

**Tech Stack:** TypeScript 5、Vite 6、Vitest 2、WebGL 1、Web Audio API

設計書: [2026-08-18-typescript-migration-design.md](../specs/2026-08-18-typescript-migration-design.md)

## Global Constraints

- ソースディレクトリは `source/` のまま。`src/` に改名しない
- `strict: true`、ただし `noUncheckedIndexedAccess` は無効
- `_` 接頭辞は名前を変えない。`private` / `protected` / `public` 修飾子で意図を表現する
- `sonantx-reduced.js` はサードパーティ（zlib ライセンス）。変更は「末尾への `export` 追加」と「`_math` → `Math` の置換 6 箇所」の 2 点のみ。アルゴリズムとライセンスヘッダのコメントには触れない
- `allowJs` は使わない。`sonantx-reduced.d.ts` が型解決を担う
- 13KB 制約は追わない
- 後方互換レイヤーを作らない。置き換えたコードパスは削除する
- Python を実行する場合は必ず `uv run python` 経由
- ゲーム内のテキストは日本語のまま維持する。文面を変更しない
- **`.ts` ファイルのインデントは半角スペース 2 個**。旧 `.js` はタブだったが、Task 8 で `source/` はほぼ全て `.ts` になるため新しい規約に寄せる。ファイル内でタブと混在させないこと。既存の `.js` からの移植で本文がタブのままになっている場合は、そのファイル全体をスペース 2 個に揃える（文字列リテラルの中身は対象外 — GLSL や日本語テキストの内部は一切変更しない）

## 移行中の検証方法

Task 1〜7 の間は `index.html` が旧 `.js` を読み続けるため、**ゲームの動作確認は `uv run python -m http.server 8000` で行う**。`.ts` 側は `npm run typecheck` と `npm test` で検証する。Task 8 で `index.html` を切り替えた時点から `npm run dev` に移る。

`tsconfig.json` は `include: ["source"]` かつ `allowJs` なしなので、並存期間中も旧 `.js` は tsc の対象外になる。

**並存には 1 つ落とし穴がある。** Vite の既定の拡張子解決順は `['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']` で `.js` が `.ts` より先に来る。そのため `import { random_int } from './random'` は、`random.ts` があっても**旧 `random.js` に解決される**。旧 `.js` は素のグローバル `var` 宣言で ES export を持たないため、import は失敗する。Vitest も Vite の解決を使うのでテストが落ちる。

`vite.config.ts` の `resolve.extensions` で `.ts` 系を先に置くことで解決する（Task 1 の設定に含めてある）。この設定は並存期間専用なので Task 8 で削除する。

---

### Task 1: ツールチェーン導入と 13KB パイプラインの削除

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `source/vite-env.d.ts`
- Delete: `build.sh`, `shrinkit.js`, `.nojekyll`, `source/html-template.html`

**Interfaces:**
- Consumes: なし
- Produces: `npm run dev` / `build` / `preview` / `test` / `typecheck` の 5 スクリプト。`source/*.png` の import 型（`vite-env.d.ts` 経由）

`source/html-template.html` は `build.sh` が `sed` で `GAME_SOURCE` を差し替えるためのテンプレートで、`build.sh` 以外から参照されていないため一緒に削除する。

- [ ] **Step 1: package.json を書き換える**

`name` のタイポ（`undderun`）を直し、`uglify-es` を削除して開発依存を入れる。

```json
{
  "name": "takagiaction",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "WebGL 製トップダウン・アクションシューティング",
  "license": "ISC",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: tsconfig.json を作成する**

```jsonc
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022", "dom"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noEmit": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["source"]
}
```

`noImplicitOverride` は entity 階層のために入れる。9 サブクラスが基底のメソッドを上書きするが、このフラグがないと `override` の付け忘れをコンパイラが検出しない。「上書きするつもりで名前を間違え、別メソッドを新設していた」類の誤りが黙って通ってしまう。有効にすると TS4114 で弾かれる。

`noUncheckedIndexedAccess` を明示的に `false` にしているのは、`strict` に含まれないフラグであることを読み手に示すため。`level_data[i]` と `keys[code]` の添字アクセスが全域にあり、有効にすると全部 `| undefined` になる。

- [ ] **Step 3: vite.config.ts を作成する**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages のプロジェクトページは /takagiaction/ 配下で配信されるため相対パスにする
  base: './',
  resolve: {
    // Task 2〜7 は同名の .js（旧実装）と .ts（移行後）が並存する。Vite の既定は
    // ['.mjs', '.js', '.mts', '.ts', ...] で .js が .ts より先に解決されるため、
    // 拡張子なし import (`./random` 等) が export を持たない旧 .js に解決されて
    // しまう。.ts 系を先に置いて新実装を使わせる。Task 8 で旧 .js を削除したら
    // 不要になるので、そこで削除する。
    extensions: ['.mjs', '.mts', '.ts', '.js', '.jsx', '.tsx', '.json'],
  },
  build: {
    outDir: 'dist',
  },
})
```

`resolve.extensions` は並存期間だけのための設定である。Task 8 で削除する（下記 Task 8 のステップに含まれる）。

- [ ] **Step 4: source/vite-env.d.ts を作成する**

`import atlas_url from '../m/q2.png'` の型を通すために必要。

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: .gitignore を更新する**

`build` を削除して `dist` を追加する。`.superpowers`（Subagent-Driven Development の作業ディレクトリ）の行は消さないこと。最終的な内容:

```
node_modules
work
dist

.superpowers
```

- [ ] **Step 6: 13KB パイプラインを削除する**

```bash
git rm build.sh shrinkit.js .nojekyll source/html-template.html
git rm -r build
```

`build/` は `.gitignore` に入っているが `build/dummy.txt` が**追跡されている**（`git ls-files build` で確認できる）。`rm -rf build` だと未ステージの削除しか作られず Step 11 の `git add` に含まれないため、`git rm -r build` を使う。

`.nojekyll` は `actions/upload-pages-artifact` 経由のデプロイでは Jekyll が走らないため不要。

- [ ] **Step 7: 依存をインストールする**

```bash
npm install
```

- [ ] **Step 8: 型チェックが通ることを確認する**

Run: `npm run typecheck`
Expected: エラーなしで終了（`source/` 配下の `.ts` は `vite-env.d.ts` のみ）

- [ ] **Step 9: Vitest が起動することを確認する**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found` と表示され exit code 0

- [ ] **Step 10: 旧構成のゲームがまだ動くことを確認する**

Run: `uv run python -m http.server 8000`
`http://localhost:8000/` を開き、クリックしてイントロが流れ、ゲームが始まり、矢印キーで移動できることを確認する。この時点では `index.html` は未変更なので旧 `.js` で動く。

- [ ] **Step 11: コミット**

```bash
git add package.json package-lock.json .gitignore tsconfig.json vite.config.ts source/vite-env.d.ts
git commit -m "chore: Vite + TypeScript + Vitest を導入し js13k 用ビルドを削除"
```

---

### Task 2: dom.ts と random.ts

**Files:**
- Create: `source/dom.ts`
- Create: `source/random.ts`
- Create: `source/random.test.ts`

**Interfaces:**
- Consumes: なし（どちらも依存ゼロ）
- Produces:
  - `dom.ts`: `export const canvas: HTMLCanvasElement`、`export const minimap_canvas: HTMLCanvasElement`、`export const terminal_el: HTMLElement`
  - `random.ts`: `export function random_seed(seed?: number): void`、`export function random_int(min: number, max: number): number`、`export function array_rand<T>(array: T[]): T`

`dom.ts` は要素 ID の暗黙グローバル（`c` / `m` / `a`）を置き換える。`c` は renderer と terminal の 2 モジュールから使われるため、`getElementById` と型アサーションの重複を避ける意味でも集約する。

- [ ] **Step 1: source/dom.ts を作成する**

```ts
// index.html の要素 ID による暗黙グローバル（c / m / a）の置き換え。
// 3 要素とも index.html に静的に存在するため、取得失敗はプログラミングエラーとして扱う。

export const canvas = document.getElementById('c') as HTMLCanvasElement
export const minimap_canvas = document.getElementById('m') as HTMLCanvasElement
export const terminal_el = document.getElementById('a') as HTMLElement
```

- [ ] **Step 2: random.ts の失敗するテストを書く**

`source/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { array_rand, random_int, random_seed } from './random'

describe('random', () => {
  it('同じシードからは同じ列が出る', () => {
    random_seed(0xbadc0de1)
    const first = [random_int(0, 99), random_int(0, 99), random_int(0, 99)]

    random_seed(0xbadc0de1)
    const second = [random_int(0, 99), random_int(0, 99), random_int(0, 99)]

    expect(second).toEqual(first)
  })

  it('異なるシードでは列が変わる', () => {
    random_seed(1)
    const a = [random_int(0, 999), random_int(0, 999), random_int(0, 999)]

    random_seed(2)
    const b = [random_int(0, 999), random_int(0, 999), random_int(0, 999)]

    expect(b).not.toEqual(a)
  })

  it('min 以上 max 以下の整数を返す', () => {
    random_seed(42)
    for (let i = 0; i < 500; i++) {
      const n = random_int(3, 7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
    }
  })

  it('min と max が同じなら常にその値を返す', () => {
    random_seed(42)
    expect(random_int(5, 5)).toBe(5)
    expect(random_int(5, 5)).toBe(5)
  })

  it('array_rand は配列の要素を返す', () => {
    random_seed(7)
    const source = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) {
      expect(source).toContain(array_rand(source))
    }
  })

  // 上の 5 件はどれも自己整合性しか見ていないため、LCG の定数やシフト量を
  // 別の「それらしい」値に変えても通ってしまう。レベル生成の再現性が壊れるので、
  // 旧 source/random.js から抽出した実際の出力列そのものを固定する。
  it('旧実装と同一の列を返す（レベル生成の再現性）', () => {
    // load_level が使うシード
    random_seed(0xbadc0de1)
    expect(Array.from({ length: 10 }, () => random_int(0, 99)))
      .toEqual([0, 7, 55, 68, 94, 70, 15, 30, 28, 59])

    random_seed(1)
    expect(Array.from({ length: 5 }, () => random_int(0, 999)))
      .toEqual([286, 4, 725, 316, 367])

    // 引数なし = 既定シード 0xBADC0FFE。seed が undefined のときの
    // `seed || 0xbadc0ffe` と `seed ?? 0` の両方の経路を固定する
    random_seed()
    expect(Array.from({ length: 5 }, () => random_int(0, 99)))
      .toEqual([34, 79, 37, 13, 16])
  })
})
```

ゴールデン値の出どころは旧実装である。新実装から取ると循環するため、以下で抽出した実測値を使っている（`random.js` は素の `var` 宣言なので `node -e` にそのまま流せる）。

```bash
node -e "$(cat source/random.js); random_seed(0xBADC0DE1); console.log(JSON.stringify(Array.from({length:10},()=>random_int(0,99))))"
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run source/random.test.ts`

Expected: FAIL。ただし**失敗の理由に注意**。`.js` と `.ts` が並存する構成のため、`./random` は既存の `source/random.js` に解決される。旧 `.js` は素のグローバル `var` 宣言で ES export を持たないため、import 自体は成功して名前が `undefined` になり、`TypeError: random_seed is not a function` で落ちる。

`Failed to resolve import` にはならない（解決先のファイルは存在するため）。どちらの形であれ「実装がまだ有効な ESM として存在しない」ことを示していれば RED として正しい。

- [ ] **Step 4: source/random.ts を作成する**

`source/random.js` からの移植。変更点は 2 つだけ：`rand_high` / `rand_low` を `0` で明示初期化する（`strict` は未初期化の `let` を許さない。`random_seed()` が必ず先に呼ばれるため挙動は変わらない）、`array_rand` をジェネリックにする。

```ts
let rand_high = 0
let rand_low = 0

export function random_int(min: number, max: number): number {
  rand_high = ((rand_high << 16) + (rand_high >> 16) + rand_low) & 0xffffffff
  rand_low = (rand_low + rand_high) & 0xffffffff
  const n = (rand_high >>> 0) / 0xffffffff
  return (min + n * (max - min + 1)) | 0
}

export function random_seed(seed?: number): void {
  rand_high = seed || 0xbadc0ffe
  rand_low = (seed ?? 0) ^ 0x49616e42
}

export function array_rand<T>(array: T[]): T {
  return array[random_int(0, array.length - 1)]
}
```

`random_seed` の元コードは `rand_low = seed ^ 0x49616e42` で、`seed` が `undefined` のとき JS では `0 ^ 0x49616e42` に評価される。`seed ?? 0` はその挙動を明示的に書いたもの。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run source/random.test.ts`
Expected: PASS（6 件）

- [ ] **Step 6: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add source/dom.ts source/random.ts source/random.test.ts
git commit -m "feat: dom.ts と random.ts を TypeScript で追加しシード再現性をテストする"
```

---

### Task 3: renderer.ts

**Files:**
- Create: `source/renderer.ts`（`source/renderer.js` からの移植）

**Interfaces:**
- Consumes: `dom.ts` の `canvas`
- Produces:
  - `export const camera: { x: number; y: number; z: number; shake: number }`
  - `export function renderer_init(): void`
  - `export function renderer_bind_image(image: HTMLImageElement): void`
  - `export function renderer_prepare_frame(): void`
  - `export function renderer_end_frame(): void`
  - `export function renderer_reset_level_geometry(): void`
  - `export function renderer_freeze_level_geometry(): void`
  - `export function push_sprite(x: number, y: number, z: number, tile: number): void`
  - `export function push_floor(x: number, z: number, tile: number): void`
  - `export function push_block(x: number, z: number, tile_top: number, tile_sites: number): void`
  - `export function push_light(x: number, y: number, z: number, r: number, g: number, b: number, falloff: number): void`

- [ ] **Step 1: renderer.js を renderer.ts としてコピーする**

```bash
cp source/renderer.js source/renderer.ts
```

- [ ] **Step 2: 先頭の宣言部を書き換える**

`renderer.js:1-23` の `var` 連結を以下に置き換える。`gl` の nullable はここで潰す（WebGL が取れなければゲームが成立しないため実行時チェックは入れない）。

```ts
import { canvas } from './dom'

const gl = (canvas.getContext('webgl') ||
  canvas.getContext('experimental-webgl')) as WebGLRenderingContext

let vertex_buffer: WebGLBuffer
let shader_program: WebGLProgram

const texture_size = 1024
const tile_size = 16
const tile_fraction = tile_size / texture_size
const px_nudge = 0.5 / texture_size

const max_verts = 1024 * 64
let num_verts = 0
let level_num_verts = 0
const buffer_data = new Float32Array(max_verts * 8) // allow 64k verts, 8 properties per vert

let light_uniform: WebGLUniformLocation
const max_lights = 16
let num_lights = 0
const light_data = new Float32Array(max_lights * 7) // 32 lights, 7 properties per light

// camera はゲームロジック（game.ts の追従計算、entity のシェイク加算）から
// 書き換えられるため、オブジェクトのプロパティとして公開する。
export const camera = { x: 0, y: 0, z: 0, shake: 0 }

let camera_uniform: WebGLUniformLocation
```

`num_verts` / `num_lights` / `level_num_verts` は export しない。renderer の内部実装として隠す。

- [ ] **Step 3: シェーダ文字列の宣言を const に変える**

`shader_attribute_vec` / `shader_varying` / `shader_uniform` / `shader_const_mat4` / `vertex_shader` / `fragment_shader` は `var` から `const` にするだけ。文字列の内容は 1 文字も変えない（GLSL のソースなので改変するとレンダリングが壊れる）。

`shader_const_mat4`（`renderer.js:31`）を落とさないこと。`vertex_shader` の 40-41 行が参照している。

- [ ] **Step 4: renderer_init の WebGL 関数名短縮ループを削除する**

`renderer.js:78-86` に「Create shorthand WebGL function names」というループがある。

```js
for (var name in gl) {
    if (gl[name].length != udef) {
        gl[name.match(/(^..|[A-Z]|\d.|v$)/g).join('')] = gl[name];
    }
}
```

これは js13k 用に `gl.bindBuffer` などの短縮別名を `gl` 上に生やす仕掛けだが、**生成された短縮名はコード中のどこからも呼ばれていない**（renderer.js は一貫してフルネームで呼んでいる）。完全な死んだコードなので削除する。削除すると `udef` と `gl[name]` の任意添字アクセスが同時に消え、`strict` 下の 2 つのエラー要因がなくなる。

コメントアウトされている `webglShortFunctionNames` の行も一緒に削除する。

これで `udef` はコードベースから完全に消える（`udef` を参照していたのは `game.js` と `renderer.js` の 2 ファイルのみ）。

- [ ] **Step 5: 関数に export と型注釈を付ける**

`renderer_init` / `renderer_bind_image` / `renderer_prepare_frame` / `renderer_end_frame` / `push_quad` / `push_sprite` / `push_floor` / `push_block` / `push_light` に `export` を付け、引数に `: number` を付ける。`renderer_bind_image` の引数は `image: HTMLImageElement`。

`push_quad` と `compile_shader` と `enable_vertex_attrib` は renderer 内部からのみ呼ばれるため `export` しない（`push_quad` は `push_sprite` / `push_floor` / `push_block` 経由で使われる）。

- [ ] **Step 6: nullable な WebGL リソースを潰す**

`strict` 下で `| null` を返すのは以下。いずれも失敗したらゲームが成立しないため、実行時チェックは入れず非 null アサーションで潰す。

| 箇所 | 対応 |
| --- | --- |
| `gl.createBuffer()`（`renderer.js:88`） | `gl.createBuffer()!` |
| `gl.createProgram()`（`renderer.js:92`） | `gl.createProgram()!` |
| `gl.getUniformLocation(...)`（`renderer.js:98-99`） | 末尾に `!` |
| `gl.createShader(...)`（`compile_shader` 内） | `gl.createShader(shader_type)!` |
| `gl.createTexture()`（`renderer_bind_image` 内） | 変数に取らず直接渡しているので変更不要 |

`compile_shader(shader_type: number, shader_source: string): WebGLShader` と型を付ける。

- [ ] **Step 7: camera_* の参照を camera オブジェクトに書き換える**

`renderer.ts` 内で `camera_x` / `camera_y` / `camera_z` を参照している箇所をすべて `camera.x` / `camera.y` / `camera.z` にする。該当は `renderer_end_frame` の `gl.uniform3f(camera_uniform, camera_x, camera_y - 10, camera_z-30)` と `push_light` の距離判定 2 箇所。

- [ ] **Step 8: canvas 要素と _math の参照を直す**

- `renderer.js:104` の `gl.viewport(0,0,c.width,c.height)` → `gl.viewport(0, 0, canvas.width, canvas.height)`
- `renderer.ts` 内の `_math.` をすべて `Math.` に置き換える（該当は `push_light` の `_math.abs` 2 箇所）

- [ ] **Step 9: 頂点カウンタ操作の 2 関数を追加する**

ファイル末尾に追加。`game.js:49-50` の `num_verts = 0; num_lights = 0;` と `game.js:130` の `level_num_verts = num_verts;` を置き換えるためのもの。

```ts
// レベル形状の構築を始める前に呼ぶ。
export function renderer_reset_level_geometry(): void {
  num_verts = 0
  num_lights = 0
}

// レベル形状の構築を終えた時点の頂点数を固定する。
// 以降 renderer_prepare_frame() がこの位置までを毎フレームの起点にする。
export function renderer_freeze_level_geometry(): void {
  level_num_verts = num_verts
}
```

- [ ] **Step 10: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし。とくに `udef` / `gl[name]` / `c.width` 由来のエラーが 0 件であること

- [ ] **Step 11: コミット**

```bash
git add source/renderer.ts
git commit -m "feat: renderer を TypeScript 化し camera を公開して頂点カウンタを隠蔽する"
```

---

### Task 4: state.ts と entity.ts

**Files:**
- Create: `source/state.ts`
- Create: `source/entity.ts`（`source/entity.js` からの移植）
- Create: `source/entity.test.ts`

**Interfaces:**
- Consumes: `renderer.ts` の `push_sprite`
- Produces:
  - `state.ts`: `export const level_width: number`（64）、`export const level_height: number`（64）、`export const level_data: Uint8Array`、`export const state`（プロパティ: `time_elapsed` `game_running` `current_level` `cpus_total` `cpus_rebooted` `entity_player` `entities` `entities_to_kill`）
  - `entity.ts`: `export class entity_t`（型引数なし。`_init(init_param?: number)`）

`state.ts` と `entity.ts` は型のみの相互参照で結ばれるため同一タスクで作る。`state.ts` は `import type` しか持たず**実行時 import を持たない**。これがこの構成全体の循環参照を断つ鍵。

この時点では `entity_player_t` が未作成なので `state.entity_player` は `entity_t | null` として型付けし、Task 5 で `entity_player_t | null` に狭める。

- [ ] **Step 1: source/state.ts を作成する**

```ts
import type { entity_t } from './entity'

// 実行時 import を持たないこと。型のみの import はコンパイル時に消えるため、
// このモジュールは依存グラフの葉になり循環参照の起点にならない。

export const level_width = 64
export const level_height = 64

// 中身を書き換えるのみで再代入されないため const で公開できる
export const level_data = new Uint8Array(level_width * level_height)

// モジュール境界を越えて再代入されるものはオブジェクトのプロパティにする。
// ESM では import した束縛そのものに代入できない。
export const state = {
  time_elapsed: 0,
  game_running: 0,
  current_level: 0,
  cpus_total: 0,
  cpus_rebooted: 0,
  // Task 5 で entity_player_t | null に狭める
  entity_player: null as entity_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
```

- [ ] **Step 2: 壁衝突判定の失敗するテストを書く**

`source/entity.test.ts`。`level_data` はタイル値 8 以上を壁として扱う（`entity.js:47-52`）。エンティティの当たり判定は左上・右上・右下・左下の 4 点で、幅 6px・高さ 4px 相当のボックスをタイル 8px グリッドに対して調べる。

`entity.ts` は `renderer.ts` の `push_sprite` を import し、`renderer.ts` は `dom.ts` を経由して `document.getElementById()` と `canvas.getContext('webgl')` を**モジュール初期化時に**実行する。Vitest の既定 environment は Node なので `document` が無く、テストが 1 件も走る前に import 解決で落ちる。`vi.mock()` で `renderer` を差し替えて、`renderer.ts` と `dom.ts` を一度も評価させないようにする。

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// entity.ts → renderer.ts → dom.ts は document と canvas に触るため、
// Node 環境では import 時点で落ちる。renderer を差し替えて評価を防ぐ。
// vi.mock は Vitest が巻き上げるので位置に関係なく効くが、
// 何を回避しているかが読めるよう import の前に置く。
vi.mock('./renderer', () => ({
  push_sprite: () => {},
}))

import { entity_t } from './entity'
import { level_data, level_width, state } from './state'

// テスト用にタイル座標 (tx, tz) を壁にする
function set_wall(tx: number, tz: number): void {
  level_data[tx + tz * level_width] = 8
}

describe('entity_t の壁衝突', () => {
  beforeEach(() => {
    level_data.fill(1) // すべて床
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
  })

  it('床の上では衝突しない', () => {
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('壁タイルの上では衝突する', () => {
    set_wall(2, 2) // ワールド座標 16..23
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(true)
  })

  it('右端の判定点が壁に入ると衝突する', () => {
    set_wall(3, 2) // ワールド座標 24..31
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    // x=18 なら右端 x+6=24 がタイル 3 に入る
    expect(e.probe_collides(18, 16)).toBe(true)
    // x=16 なら右端 x+6=22 でタイル 2 に収まる
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('下端の判定点が壁に入ると衝突する', () => {
    set_wall(2, 3) // ワールド座標 24..31
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    // z=20 なら下端 z+4=24 がタイル 3 に入る
    expect(e.probe_collides(16, 20)).toBe(true)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('タイル値 7 は床なので衝突しない', () => {
    level_data[2 + 2 * level_width] = 7
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('生成すると state.entities に登録される', () => {
    const e = new entity_t(0, 0, 0, 0, 0)
    expect(state.entities).toContain(e)
  })

  it('致死ダメージで entities_to_kill に入り _dead が立つ', () => {
    const e = new entity_t(0, 0, 0, 0, 0)
    e._receive_damage(e, 99)
    expect(e._dead).toBe(true)
    expect(state.entities_to_kill).toContain(e)
  })
})
```

`_collides` は `protected` なので外から直接呼べない。**本番コードにテスト専用の入口は作らず**、テストファイル内にサブクラスを定義して protected メンバを露出させる。

```ts
// _collides は protected。本番コードにテスト用の口を開けたくないので、
// テスト内のサブクラスから覗く。
class entity_probe_t extends entity_t {
  probe_collides(x: number, z: number): boolean {
    return this._collides(x, z)
  }
}
```

`_kill` のほうは専用の口が要らない。`_receive_damage` が `public` なので、致死量のダメージを与えれば `_kill` が走る（`entity.ts` の `_receive_damage` は `h <= 0` で `_kill()` を呼ぶ）。テストとしても内部呼び出しより振る舞い経由のほうが素直。

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run source/entity.test.ts`
Expected: FAIL。`Failed to resolve import "./entity"`

- [ ] **Step 4: source/entity.ts を作成する**

`source/entity.js` からの移植。変更点は 4 つ：`state` 経由の参照、`_spawn_particles` の削除（Task 5 で `entity-particle.ts` の自由関数になる）、可視性修飾子、`_dead` の明示初期化。

```ts
import { push_sprite } from './renderer'
import { level_data, level_width, state } from './state'

export class entity_t {
  x: number
  y: number
  z: number
  vx = 0
  vy = 0
  vz = 0
  ax = 0
  ay = 0
  az = 0
  f: number
  s: number
  h = 5

  // game.ts のループが毎フレーム読む（entities のフィルタ前に飛ばすため）
  _dead = false

  constructor(
    x: number,
    y: number,
    z: number,
    friction: number,
    sprite: number,
    init_param?: number,
  ) {
    this.x = x
    this.y = y
    this.z = z
    this.f = friction
    this.s = sprite

    this._init(init_param)
    state.entities.push(this)
  }

  // separate _init() method, because "constructor" cannot be uglyfied
  protected _init(init_param?: number): void {}

  _update(): void {
    const t = this
    const last_x = t.x
    const last_z = t.z

    // velocity
    t.vx += t.ax * state.time_elapsed - t.vx * Math.min(t.f * state.time_elapsed, 1)
    t.vy += t.ay * state.time_elapsed - t.vy * Math.min(t.f * state.time_elapsed, 1)
    t.vz += t.az * state.time_elapsed - t.vz * Math.min(t.f * state.time_elapsed, 1)

    // position
    t.x += t.vx * state.time_elapsed
    t.y += t.vy * state.time_elapsed
    t.z += t.vz * state.time_elapsed

    // check wall collissions, horizontal
    if (t._collides(t.x, last_z)) {
      t._did_collide()
      t.x = last_x
      t.vx = 0
    }

    // check wall collissions, vertical
    if (t._collides(t.x, t.z)) {
      t._did_collide()
      t.z = last_z
      t.vz = 0
    }
  }

  // テストがサブクラス経由で呼ぶため protected（本番コードからは entity 階層内のみ）
  protected _collides(x: number, z: number): boolean {
    return (
      level_data[(x >> 3) + (z >> 3) * level_width] > 7 || // top left
      level_data[((x + 6) >> 3) + (z >> 3) * level_width] > 7 || // top right
      level_data[((x + 6) >> 3) + ((z + 4) >> 3) * level_width] > 7 || // bottom right
      level_data[(x >> 3) + ((z + 4) >> 3) * level_width] > 7 // bottom left
    )
  }

  // collision against static walls
  protected _did_collide(): void {}

  // collision against other entities
  _check(other: entity_t): void {}

  _receive_damage(from: entity_t, amount: number): void {
    this.h -= amount
    if (this.h <= 0) {
      this._kill()
    }
  }

  protected _kill(): void {
    if (!this._dead) {
      this._dead = true
      state.entities_to_kill.push(this)
    }
  }

  _render(): void {
    const t = this
    push_sprite(t.x - 1, t.y, t.z, t.s)
  }
}
```

元コードの `_did_collide(t.x, t.y)` は引数を渡していたが、基底の定義とすべてのオーバーライド（`entity-plasma.js:14`、`entity-sentry.js:74`）が引数を受け取っていない。引数なしに揃える。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run source/entity.test.ts`
Expected: PASS（7 件）

- [ ] **Step 6: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add source/state.ts source/entity.ts source/entity.test.ts
git commit -m "feat: state.ts と entity.ts を追加し壁衝突判定をテストする"
```

---

### Task 5: entity 群の TypeScript 化

**Files:**
- Create: `source/entity-particle.ts`（`entity-particle.js` からの移植 + `spawn_particles`）
- Create: `source/entity-player.ts`
- Create: `source/entity-plasma.ts`
- Create: `source/entity-cpu.ts`
- Create: `source/entity-spider.ts`
- Create: `source/entity-sentry.ts`
- Create: `source/entity-health.ts`
- Create: `source/entity-explosion.ts`
- Modify: `source/state.ts`（`entity_player` の型を狭める）

**Interfaces:**
- Consumes: `entity.ts` の `entity_t`、`state.ts` の `state` / `level_data` / `level_width`、`renderer.ts` の `push_sprite` / `push_light` / `push_block` / `camera`、`random.ts` の `random_int`、`audio.ts`（Task 6 で作成、この時点では未解決）
- Produces: 各 entity クラスと `export function spawn_particles(source: entity_t, amount: number): void`

**このタスクは Task 6 と 7 の完了まで型チェックが通らない。** entity 群は `audio.ts`（`audio_play` / `audio_sfx_*`）、`terminal.ts`（`terminal_show_notice`）、`game.ts`（`reload_level` / `next_level`）、`input.ts`（`entity-player.ts` が `keys` と `key_*` 定数を参照）を参照するため。Step の最後で「未解決の import のみがエラーとして残る」ことを確認する。

`input.ts` は `audio.ts` の `audio_toggle` に依存するため Task 6 より前には作れない。よって Task 5 の時点では `./audio` `./terminal` `./game` `./input` の 4 モジュールが未解決になる。

- [ ] **Step 1: entity-particle.ts を作成し spawn_particles を移す**

`entity.js:56-63` の `_spawn_particles` メソッドを自由関数として `entity-particle.ts` に移す。**これは設計上必須の変更**で、基底クラス `entity_t` が サブクラス `entity_particle_t` を `new` していると ESM のモジュール初期化時に `extends entity_t` が TDZ に入り `ReferenceError: Cannot access 'entity_t' before initialization` になる。

```ts
import { entity_t } from './entity'
import { state } from './state'

export class entity_particle_t extends entity_t {
  private _lifetime = 3

  override _update(): void {
    this.ay = -320

    if (this.y < 0) {
      this.y = 0
      this.vy = -this.vy * 0.96 // 地面で跳ね返る
    }
    super._update()
    this._lifetime -= state.time_elapsed
    if (this._lifetime < 0) {
      this._kill()
    }
  }
}

// entity.ts の _spawn_particles メソッドから移した自由関数。
// 基底クラスが特定のサブクラスを new すると ESM の初期化時に循環して
// TDZ エラーになるため、基底側には置けない。
export function spawn_particles(source: entity_t, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const particle = new entity_particle_t(source.x, 0, source.z, 1, 30)
    particle.vx = (Math.random() - 0.5) * 128
    particle.vy = Math.random() * 96
    particle.vz = (Math.random() - 0.5) * 128
  }
}
```

元の `_init()` は `this._lifetime = 3` のみだったので、field 初期化子 `private _lifetime = 3` に移して `_init()` 自体を削除した。`entity_t` の基底 `_init` は空実装なのでオーバーライドしなければ何も起きない。

- [ ] **Step 2: 残る 7 つの entity ファイルを移植する**

各ファイルで機械的に行う変換：

| 変換 | 内容 |
| --- | --- |
| クラス宣言 | `class X extends entity_t {` → `export class X extends entity_t {`（型引数は付けない） |
| import 追加 | 参照している識別子に応じて `entity.ts` / `state.ts` / `renderer.ts` / `random.ts` / `audio.ts` / `terminal.ts` / `game.ts` / 他 entity から import |
| `_math.` | `Math.` に置換 |
| `time_elapsed` | `state.time_elapsed` |
| `entity_player` | `state.entity_player!` |
| `entities` | `state.entities` |
| `camera_shake = N` | `camera.shake = N` |
| `cpus_rebooted++` | `state.cpus_rebooted++` |
| `cpus_total` / `current_level` | `state.cpus_total` / `state.current_level` |
| `this._spawn_particles(n)` | `spawn_particles(this, n)`（`entity-particle.ts` から import） |
| `var` | `const` / `let` |
| オーバーライド | `override` キーワードを付ける |

**`entity-spider.js:43-54` は機械的変換では通らない。** 軸名を文字列連結して `this` を添字アクセスしているため、`strict` 下で TS7053（`string` による暗黙の any 添字）になる。該当は `this[axis]` / `other[axis]`（50 行）と `this['v'+axis]` / `other['v'+axis]`（52-53 行）の 4 箇所。キーをリテラル型で束ねて解決する。

```ts
override _check(other: entity_t): void {
  // slightly bounce off from other spiders to separate them
  if (other instanceof entity_spider_t) {
    const axis: 'x' | 'z' =
      Math.abs(other.x - this.x) > Math.abs(other.z - this.z) ? 'x' : 'z'
    const velocity_axis: 'vx' | 'vz' = axis === 'x' ? 'vx' : 'vz'
    const amount = this[axis] > other[axis] ? 0.6 : -0.6

    this[velocity_axis] += amount
    other[velocity_axis] -= amount
  }

  // hurt player
  else if (other instanceof entity_player_t) {
    this.vx *= -1.5
    this.vz *= -1.5
    other._receive_damage(this, 1)
  }
}
```

`x` / `z` / `vx` / `vz` は `entity_t` で `number` として宣言済みなので、リテラル型の union による添字アクセスは通る。

可視性修飾子の割り当て（設計書の可視性表に対応）:

| メンバ | 修飾子 |
| --- | --- |
| `_update` `_render` `_check` `_receive_damage` `_dead` | `public`（修飾子を書かない） |
| `_angle`（`entity_player_t`） | `public`。**`minimap_draw()` が自機の向きを読むため private にできない** |
| `_kill` `_init` `_did_collide` | `protected override` |
| `_bob` `_frame` `_last_shot` `_last_damage`（`entity_player_t`） | `private` |
| `_animation_time`（`entity_cpu_t` / `entity_spider_t` で別々に宣言） | それぞれ `private` |
| `_lifetime`（`entity_particle_t` / `entity_explosion_t` で別々に宣言） | それぞれ `private` |
| `_select_target_counter` `_target_x` `_target_z`（`entity_spider_t` / `entity_sentry_t` で別々に宣言） | それぞれ `private` |

`entity_sentry_t._init()` は `this.h = 20` で基底の `h = 5` を上書きしている。field 初期化子ではなく `_init()` に残す（`h` は基底で宣言済みなので再宣言しない）。

`_init` が引数を取るクラス:

- `entity_plasma_t` — `protected override _init(angle?: number): void`
- `entity_sentry_plasma_t` — 同上

他 7 クラスは `protected override _init(): void`（引数なし）。**型引数は使わない。** 基底の `entity_t` が `_init(init_param?: number)` を持つので、より少ない引数のオーバーライドは TS が許す。

型引数化を試みると `TInit` が `_init` の引数位置にしか現れないため分散推論と衝突し、基底 constructor の `state.entities.push(this)` が TS2345 になる。設計書の「`_init` の引数型」節を参照。

`entity-sentry.ts` は `entity_sentry_t` と `entity_sentry_plasma_t` の 2 クラスを持つ（元の `entity-sentry.js` と同じ）。両方 `export` する。

### フィールド宣言と `_init()` の関係（必読 — 間違えると静かに壊れる）

`tsconfig.json` は `target: es2022` なので `useDefineForClassFields` が既定で `true` になる。この設定では**サブクラスのフィールド宣言が基底 constructor の完了後に define される**。基底の `entity_t` は constructor 本体で `this._init(init_param)` を呼ぶので、実行順序はこうなる。

1. 基底のフィールド初期化子（`x = 0` … `h = 5`）
2. 基底 constructor 本体（`this.x = x` … `this._init(init_param)` … `state.entities.push(this)`）
3. **サブクラスのフィールド宣言／初期化子**
4. サブクラス constructor 本体（明示的な constructor がなければ何もしない）

つまり **`_init()` の中で自クラスのフィールドに代入しても、直後の 3 で潰される。** 実測結果:

| 書き方 | `_init()` が 112 を代入した後の最終値 |
| --- | --- |
| `private _target_x = 0`（初期化子付き） | **`0`**（初期化子が上書き） |
| `private _target_x!: number`（定義アサーション） | **`undefined`**（`undefined` で define される） |

**`!` では回避できない。** 宣言があるだけで define されるため。

そのままやると `entity_spider_t` / `entity_sentry_t` が自分の位置ではなく `(0, 0)` を狙い、`entity_particle_t` / `entity_explosion_t` の `_lifetime` が `undefined` になって粒子が消えず、`entity_player_t` の `_last_shot` が `undefined` で射撃判定が壊れる。型チェックは通り、テストもないので**静かに壊れる**。

### 対策: 自クラスのフィールドは初期化子にし、`_init()` は基底フィールドのみ触る

サブクラスのフィールド初期化子は手順 3 で走り、これは基底 constructor 本体（手順 2）の後なので **`this.x` / `this.z` を読める**。したがって元の `_init()` が `this.x` を参照していた箇所も初期化子で表現できる。

クラスごとの割り当て:

| クラス | 自クラスのフィールド（初期化子で書く） | `_init()` |
| --- | --- | --- |
| `entity_player_t` | `_angle = Math.PI / 2`（public）、`private _bob = 0`、`private _frame = 0`、`private _last_shot = 0`、`private _last_damage = 0` | **削除**（元の `_init` はこれらの代入のみ） |
| `entity_cpu_t` | `private _animation_time = 0` | **削除** |
| `entity_particle_t` | `private _lifetime = 3` | **削除** |
| `entity_explosion_t` | `private _lifetime = 1` | **削除** |
| `entity_spider_t` | `private _animation_time = 0`、`private _select_target_counter = 0`、`private _target_x = this.x`、`private _target_z = this.z` | **削除** |
| `entity_sentry_t` | `private _select_target_counter = 0`、`private _target_x = this.x`、`private _target_z = this.z` | **残す。`this.h = 20` のみ**（`h` は基底フィールドなので手順 3 で潰されない） |
| `entity_plasma_t` | なし | **残す。`_init(angle?: number)` で基底フィールド `vx` / `vz` を設定** |
| `entity_sentry_plasma_t` | なし | 同上 |
| `entity_health_t` | なし | なし（元から `_init` を持たない） |

例（`entity-player.ts`）:

```ts
export class entity_player_t extends entity_t {
  // minimap.ts が自機の向きを 1px で描くために読む
  _angle = Math.PI / 2 // face towards the viewer

  private _bob = 0
  private _frame = 0
  private _last_shot = 0
  private _last_damage = 0

  // _init() は持たない。元の実装は上記フィールドの初期化だけをしていた
  // ...
}
```

例（`entity-sentry.ts` の `entity_sentry_t`）:

```ts
export class entity_sentry_t extends entity_t {
  private _select_target_counter = 0
  private _target_x = this.x  // 基底 constructor が this.x を設定した後に走る
  private _target_z = this.z

  protected override _init(): void {
    this.h = 20  // h は基底フィールドなので初期化子に潰されない
  }
  // ...
}
```

**検証方法**: 実装後に `entity_sentry_t` を 1 体作って `h === 20` かつ `_target_x` が生成座標と一致することを確認する。型チェックだけでは検出できない。

- [ ] **Step 3: state.ts の entity_player の型を狭める**

`source/state.ts` を編集する。

```ts
import type { entity_t } from './entity'
import type { entity_player_t } from './entity-player'
```

および

```ts
  entity_player: null as entity_player_t | null,
```

Task 4 で置いた `// Task 5 で entity_player_t | null に狭める` のコメントを削除する。

- [ ] **Step 4: 未解決の import だけが残っていることを確認する**

Run: `npm run typecheck`
Expected: エラーは `audio`、`terminal`、`game` からの import 解決失敗のみ。**entity 群自身の型エラー（未宣言フィールド、可視性の衝突、`override` の不一致）が 0 件であること**を確認する。`entity_t` の TDZ に関わる循環（`entity.ts` → `entity-particle.ts`）が残っていないことも確認する。

エラー一覧を出して確認する:

```bash
npm run typecheck 2>&1 | grep "error TS" | grep -vE "module '\./(audio|terminal|game|input)'"
```

Expected: 出力 0 行

**エラーの種別は 2 つあることに注意。** 並存期間中は `source/audio.js` / `game.js` / `terminal.js` が実在するため、TypeScript の解決は `./audio` を旧 `.js` に当てる。`allowJs` がないので使えず、**TS7016**（`Could not find a declaration file for module './audio'`）になる。一方 `./input` は `.js` の兄弟が存在しないので **TS2307**（`Cannot find module`）になる。したがって `Cannot find module` だけを除外するフィルタでは TS7016 の 10 行が残ってしまう。上のようにモジュール名で除外すること。

`resolve.extensions` は Vite の設定で、TypeScript の解決順序には影響しない。tsc は元から `.ts` を `.js` より先に試すため、Task 6 で `audio.ts` が作られれば TS7016 は自然に消える。

**この期間の型チェックは弱い保証しか与えない。** TS7016 になるモジュールからの import は `any` として扱われるため、entity 群における `audio_play()` / `terminal_show_notice()` / `reload_level()` の呼び出しは**まだ型チェックされていない**。これらが実際に検証されるのは Task 8 で型エラーが 0 件になった時点である。

- [ ] **Step 5: entity のテストが通り続けることを確認する**

Run: `npx vitest run source/entity.test.ts source/random.test.ts`
Expected: PASS（13 件）

- [ ] **Step 6: コミット**

```bash
git add source/entity-*.ts source/state.ts
git commit -m "feat: entity 群を TypeScript 化し spawn_particles を基底クラスから外す"
```

---

### Task 6: audio 系の TypeScript 化

**Files:**
- Create: `source/sonantx-reduced.d.ts`
- Modify: `source/sonantx-reduced.js`（末尾に export を追加するのみ）
- Create: `source/sound-effects.ts`
- Create: `source/music-dark-meat-beat.ts`
- Create: `source/audio.ts`

**Interfaces:**
- Consumes: `state.ts` の `state`、`terminal.ts` の `terminal_show_notice`（Task 7 で作成）
- Produces:
  - `sonantx-reduced.d.ts`: `SonantInstrument`、`SonantSong`、`sonantxr_generate_song`、`sonantxr_generate_sound`
  - `audio.ts`: `audio_init` / `audio_play` / `audio_toggle` / `audio_sfx_*` 7 種
  - `sound-effects.ts`: `sound_terminal` `sound_shoot` `sound_hit` `sound_beep` `sound_hurt` `sound_pickup` `sound_explode`
  - `music-dark-meat-beat.ts`: `music_dark_meat_beat`

- [ ] **Step 1: sonantx-reduced.js の末尾に export を追加する**

`sonantxr_generate_song` / `sonantxr_generate_sound` は `sonantx-reduced.js:34` で `var` 宣言され、`307` / `312` で IIFE 内から代入される。末尾（`})();` の後）で export する。

```js
export { sonantxr_generate_song, sonantxr_generate_sound };
```

- [ ] **Step 2: sonantx-reduced.js の _math を Math に置き換える**

**これを忘れると音声が実行時に落ち、ゲームが起動しなくなる。** `sonantx-reduced.js` は `_math` を 6 箇所で参照している。

| 行 | 内容 |
| --- | --- |
| 45 | `return _math.sin(value * 6.283184);` |
| 75 | `return 0.00390625 * _math.pow(1.059463094, n - 128);` |
| 118 | `this.panFreq = _math.pow(2, instr.fx_pan_freq - 8) / this.rowLen;` |
| 119 | `this.lfoFreq = _math.pow(2, instr.lfo_freq - 8) / this.rowLen;` |
| 174 | `rsample += (2*_math.random()-1) * this.instr.noise_fader * e;` |
| 184 | `f = 1.5 * _math.sin(f * 3.141592 / WAVE_SPS);` |

`_math` は `game.js:3` の `_math = Math` というグローバルなエイリアスで、Task 8 で `game.js` を削除すると消える。クラシックスクリプトとして読まれていた間はグローバル経由で解決できていたが、ESM モジュールになると解決先が無くなる。`audio_init()` が音を生成した瞬間に `ReferenceError: _math is not defined` になり、**イントロのコールバックチェーンの起点が `audio_init` なのでゲームが一切起動しない**。

6 箇所すべて `Math.` に置き換える。

```bash
sed -i '' 's/_math\./Math./g' source/sonantx-reduced.js
grep -c "_math" source/sonantx-reduced.js
```

Expected: `grep -c` が `0` を返す

アルゴリズムと数値、およびライセンスヘッダのコメントには触れない。`sonantx-reduced.js` が参照している外部識別子は `_math` のみであることは確認済み（`udef` / `_document` / `_temp` の参照はない）。

- [ ] **Step 3: source/sonantx-reduced.d.ts を作成する**

`.d.ts` が存在すると `import ... from './sonantx-reduced'` の型解決はこちらに当たり、TS は `.js` 本体を読まない。そのため `allowJs` は不要。

29 個のフィールドは `source/sound-effects.js` の `sound_terminal` の定義順に合わせている。

```ts
// source/sonantx-reduced.js（サードパーティ、zlib）の型宣言。
// 実装は .js 側にあり、TS はこの .d.ts のみを参照する。

export interface SonantInstrument {
  osc1_oct: number
  osc1_det: number
  osc1_detune: number
  osc1_xenv: number
  osc1_vol: number
  osc1_waveform: number
  osc2_oct: number
  osc2_det: number
  osc2_detune: number
  osc2_xenv: number
  osc2_vol: number
  osc2_waveform: number
  noise_fader: number
  env_attack: number
  env_sustain: number
  env_release: number
  env_master: number
  fx_filter: number
  fx_freq: number
  fx_resonance: number
  fx_delay_time: number
  fx_delay_amt: number
  fx_pan_freq: number
  fx_pan_amt: number
  lfo_osc1_freq: number
  lfo_fx_freq: number
  lfo_freq: number
  lfo_amt: number
  lfo_waveform: number
}

// 楽曲のトラックは音色にパターン列 p と、ノート列を持つカラム c が付いたもの
export interface SonantTrack extends SonantInstrument {
  p: number[]
  c: Array<{ n: number[] }>
}

export interface SonantSong {
  rowLen: number
  endPattern: number
  songData: SonantTrack[]
  songLen: number
}

export function sonantxr_generate_song(
  audio_ctx: AudioContext,
  song_data: SonantSong,
  callback: (buffer: AudioBuffer) => void,
): void

export function sonantxr_generate_sound(
  audio_ctx: AudioContext,
  instrument: SonantInstrument,
  note: number,
  callback: (buffer: AudioBuffer) => void,
): void
```

- [ ] **Step 4: sound-effects.ts を作成する**

`source/sound-effects.js` の 7 つのオブジェクトを個別の `export const` にし、`SonantInstrument` 型を付ける。**数値は 1 つも変更しない**（音が変わる）。

```ts
import type { SonantInstrument } from './sonantx-reduced'

export const sound_terminal: SonantInstrument = {
  osc1_oct: 6,
  // ... sound-effects.js の内容をそのまま
}

export const sound_shoot: SonantInstrument = { /* ... */ }
export const sound_hit: SonantInstrument = { /* ... */ }
export const sound_beep: SonantInstrument = { /* ... */ }
export const sound_hurt: SonantInstrument = { /* ... */ }
export const sound_pickup: SonantInstrument = { /* ... */ }
export const sound_explode: SonantInstrument = { /* ... */ }
```

型を付けることでフィールド名の打ち間違いが検出できるようになる（現状は無音で失敗する）。移植後に typecheck が通れば 7 つ × 29 フィールドが揃っていることの証明になる。

- [ ] **Step 5: music-dark-meat-beat.ts を作成する**

```ts
import type { SonantSong } from './sonantx-reduced'

export const music_dark_meat_beat: SonantSong = {
  rowLen: 5513,
  endPattern: 25,
  songData: [ /* music-dark-meat-beat.js の内容をそのまま */ ],
  songLen: 101,
}
```

- [ ] **Step 6: audio.ts を作成する**

`audio.js` からの移植。変更点は `audio_sfx_*` の型と `game_running` の参照。`audio_sfx_*` は `audio_init` のコールバックで後から代入されるため `AudioBuffer | undefined` になる。

```ts
import { sonantxr_generate_song, sonantxr_generate_sound } from './sonantx-reduced'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import {
  sound_beep, sound_explode, sound_hit, sound_hurt,
  sound_pickup, sound_shoot, sound_terminal,
} from './sound-effects'
import { state } from './state'
import { terminal_show_notice } from './terminal'

const audio_ctx = new AudioContext()
const audio_gain = audio_ctx.createGain()

// ローカル（localhost / 127.0.0.1 / file://）では既定でミュート
let audio_enabled = ['localhost', '127.0.0.1', ''].indexOf(location.hostname) === -1

export let audio_sfx_shoot: AudioBuffer | undefined
export let audio_sfx_hit: AudioBuffer | undefined
export let audio_sfx_hurt: AudioBuffer | undefined
export let audio_sfx_beep: AudioBuffer | undefined
export let audio_sfx_pickup: AudioBuffer | undefined
export let audio_sfx_terminal: AudioBuffer | undefined
export let audio_sfx_explode: AudioBuffer | undefined

audio_gain.gain.value = audio_enabled ? 1 : 0
audio_gain.connect(audio_ctx.destination)

export function audio_init(callback: () => void): void {
  sonantxr_generate_song(audio_ctx, music_dark_meat_beat, (buffer) => {
    audio_play(buffer, true)
    callback()
  })
  sonantxr_generate_sound(audio_ctx, sound_shoot, 140, (b) => { audio_sfx_shoot = b })
  sonantxr_generate_sound(audio_ctx, sound_hit, 134, (b) => { audio_sfx_hit = b })
  sonantxr_generate_sound(audio_ctx, sound_beep, 173, (b) => { audio_sfx_beep = b })
  sonantxr_generate_sound(audio_ctx, sound_hurt, 144, (b) => { audio_sfx_hurt = b })
  sonantxr_generate_sound(audio_ctx, sound_pickup, 156, (b) => { audio_sfx_pickup = b })
  sonantxr_generate_sound(audio_ctx, sound_terminal, 156, (b) => { audio_sfx_terminal = b })
  sonantxr_generate_sound(audio_ctx, sound_explode, 114, (b) => { audio_sfx_explode = b })
}

export function audio_play(buffer: AudioBuffer | undefined, loop = false): void {
  if (!buffer) { return }
  const source = audio_ctx.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  source.connect(audio_gain)
  source.start()
}

export function audio_toggle(): void {
  audio_enabled = !audio_enabled
  audio_gain.gain.value = audio_enabled ? 1 : 0
  // イントロ／エンディング中は通知でテキスト表示チェーンを壊してしまうので出さない
  if (state.game_running) {
    terminal_show_notice(audio_enabled ? '音声: ON' : '音声: OFF')
  }
}
```

`audio_play` に `if (!buffer) { return }` を入れているのは、`audio_sfx_*` が `audio_init` のコールバック完了前は `undefined` である現実を型として扱ったもの。元コードは `undefined` を `source.buffer` に代入していた（実害はないが型では表せない）。

`new (window.webkitAudioContext||window.AudioContext)()` は `AudioContext` に単純化する。`webkitAudioContext` は 2018 年当時の Safari 向けフォールバックで、現在の対象ブラウザには不要（AGENTS.md「不要になったコードパスは削除する」）。

- [ ] **Step 7: 未解決の import だけが残っていることを確認する**

Run: `npm run typecheck 2>&1 | grep "error TS" | grep -vE "module '\./(terminal|game|input)'"`
Expected: 出力 0 行

Task 5 と同様、`./terminal` と `./game` は旧 `.js` が実在するため TS7016、`./input` は TS2307 になる。モジュール名で除外すること。

- [ ] **Step 8: コミット**

```bash
git add source/sonantx-reduced.js source/sonantx-reduced.d.ts source/sound-effects.ts source/music-dark-meat-beat.ts source/audio.ts
git commit -m "feat: audio 系を TypeScript 化し音色データに型を付ける"
```

---

### Task 7: minimap.ts / terminal.ts / input.ts

**Files:**
- Create: `source/minimap.ts`
- Create: `source/terminal.ts`
- Create: `source/input.ts`

**Interfaces:**
- Consumes: `dom.ts`、`state.ts`、`entity-cpu.ts`、`audio.ts`
- Produces:
  - `minimap.ts`: `minimap_reset` / `minimap_hide` / `minimap_update`
  - `terminal.ts`: 外部から呼ばれるものだけ export する。`terminal_hide`（main.ts）、`terminal_cancel`（main.ts）、`terminal_write_line`（main.ts）、`terminal_show_notice`（game.ts / entity-cpu.ts / entity-player.ts / audio.ts）、`terminal_run_intro`（main.ts）、`terminal_run_outro`（game.ts）。`terminal_show` / `terminal_prepare_text` / `terminal_write_text` / `terminal_run_garbage` / `terminal_run_story` は terminal.ts 内部からのみ呼ばれるため export しない（移植時に実際の呼び出し元を確認すること）
  - `input.ts`: `export const keys: Record<number, number>`、`key_up` / `key_down` / `key_left` / `key_right` / `key_shoot` 定数、`input_init(): void`

`input.ts` は `game.js:7-9, 144-170` の入力関連を切り出したもの。`_document.onkeydown` / `onkeyup` の登録はトップレベルの副作用ではなく `input_init()` にまとめ、`main.ts` から明示的に呼ぶ。

- [ ] **Step 1: source/input.ts を作成する**

```ts
import { audio_toggle } from './audio'

export const keys: Record<number, number> = { 32: 0, 37: 0, 38: 0, 39: 0, 40: 0 }

export const key_up = 38
export const key_down = 40
export const key_left = 37
export const key_right = 39
export const key_shoot = 32

// convert AWDS to left up down right
const key_convert: Record<number, number> = { 65: 37, 87: 38, 68: 39, 83: 40 }

function set_key(ev: KeyboardEvent, value: number): void {
  const code = key_convert[ev.keyCode] || ev.keyCode
  if (code in keys) {
    keys[code] = value
    ev.preventDefault()
  }
}

export function input_init(): void {
  document.onkeydown = (ev) => {
    if (ev.keyCode === 77) { // M: 音声トグル
      if (!ev.repeat) {
        audio_toggle()
      }
      return
    }
    set_key(ev, 1)
  }

  document.onkeyup = (ev) => {
    set_key(ev, 0)
  }
}
```

`keys[code] !== udef` による判定は `code in keys` に置き換える（`udef` を削除するため、かつ意図がそのまま読める）。元コードの `preventDefault(ev)` ヘルパは 2 箇所からしか呼ばれず `set_key` に吸収されるので削除する。

- [ ] **Step 2: source/minimap.ts を作成する**

`minimap.js` からの移植。変換内容:

| 元 | 移行後 |
| --- | --- |
| `m.getContext('2d')` | `minimap_canvas.getContext('2d')!`（`dom.ts` から import） |
| `m.style.display` | `minimap_canvas.style.display` |
| `level_width` / `level_height` / `level_data` | `state.ts` から import |
| `entities` | `state.entities` |
| `entity_player` | `state.entity_player!` |
| `_math.` | `Math.` |
| `entity_cpu_t` | `entity-cpu.ts` から import |
| `var` | `const` / `let` |
| 各 `function` | `minimap_reset` / `minimap_hide` / `minimap_update` に `export` を付ける。`minimap_set_pixel` / `minimap_cast` / `minimap_reveal` / `minimap_draw` は内部関数なので export しない |

引数にはすべて `: number` を付ける。コメント（フォグ・オブ・ウォーの説明、視界の説明）はそのまま残す。

- [ ] **Step 3: source/terminal.ts を作成する**

`terminal.js` からの移植。変換内容:

| 元 | 移行後 |
| --- | --- |
| `a.innerHTML` / `a.style` | `terminal_el.innerHTML` / `terminal_el.style`（`dom.ts` から import） |
| `c.style.opacity` | `canvas.style.opacity`（`dom.ts` から import） |
| `game_running = 0`（terminal.js:170） | `state.game_running = 0` |
| `minimap_hide()` | `minimap.ts` から import |
| `audio_play` / `audio_sfx_terminal` | `audio.ts` から import |
| `var terminal_text_*` | `const`（日本語テキストは 1 文字も変更しない） |
| `terminal_text_buffer` / `terminal_state` / `terminal_print_ident` / `terminal_line_wait` / `terminal_timeout_id` / `terminal_hide_timeout` | `let`。すべて terminal.ts 内でのみ再代入されるため module ローカルのまま |
| `setTimeout` の戻り値 | `ReturnType<typeof setTimeout>` 型にする（ブラウザでは `number`、Node の型定義が混ざると `Timeout` になるため） |

`callback` 引数はすべて `callback?: () => void` にする。`terminal_show_notice(notice: string, callback?: () => void)`。

**これに伴い 2 箇所が strict で落ちるので併せて直す。**

`terminal.js:117` の `setTimeout(callback, terminal_line_wait)` は `callback` が `undefined` の可能性があり `setTimeout` の `TimerHandler` に代入できない。ガードを入れる。

```ts
if (callback) {
  terminal_timeout_id = setTimeout(callback, terminal_line_wait)
}
```

`terminal.js:101` の `terminal_write_line(lines.shift(), terminal_write_text.bind(this, lines, callback))` は 2 つ問題がある。モジュールスコープの関数に対する `.bind(this, ...)` が `noImplicitThis` に触れ、`lines.shift()` が `string | undefined` を返す。`this` の束縛は元々不要（`terminal_write_text` は `this` を参照していない）なのでクロージャに置き換える。

```ts
function terminal_write_text(lines: string[], callback?: () => void): void {
  const line = lines.shift()
  if (line === undefined) {
    callback?.()
    return
  }
  terminal_write_line(line, () => terminal_write_text(lines, callback))
}
```

移植時に `terminal.js:99-106` の実際の分岐（配列が空になったときの扱い）を確認して上の骨格に合わせること。

`terminal_text_buffer` は `string[]`。

- [ ] **Step 4: 未解決の import が game.ts のみになったことを確認する**

Run: `npm run typecheck 2>&1 | grep "error TS" | grep -vE "module '\./game'"`
Expected: 出力 0 行（この時点で `input.ts` は作成済みなので除外対象から外れる）

`./game` は旧 `game.js` が実在するため TS7016 になる。

- [ ] **Step 5: 既存のテストが通り続けることを確認する**

Run: `npm test`
Expected: PASS（13 件）

- [ ] **Step 6: コミット**

```bash
git add source/input.ts source/minimap.ts source/terminal.ts
git commit -m "feat: minimap / terminal / input を TypeScript 化する"
```

---

### Task 8: game.ts / main.ts と index.html の切り替え

**Files:**
- Create: `source/game.ts`
- Create: `source/main.ts`
- Modify: `index.html`
- Delete: `source/*.js`（`sonantx-reduced.js` を除く 18 ファイル）

**Interfaces:**
- Consumes: これまでの全モジュール
- Produces: `game.ts` の `next_level` / `load_level` / `reload_level` / `game_tick`。`main.ts` は Vite のエントリで何も export しない

このタスクで初めてゲーム全体が ESM で動く。**ブラウザでの実動作確認が検証手段**になる。

- [ ] **Step 1: source/game.ts を作成する**

`game.js` からの移植。`udef` / `_math` / `_document` / `_temp` はすべて削除し、状態は `state` 経由にする。`time_last` は `game_tick` 以外に読み書きがないため module ローカルにする。

```ts
import l1_url from '../m/l1.png'
import l2_url from '../m/l2.png'
import l3_url from '../m/l3.png'
import { entity_cpu_t } from './entity-cpu'
import { entity_health_t } from './entity-health'
import { entity_player_t } from './entity-player'
import { entity_sentry_t } from './entity-sentry'
import { entity_spider_t } from './entity-spider'
import {
  camera, push_block, push_floor, push_sprite,
  renderer_end_frame, renderer_freeze_level_geometry,
  renderer_prepare_frame, renderer_reset_level_geometry,
} from './renderer'
import { minimap_reset, minimap_update } from './minimap'
import { array_rand, random_int, random_seed } from './random'
import { level_data, level_height, level_width, state } from './state'
import { terminal_run_outro, terminal_show_notice } from './terminal'

let time_last = performance.now()

// レベル画像は静的 import で URL を得る。'm/' + id + '.png' の文字列連結だと
// Vite が参照を検出できず、本番ビルドで dist に出力されないため 404 になる。
// depth は 1 起点なので id - 1 で引く。
const level_image_urls = [l1_url, l2_url, l3_url]

// コールバック内の this に依存していた形（noImplicitThis が通らない）を
// 画像を引数で渡す形に変える。game.ts 内からのみ呼ぶので export しない。
function load_image(
  url: string,
  callback: (image: HTMLImageElement) => void,
): void {
  const image = new Image()
  image.src = url
  image.onload = () => callback(image)
}

export function next_level(callback?: () => void): void {
  if (state.current_level == 3) {
    state.entities_to_kill.push(state.entity_player!)
    terminal_run_outro()
  } else {
    state.current_level++
    load_level(state.current_level, callback)
  }
}

export function load_level(id: number, callback?: () => void): void {
  random_seed(0xbadc0de1 + id)
  load_image(level_image_urls[id - 1], (image) => {
    state.entities = []
    renderer_reset_level_geometry()

    state.cpus_total = 0
    state.cpus_rebooted = 0

    minimap_reset()

    const scratch = document.createElement('canvas')
    scratch.width = scratch.height = level_width // assume square levels
    const scratch_ctx = scratch.getContext('2d')!
    scratch_ctx.drawImage(image, 0, 0)
    const pixels = scratch_ctx.getImageData(0, 0, level_width, level_height).data

    for (let y = 0, index = 0; y < level_height; y++) {
      for (let x = 0; x < level_width; x++, index++) {
        // reduce to 12 bit color to accurately match
        const color_key =
          ((pixels[index * 4] >> 4) << 8) +
          ((pixels[index * 4 + 1] >> 4) << 4) +
          (pixels[index * 4 + 2] >> 4)

        if (color_key !== 0) {
          const tile = (level_data[index] =
            color_key === 0x888 // wall
              ? random_int(0, 5) < 4 ? 8 : random_int(8, 17)
              : array_rand([1, 1, 1, 1, 1, 3, 3, 2, 5, 5, 5, 5, 5, 5, 7, 7, 6])) // floor

          if (tile > 7) { // walls
            push_block(x * 8, y * 8, 4, tile - 1)
          } else if (tile > 0) { // floor
            push_floor(x * 8, y * 8, tile - 1)

            // enemies and items
            if (random_int(0, 16 - (id * 2)) == 0) {
              new entity_spider_t(x * 8, 0, y * 8, 5, 27)
            } else if (random_int(0, 100) == 0) {
              new entity_health_t(x * 8, 0, y * 8, 5, 31)
            }
          }

          // cpu
          if (color_key === 0x00f) {
            level_data[index] = 8
            new entity_cpu_t(x * 8, 0, y * 8, 0, 18)
            state.cpus_total++
          }

          // sentry
          if (color_key === 0xf00) {
            new entity_sentry_t(x * 8, 0, y * 8, 5, 32)
          }

          // player start position (blue)
          if (color_key === 0x0f0) {
            state.entity_player = new entity_player_t(x * 8, 0, y * 8, 5, 18)
          }
        }
      }
    }

    const player = state.entity_player!

    // Remove all spiders that spawned close to the player start
    for (const e of state.entities) {
      if (
        e instanceof entity_spider_t &&
        Math.abs(e.x - player.x) < 64 &&
        Math.abs(e.z - player.z) < 64
      ) {
        state.entities_to_kill.push(e)
      }
    }

    camera.x = -player.x
    camera.y = -300
    camera.z = -player.z - 100

    renderer_freeze_level_geometry()

    terminal_show_notice(
      '停止中のシステムを走査中...___' +
      (state.cpus_total) + ' 件のシステムを検出'
    )
    callback && callback()
  })
}

export function reload_level(): void {
  load_level(state.current_level)
}

export function game_tick(): void {
  const time_now = performance.now()
  state.time_elapsed = (time_now - time_last) / 1000
  time_last = time_now

  renderer_prepare_frame()

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

  const player = state.entity_player!

  // center camera on player, apply damping
  camera.x = camera.x * 0.92 - player.x * 0.08
  camera.y = camera.y * 0.92 - player.y * 0.08
  camera.z = camera.z * 0.92 - player.z * 0.08

  // add camera shake
  camera.shake *= 0.9
  camera.x += camera.shake * (Math.random() - 0.5)
  camera.z += camera.shake * (Math.random() - 0.5)

  // health bar, render with plasma sprite
  for (let i = 0; i < player.h; i++) {
    push_sprite(-camera.x - 50 + i * 4, 29 - camera.y, -camera.z - 30, 26)
  }

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

`game_tick` のループは元コードの `entities` 参照を先頭で `const entities = state.entities` に束ねている。ループ中に `state.entities` が再代入されることはない（再代入はループ後）ため挙動は変わらない。

- [ ] **Step 2: source/main.ts を作成する**

`main.js` からの移植。`load_image` の `this` 依存が引数渡しになったこと、`input_init()` の呼び出し追加、スプライトアトラスを Vite の import にすることが変更点。

```ts
import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, next_level } from './game'
import { input_init } from './input'
import { renderer_bind_image, renderer_init } from './renderer'
import { state } from './state'
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
        state.game_running = 1
        terminal_hide()
        renderer_bind_image(atlas)
        next_level(game_tick)
      }
    })
  }

  terminal_run_intro()
})
```

`m/q2.png` は `import atlas_url from '../m/q2.png'` にして Vite にハッシュ付きで出力させる。レベル画像 3 枚も同様に `game.ts` で静的 import して `level_image_urls` 配列に束ねる（Step 1 参照）。

**元の `'m/' + name + '.png'` という文字列連結は本番ビルドで壊れる。** Vite は静的解析で参照を見つけたアセットだけを `dist/` に出力するため、実行時に組み立てられる文字列は検出できず `m/l1.png` 〜 `l3.png` がコピーされない。`npm run dev` では素のファイルが配信されるので気づかず、`npm run build` して初めて 404 になる。

`m/` を `public/` に移す案もあるが、そうすると `main.ts` の `../m/q2.png` の import が解決できなくなり `m/` を 2 箇所に分割することになる。静的 import で統一するほうが、4 枚すべてにハッシュが付き、ローグライト化で l1〜l3 を削除するときも文字列連結より import 行のほうが追跡しやすい。

- [ ] **Step 3: index.html を書き換える**

20 本の `<script>` を 1 本に置き換える。`<style>` と要素（`#c` / `#a` / `#m`）は一切変更しない。

```html
	<canvas id="c" width=320 height=180></canvas>
	<code id="a"></code>
	<canvas id="m" width=64 height=64></canvas>
	<script type="module" src="/source/main.ts"></script>
</body></html>
```

- [ ] **Step 4: 旧 .js を削除する**

`sonantx-reduced.js` だけ残す。

```bash
git rm source/game.js source/random.js source/renderer.js source/entity.js \
  source/entity-cpu.js source/entity-player.js source/entity-plasma.js \
  source/entity-spider.js source/entity-sentry.js source/entity-particle.js \
  source/entity-health.js source/entity-explosion.js \
  source/music-dark-meat-beat.js source/sound-effects.js source/audio.js \
  source/minimap.js source/terminal.js source/main.js
```

- [ ] **Step 5: vite.config.ts の resolve.extensions を削除する**

旧 `.js` が無くなったので、並存期間のためだけに入れていた `resolve.extensions` は不要になる。`vite.config.ts` から `resolve` ブロックごと削除し、`base` と `build` だけに戻す。

削除後の `vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages のプロジェクトページは /takagiaction/ 配下で配信されるため相対パスにする
  base: './',
  build: {
    outDir: 'dist',
  },
})
```

残る `.js` は `source/sonantx-reduced.js` の 1 つだけで、これは `./sonantx-reduced` として import される。同名の `.ts` は存在せず `.d.ts` は解決対象の拡張子に含まれないため、既定の解決順でも正しく `.js` に解決される。設定を消して問題ない。

- [ ] **Step 6: フィールド初期化の恒久テストを追加する**

Task 5 でクラスフィールドの初期化順序の罠を回避したが、**その正しさを守る自動テストがない**。`useDefineForClassFields` の既定が変わったり、誰かがフィールド宣言を初期化子から通常の宣言に書き換えたりすれば静かに壊れる。型チェックでは検出できない。

Task 8 の時点では `audio` / `terminal` / `game` / `input` が実在するため、Task 5 で必要だった大量のモックが減る。ここで恒久テストを置く。

`source/entity-init.test.ts` を作成する。

```ts
import { describe, expect, it, vi } from 'vitest'

// renderer は dom.ts 経由で document と canvas に触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
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
// terminal も dom.ts に触る
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
// entity-player は game.ts の reload_level を参照し、game.ts は minimap → dom を
// 経由して document に触るため、これもモックが必要
vi.mock('./game', () => ({ reload_level: () => {} }))

import { entity_explosion_t } from './entity-explosion'
import { entity_particle_t } from './entity-particle'
import { entity_plasma_t } from './entity-plasma'
import { entity_player_t } from './entity-player'
import { entity_sentry_plasma_t, entity_sentry_t } from './entity-sentry'
import { entity_spider_t } from './entity-spider'

// private フィールドを読むためのヘルパ。初期化順序の検証が目的なので、
// 内部を覗くこと自体がこのテストの主題である。
function peek(entity: object, field: string): unknown {
  return (entity as Record<string, unknown>)[field]
}

// useDefineForClassFields が true のとき、サブクラスのフィールド宣言は基底
// constructor の完了後に define される。_init() 内で自クラスのフィールドに
// 代入すると潰されるため初期化子で書く必要がある。ここが壊れると蜘蛛と歩哨が
// (0,0) を狙い、粒子と爆発が消えず、射撃判定が壊れる。型チェックでは検出できない。
describe('クラスフィールドの初期化順序', () => {
  it('entity_sentry_t は h=20 と生成座標を保持する', () => {
    const sentry = new entity_sentry_t(112, 0, 456, 5, 32)
    expect(sentry.h).toBe(20)
    expect(peek(sentry, '_target_x')).toBe(112)
    expect(peek(sentry, '_target_z')).toBe(456)
    expect(peek(sentry, '_select_target_counter')).toBe(0)
  })

  it('entity_spider_t は生成座標を保持する', () => {
    const spider = new entity_spider_t(64, 0, 128, 5, 27)
    expect(peek(spider, '_target_x')).toBe(64)
    expect(peek(spider, '_target_z')).toBe(128)
    expect(peek(spider, '_animation_time')).toBe(0)
  })

  it('寿命を持つエンティティは寿命が設定される', () => {
    expect(peek(new entity_particle_t(0, 0, 0, 1, 30), '_lifetime')).toBe(3)
    expect(peek(new entity_explosion_t(0, 0, 0, 0, 26), '_lifetime')).toBe(1)
  })

  it('entity_player_t は初期の向きとカウンタを持つ', () => {
    const player = new entity_player_t(0, 0, 0, 5, 18)
    expect(player._angle).toBe(Math.PI / 2)
    expect(peek(player, '_bob')).toBe(0)
    expect(peek(player, '_frame')).toBe(0)
    expect(peek(player, '_last_shot')).toBe(0)
    expect(peek(player, '_last_damage')).toBe(0)
  })

  it('弾は角度から速度を得る（_init が基底フィールドに書ける）', () => {
    const plasma = new entity_plasma_t(0, 0, 0, 0, 26, 0)
    expect(plasma.vx).toBe(96)
    expect(plasma.vz).toBe(0)

    const sentry_plasma = new entity_sentry_plasma_t(0, 0, 0, 0, 26, 0)
    expect(sentry_plasma.vx).toBe(64)
    expect(sentry_plasma.vz).toBe(0)
  })
})
```

Run: `npx vitest run source/entity-init.test.ts`

Expected: PASS（5 件）。値が `0` や `undefined` になったらフィールド初期化順序の罠を踏んでいる

- [ ] **Step 7: 音色データの恒久テストを追加する**

`sound-effects.ts` と `music-dark-meat-beat.ts` の数値は音そのものであり、変わると気づかないまま音が変わる。移植時は使い捨てスクリプトで旧 `.js` と照合したが、その保証を恒久化するテストがない。純データなので `AudioContext` に依存せず Node で動く。

`source/audio-data.test.ts`:

`node:crypto` は使わない。`@types/node` が必要になり、それを入れると `setTimeout` の戻り値型が Node 版（`NodeJS.Timeout`）に切り替わって `terminal.ts` の `terminal_timeout_id` / `terminal_hide_timeout` の `ReturnType<typeof setTimeout> = 0` が通らなくなる。Web Crypto はブラウザと Node 18+ の両方でグローバルに使えるので依存を増やさずに済む（`digest` が非同期になる点だけ異なる）。

```ts
import { describe, expect, it } from 'vitest'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import {
  sound_beep, sound_explode, sound_hit, sound_hurt,
  sound_pickup, sound_shoot, sound_terminal,
} from './sound-effects'

// 値そのものを固定する。差分が出たら git diff で何が変わったか分かる。
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

const patches = {
  sound_terminal, sound_shoot, sound_hit, sound_beep,
  sound_hurt, sound_pickup, sound_explode,
}

describe('音色データ', () => {
  it('各パッチが 29 フィールドを持つ', () => {
    // sonantx-reduced.js が instr.xxx として読むフィールド数と一致する。
    // 打ち間違いでフィールドが増減すると無音で失敗するため件数を固定する。
    for (const [name, patch] of Object.entries(patches)) {
      expect(Object.keys(patch).length, name).toBe(29)
    }
  })

  it('効果音の値が変わっていない', () => {
    expect(digest(sound_terminal)).toBe('e6106576030ff855')
    expect(digest(sound_shoot)).toBe('64dc2fceb503978d')
    expect(digest(sound_hit)).toBe('d0f60664325a8797')
    expect(digest(sound_beep)).toBe('90ba85f337bce63a')
    expect(digest(sound_hurt)).toBe('8102f3ff635efb7f')
    expect(digest(sound_pickup)).toBe('e9ad4184c166d682')
    expect(digest(sound_explode)).toBe('3559d26edf0180a6')
  })

  it('楽曲の構造と値が変わっていない', () => {
    expect(music_dark_meat_beat.rowLen).toBe(5513)
    expect(music_dark_meat_beat.endPattern).toBe(25)
    expect(music_dark_meat_beat.songLen).toBe(101)
    expect(music_dark_meat_beat.songData.length).toBe(6)
    expect(digest(music_dark_meat_beat)).toBe('020050e12cd39d48')
  })
})
```

ハッシュは移植直後の値から算出したもので、旧 `.js` との一致は移植時に機械的に検証済み。

Run: `npx vitest run source/audio-data.test.ts`

Expected: PASS（3 件）

- [ ] **Step 8: 型チェックとテストが通ることを確認する**

Run: `npm run typecheck && npm test`
Expected: 型エラー 0 件、テスト PASS（23 件 = random 6 + entity 7 + entity-init 7 + audio-data 3）

`resolve.extensions` を消した状態でテストが通ることが、Step 5 の削除が安全だった証明になる。

- [ ] **Step 9: ブラウザで実際に動くことを確認する**

Run: `npm run dev`

#### スクリーンショットでは検証できない

**このゲームの動作確認にスクリーンショットを使わないこと。** ヘッドレスのブラウザペインではページが `document.visibilityState === 'hidden'` のままになり、`requestAnimationFrame` が約 0.2fps まで絞られる。`game_tick` が事実上止まるため、カメラの初期減衰（`camera.y` が -300 から約 10 フレームで 0 に収束する）すら終わらず、画面はほぼ黒のまま撮れる。加えて WebGL のコンテキストは `preserveDrawingBuffer: false` なので、rAF の外から `readPixels` しても合成後のバッファは破棄されていて全ゼロが返る。どちらも**ゲームの不具合ではない**ため、黒い画面や 0 ピクセルを故障と誤認しないこと。

移行前の旧構成でこの挙動を実測済み。手動でフレームを進めれば正しく描画されることが確認できている（下記の手順で非黒ピクセル 5475 個 / 画面の 9.5%、最大輝度 442、GL エラー 0）。

#### 状態アサーションで確認する

ブラウザのコンソール（または `javascript_tool`）から状態を直接読む。クリック待ちがあるので、まず一度クリックしてゲームを開始させる。`audio_init` の楽曲生成に数秒かかり、それが終わるまで `document.onclick` は設定されない。**開始直後のクリックは空振りするので、`typeof document.onclick === 'function'` を確認してからクリックする。**

```js
JSON.stringify({
  game_running: state.game_running,          // 1
  entities: state.entities.length,           // 60 前後
  cpus_total: state.cpus_total,              // 9（レベル1）
  player: state.entity_player && {x: state.entity_player.x, h: state.entity_player.h},
  minimap: getComputedStyle(document.getElementById('m')).display,  // 'block'
})
```

#### 描画を確認する

rAF を一時的に潰して手動でフレームを進め、**同一 JS ターン内で** `readPixels` する。

```js
const rafOrig = window.requestAnimationFrame
window.requestAnimationFrame = function () { return 0 }
try {
  for (let i = 0; i < 60; i++) { game_tick() }   // カメラを収束させる
  const px = new Uint8Array(320 * 180 * 4)
  gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, px)
  let nonblack = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] + px[i + 1] + px[i + 2] > 6) { nonblack++ }
  }
  console.log({ nonblack, gl_error: gl.getError() })
} finally {
  window.requestAnimationFrame = rafOrig
  requestAnimationFrame(game_tick)              // 本来のループを再開
}
```

`game_tick` / `gl` / `state` はモジュールスコープなので、コンソールから触るには一時的に `window` に出す必要がある。検証用に `main.ts` の末尾へ `Object.assign(window, { game_tick, gl, state })` を足し、**確認が済んだら必ず削除してコミットに含めないこと**。

Expected: `nonblack` が 3000 以上、`gl_error` が 0

#### 操作の確認

`input.ts` の `keys` を直接叩いて自機が動くことを見る（合成キーイベントに頼らない）。

```js
keys[key_right] = 1
for (let i = 0; i < 30; i++) { game_tick() }
keys[key_right] = 0
// state.entity_player.x が増えていること
```

同様に `keys[key_shoot] = 1` で `state.entities` に `entity_plasma_t` が増えることを確認する。

#### コンソールエラー

**エラーが 1 件も出ていないことを確認する。** `ReferenceError: Cannot access '...' before initialization` が出た場合は循環参照が残っている。該当モジュールの実行時 import を洗い、型のみの参照は `import type` に変える。`ReferenceError: _math is not defined` が出た場合は Task 6 Step 2 の置換が漏れている。

#### 人間による最終確認

上記が通ったら、実際のブラウザ（ヘッドレスでないもの）で `npm run dev` を開いて、イントロ→操作→射撃→CPU 再起動→レベル遷移→M キーの音声トグルを通しで見てもらう。自動検証で担保できるのはここまで。

- [ ] **Step 10: コミット**

```bash
git add index.html source/game.ts source/main.ts source/entity-init.test.ts source/audio-data.test.ts vite.config.ts
git commit -m "feat: game / main を TypeScript 化し index.html を ESM エントリに切り替える"
```

---

### Task 9: GitHub Actions とドキュメント更新

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `package.json` の `build` スクリプト、`vite.config.ts` の `outDir: 'dist'`
- Produces: `main` への push で GitHub Pages にデプロイされるワークフロー

- [ ] **Step 1: .github/workflows/deploy.yml を作成する**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`npm test` をビルド前に入れて、テストが落ちたらデプロイしないようにする。

- [ ] **Step 2: ビルドがローカルで通ることを確認する**

Run: `npm run build`
Expected: `dist/` に `index.html` と `assets/` が出力され、エラーなく終了

画像 4 枚がバンドルに取り込まれていることを確認する（静的 import が効いているかの検証）。

**PNG は別ファイルとして出力されない。** 4 枚とも 4096 バイト未満（`q2.png` 2171 / `l1`〜`l3` 各 300 前後）で、Vite の既定 `build.assetsInlineLimit` により**データ URI としてバンドルに埋め込まれる**。したがって `find dist -name '*.png'` は 0 件になるのが正しい。これは 404 が構造的に起こり得ないという意味でむしろ強い保証である。

```bash
grep -o "data:image/png;base64" dist/assets/*.js | wc -l
```

Expected: **4**。これより少なければ `game.ts` の `level_image_urls` か `main.ts` の `atlas_url` の import が漏れている

```bash
find dist -type f
```

Expected: `dist/index.html` と `dist/assets/index-*.js` の 2 ファイルのみ

- [ ] **Step 3: ビルド成果物が動くことを確認する**

Run: `npm run preview`

表示された URL を開き、Task 8 Step 7 の検証手順（状態アサーション、手動フレーム送りでの描画確認、`keys` による操作確認、コンソールエラーなし）を再実行する。`base: './'` が効いているかはここで分かる（アセットが 404 なら相対パスの設定漏れ）。

- [ ] **Step 4: .claude/launch.json を更新する**

現在の内容は旧構成のままで、**もう動かない**。`index.html` が `/source/main.ts` を読むようになったため、素の静的サーバーでは TypeScript を配信できない。

```json
{
	"version": "0.0.1",
	"configurations": [
		{
			"name": "takagiaction",
			"runtimeExecutable": "npm",
			"runtimeArgs": ["run", "dev"],
			"port": 5173
		}
	]
}
```

Vite の既定ポートは 5173。

- [ ] **Step 5: AGENTS.md を更新する**

以下を書き換える。

- プロジェクト概要の「ビルドツールもフレームワークも使わず、素の JavaScript を `<script>` で読み込むだけの構成です」→ TypeScript + Vite 構成であることと、`index.html` が `source/main.ts` 1 本を読み込み依存関係は import が表すことを書く
- ディレクトリ説明の `build.sh` の行を削除し、`vite.config.ts` / `tsconfig.json` / `.github/workflows/deploy.yml` を追加
- 「開発時の実行」の節を差し替える:

```markdown
## 開発時の実行

```bash
npm install
npm run dev
```

表示された URL を開く。`source/` を編集すると自動でリロードされます。

型チェックとテスト:

```bash
npm run typecheck
npm test
```
```

- 「`main` ブランチへの push が GitHub Pages にそのまま公開されます」→ GitHub Actions がビルドしてデプロイすることに変更
- 「Python は必ず uv で実行する」の節はそのまま残す

- [ ] **Step 6: README.md を更新する**

**まず削除済みファイルへの参照を洗い出す。** `source/` の `.js` は `sonantx-reduced.js` の 1 つだけになったので、それ以外の `.js` を名指ししている箇所はすべて陳腐化している。

```bash
grep -n "\.js\b" README.md | grep -v sonantx
```

現時点で 8 箇所ある。内容ごとに直す:

| 行 | 現在の記述 | 対応 |
| --- | --- | --- |
| 130 | 新しいフロアの作り方で `source/game.js` の `next_level` 判定を増やす旨 | `source/game.ts` に変更 |
| 141 | `source/game.js` \| 入力処理、レベル読み込み、メインループ | 入力は `input.ts` に分離されたので行を分ける。`source/game.ts`（レベル読み込みとメインループ）と `source/input.ts`（キー入力）と `source/state.ts`（共有状態） |
| 142 | `source/renderer.js` | `source/renderer.ts` |
| 143 | `source/entity*.js` | `source/entity*.ts` |
| 144 | `source/minimap.js` | `source/minimap.ts` |
| 145 | `source/terminal.js` | `source/terminal.ts` |
| 146 | `source/audio.js`, `sound-effects.js`, `music-*.js` | `source/audio.ts`, `sound-effects.ts`, `music-*.ts`。`sonantx-reduced.js` はサードパーティのため `.js` のまま残ることを注記 |
| 150 | `shrinkit.js` \| ソースを縮めるための独自の前処理スクリプト | 行を削除（ファイル自体を削除済み） |
| 172 | 日本語テキストの所在（`terminal.js` / `game.js` / `entity-cpu.js` / `entity-player.js` / `main.js`） | すべて `.ts` に変更 |

その他:

- ファイル構成表から `build.sh` / `source/html-template.html` の行を削除し、`vite.config.ts` / `tsconfig.json` / `.github/workflows/deploy.yml` を追加
- 「ビルド」の節（`build.sh` の使い方、`build/` に `underrun.html` と `underrun.zip` が出る説明、`rm` のエラーに関するメモ）を `npm run build` と `npm run preview` の説明に差し替える
- 13KB 制約に関する記述（178 行目付近）は、もともと「必ずしも守る必要はない」と書いてあるので、js13k 用ビルドが無くなったことを明記する形に更新する
- 実行手順を `uv run python -m http.server` から `npm run dev` に変更
- テストの実行方法（`npm test`）と型チェック（`npm run typecheck`）を追記

**確認**: 更新後に `grep -n "\.js\b" README.md | grep -v sonantx` が 0 行になること（`sonantx-reduced.js` への言及だけが残る）

- [ ] **Step 7: コミット**

```bash
git add .github/workflows/deploy.yml .claude/launch.json AGENTS.md README.md
git commit -m "chore: GitHub Actions で Pages にデプロイしドキュメントを更新する"
```

- [ ] **Step 8: ユーザーに手作業を依頼する**

**このステップはエージェントが実行できない。** リポジトリ設定の変更が必要なことをユーザーに伝える。

> GitHub のリポジトリ設定 → Pages → Source を「Deploy from a branch」から「GitHub Actions」に変更してください。この変更をしないと、`actions/deploy-pages@v4` が Pages API から 404 を受け取り deploy ジョブがはっきり失敗します（公開内容が古いまま残るのではありません）。

変更後、`main` に push してワークフローが緑になり、公開 URL でゲームが動くことを確認する。

---

## 完了条件

- `npm run typecheck` が型エラー 0 件で通る
- `npm test` が通る（`random.test.ts` 6 件 + `entity.test.ts` 7 件 + `entity-init.test.ts` 7 件 + `audio-data.test.ts` 3 件 = 23 件）
- `npm run dev` でゲームが動き、コンソールにエラーが出ない
- `npm run build` → `npm run preview` でも同様に動く
- `source/` に `.js` が 1 つだけ残っている（`sonantx-reduced.js`）
- `build.sh` / `shrinkit.js` / `.nojekyll` / `source/html-template.html` が削除されている
- `_math` / `_document` / `udef` / `_temp` がコードベースから消えている
- GitHub Actions が緑になり、公開 URL が更新される
