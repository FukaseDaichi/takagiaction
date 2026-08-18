# TypeScript + Vite 移行 設計書

作成日: 2026-08-18

## 概要

素の JavaScript を `<script>` 20 本で読み込む現構成を、TypeScript + Vite + Vitest に移行する。目的は今後の改修（とくに[ニコチン・ローグライト化](2026-08-18-nicotine-roguelite-design.md)）を型とテストで支えること。

前提として、この移行は **js13k 用の圧縮ハックを剥がす作業とほぼ同義**である。`build.sh` を捨てると `_math` / `_document` / `udef` / `_temp` を維持する理由が同時に消える。

## 決定事項

| 項目 | 決定 |
| --- | --- |
| 言語 | TypeScript |
| ツール | Vite + Vitest |
| ソースディレクトリ | `source/` のまま（`src/` に改名しない） |
| 移行の粒度 | 一括。JS/TS 混在期間を作らない |
| `strict` | `strict: true`、`noUncheckedIndexedAccess` は無効 |
| `_` 接頭辞 | 名前は変えず、`private` / `protected` 修飾子で意図を表現する |
| 13KB 制約 | 追わない（README:178 で既に非拘束と宣言済み） |

### 移行を一括で行う理由

現コードの結合はすべて素のグローバル `var` を介している。`.ts` モジュールは `var` 宣言された束縛を import できないため、部分移行するには `declare global` のアンビエント宣言を並行維持する必要がある。これは移行完了後に全削除される捨てコードであり、AGENTS.md の「一応残しておくコードは残さない」に反する。総量が 2072 行と小さいことも一括移行を選ぶ根拠。

## 削除するもの

| 対象 | 理由 |
| --- | --- |
| `source/html-template.html` | `build.sh` が `sed` で `GAME_SOURCE` を差し替えるための単一ファイル版テンプレート。`build.sh` 以外から参照されていない |
| `build.sh`、`shrinkit.js`、`build/` | js13k 提出用パイプライン。`.gitignore` に `build` があり成果物はコミットされず、GitHub Pages は `source/` を直配信しているため、デプロイに一切関与していない |
| `uglify-es` 依存 | 上記に伴い不要 |
| `_math = Math`、`_document = document` | mangle 後にバイト数を稼ぐエイリアス |
| `udef`（global undefined） | `undefined` を短く書くためのもの |
| `_temp`（共有スクラッチ変数） | 一時変数の使い回しによるバイト削減。`load_image` / `load_level` / `preventDefault` のローカル変数にする |
| `.nojekyll` | Actions 経由の artifact デプロイでは Jekyll が走らない |

`package.json` の `name: "undderun"` のタイポも `takagiaction` に直す。

`_init()` が constructor と別メソッドになっているのも「constructor は mangle できない」ためだが、こちらは entity のサブクラス群が全面的に依存しているため構造として維持する。

## モジュール構成

```
source/
  state.ts                    共有可変データ。実行時 import を持たない
  dom.ts                      c / m / a 要素の取得と型付け
  input.ts                    keys, key_* 定数, keydown/keyup ハンドラ
  random.ts                   シード付き LCG（現状のまま）
  renderer.ts                 WebGL。camera オブジェクトを公開し頂点数は隠蔽
  entity.ts                   基底クラス entity_t
  entity-player.ts            entity_player_t
  entity-cpu.ts               entity_cpu_t
  entity-plasma.ts            entity_plasma_t
  entity-spider.ts            entity_spider_t
  entity-sentry.ts            entity_sentry_t, entity_sentry_plasma_t
  entity-particle.ts          entity_particle_t, spawn_particles()
  entity-health.ts            entity_health_t
  entity-explosion.ts         entity_explosion_t
  sonantx-reduced.js          サードパーティ（zlib）。export 追加と _math→Math のみ
  sonantx-reduced.d.ts        上記の型宣言（手書き）
  sound-effects.ts            音色データ
  music-dark-meat-beat.ts     楽曲データ
  audio.ts
  minimap.ts
  terminal.ts
  game.ts                     ループとレベル遷移
  main.ts                     起動シーケンス（Vite のエントリ）
  vite-env.d.ts               /// <reference types="vite/client" />
```

`index.html` の 20 本の `<script>` は `<script type="module" src="/source/main.ts"></script>` 1 本になる。

### game.js の 3 分割

現 `game.js` は 34 個のトップレベル宣言を持ち、入力・時間・レベル状態・ゲームループの 4 関心事が同居している。これを `state.ts` / `input.ts` / `game.ts` に分ける。分割は美観のためではなく循環参照を避けるために必要である（下記参照）。

`load_image()` は `game.ts` に残すが、ローグライト化でフロアが手続き的生成に変わると PNG 読み込みが消えて不要になる（ローグライト設計書「副次的な簡素化」節）。今回は延命させず、移行時点の最小形で置く。

### サードパーティコードの扱い

`sonantx-reduced.js`（318 行）は sonant-x の派生で zlib ライセンス下にある。内部への型付けは価値が低いため `.js` のまま残し、末尾に `export { sonantxr_generate_song, sonantxr_generate_sound }` を追加する。呼び出し側（`audio.ts`）の型安全は手書きの `sonantx-reduced.d.ts` で確保する。

ただし export の追加だけでは済まない。**このファイルは `_math` を 6 箇所（45 / 75 / 118 / 119 / 174 / 184 行）で参照している。** `_math` は `game.js:3` のグローバルなエイリアスなので、Task 8 で `game.js` を削除すると解決先が消え、`audio_init()` が音を生成した瞬間に `ReferenceError: _math is not defined` になる。イントロのコールバックチェーンの起点が `audio_init` であるため、ゲームが一切起動しなくなる。6 箇所を `Math.` に置き換える。アルゴリズムと数値、ライセンスヘッダには触れない。

外部識別子への依存は `_math` のみであることを確認済み（`udef` / `_document` / `_temp` の参照はない）。

`allowJs` は不要である。`sonantx-reduced.d.ts` が存在すれば `import ... from './sonantx-reduced'` の型解決は `.d.ts` 側に当たり、TS は `.js` 本体を読まない。実行時の読み込みは Vite が担当する。フラグを増やさずに済む。

一方 `sound-effects.ts` と `music-dark-meat-beat.ts` は音色パッチの純粋なデータなので `SonantInstrument` インターフェースを定義して付ける。フィールド名の打ち間違いが現在は無音で失敗するため、ここは型付けの見返りが大きい。

## 共有可変状態

ESM では import した束縛に代入できない。モジュール境界を越えて**再代入**されている変数を実測した結果が以下。

| 変数 | 宣言元 | 外から書いているファイル | 移行後 |
| --- | --- | --- | --- |
| `game_running` | game.js:22 | main.js:11, terminal.js:170 | `state.game_running` |
| `cpus_rebooted` | game.js:19 | entity-cpu.js:20 | `state.cpus_rebooted` |
| `cpus_total` | game.js:18 | （game.js のみ。entity-cpu.js が読む） | `state.cpus_total` |
| `current_level` | game.js:21 | （game.js のみ。entity-cpu.js が読む） | `state.current_level` |
| `time_elapsed` | game.js:11 | （game.js のみ。entity 群 / minimap が読む） | `state.time_elapsed` |
| `entity_player` | game.js:23 | （game.js のみ。renderer / minimap が読む） | `state.entity_player` |
| `entities` | game.js:24 | game.js:48, game.js:222 で**再代入** | `state.entities` |
| `entities_to_kill` | game.js:25 | game.js:225 で**再代入** | `state.entities_to_kill` |
| `camera_x` / `camera_y` / `camera_z` | renderer.js:22 | game.js:126-128, 203-205, 209-210 | `camera.x` / `.y` / `.z` |
| `camera_shake` | renderer.js:22 | entity-sentry.js:57, entity-spider.js, game.js:208-210 | `camera.shake` |
| `num_verts` / `num_lights` | renderer.js:11,18 | game.js:49-50 | renderer 内に隠蔽し `renderer_reset_level_geometry()` で操作 |
| `level_num_verts` | renderer.js:13 | game.js:130 | renderer 内に隠蔽し `renderer_freeze_level_geometry()` で操作 |

規則は 1 つ、**モジュール境界を越えて再代入されるものはオブジェクトのプロパティにする**。`state.ts` が共有データを持ち、`renderer.ts` は `camera` オブジェクトを公開する（`camera` の所有者は renderer だが、追従とシェイクの計算はゲームロジックなので game.ts が書く。ローグライト化ではニコチンゲージからも `camera.shake` に加算される）。

例外は頂点カウンタ 3 つ。`num_verts` / `num_lights` / `level_num_verts` は renderer の内部実装であり、game.ts が触る必要があるのは「レベル形状の構築を始める」「構築を終えて固定する」の 2 点だけなので、`renderer_reset_level_geometry()` と `renderer_freeze_level_geometry()` に包んで renderer 内に隠す。ここは関数にすることで実際に隠蔽が増える。

`state.ts` の形:

```ts
import type { entity_t } from './entity'
import type { entity_player_t } from './entity-player'

// 再代入されない定数と、中身だけ書き換えるバッファは named export
export const level_width = 64
export const level_height = 64
export const level_data = new Uint8Array(level_width * level_height)

// 境界を越えて再代入されるものはオブジェクトのプロパティにする
export const state = {
  time_elapsed: 0,
  game_running: 0,
  current_level: 0,
  cpus_total: 0,
  cpus_rebooted: 0,
  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
```

`level_data`（Uint8Array）だけは `level_data.fill()` のように中身を書き換えるのみで再代入されないため `const` の named export にできる。

一方 `entities` と `entities_to_kill` は `game.js:48` の `entities = []`、`game.js:222` の `entities = entities.filter(...)`、`game.js:225` の `entities_to_kill = []` で**再代入されている**ため `const` export にはできず、`state` のプロパティにする。`entity_t` の constructor は `state.entities.push(this)` になる。

`time_last` は現在 `game.js:12` でグローバル宣言されているが、読み書きが `game_tick` に閉じているため `state` には入れず `game.ts` のモジュールローカル変数にする。`time_elapsed` のほうは entity 群・minimap・terminal が読むため共有状態に置く。

`state.ts` が `import type` のみを使い**実行時 import を一切持たない**ことが、この構成の要である。型のみの import はコンパイル時に消えるため実行時の依存グラフに現れない。

`state.entity_player` は `| null` になるが、`game_tick` は `load_level` が代入した後にしか走らない。読み出し側（renderer のカメラ追従、minimap）では `!` を使い、毎フレームの null チェックは入れない。

## 循環参照

### 必須の修正: entity.ts → entity-particle.ts

`entity.js:59` の `_spawn_particles()` が `new entity_particle_t(...)` を呼んでおり、`entity_particle_t` は `extends entity_t`。ESM のモジュール評価は深さ優先の後順で行われ、`extends` 節は**モジュール初期化時**に評価される。したがって `entity.ts` の評価中に `entity-particle.ts` が評価され、そこで `entity_t` を参照した時点で TDZ に入り `ReferenceError: Cannot access 'entity_t' before initialization` になる。

これは設計上の誤り（基底クラスが特定のサブクラスを知っている）が ESM で顕在化したもの。**`_spawn_particles` を `entity-particle.ts` の自由関数 `spawn_particles(source, amount)` に出す**ことで断つ。呼び出し元は `entity-sentry.ts:51` と `entity-spider.ts:40` の 2 箇所のみ。

### 許容する循環: 11 モジュールの単一クラスタ

実行時 import のグラフで強連結成分を計算すると、`audio, entity-cpu, entity-health, entity-plasma, entity-player, entity-sentry, entity-spider, game, input, minimap, terminal` の **11 モジュールが 1 つの循環クラスタ**を形成する（対で捉えられる循環が複数あるのではなく、これら全体が互いに到達し合う単一の強連結成分）。非循環のコアは `state, dom, random, renderer, entity, entity-particle, entity-explosion, sound-effects, music-dark-meat-beat`。

クラスタ内の循環はいずれもメソッド本体・関数呼び出しという**実行時**参照が起点で、`extends` のようなモジュール初期化時の評価を経由しない。代表例:

- `game.ts ⇄ entity-player.ts` — `entity-player.js:52` の `_kill()` が `game.js` の `reload_level` を呼び、`game.js` は `new entity_player_t()` する
- `audio ⇄ terminal`
- `terminal → minimap → entity-cpu → terminal`
- `entity-cpu ⇄ game`
- `entity-plasma → entity-sentry → entity-player → entity-plasma`
- `entity-health → entity-player → game → entity-health`

同様に `entity-sentry.ts` → `entity-player.ts`（`instanceof` 判定）、`entity-sentry.ts` → `entity-explosion.ts`（`new`）も実行時参照のみで安全。

**この安全性の根拠は「`state.ts` に実行時 import がない」ことではない。** それは必要条件に過ぎない（`state.ts` が葉であることは循環の起点にならないという別の性質を保証するだけ）。実際に TDZ を防いでいる性質は「**`entity.ts` が、`entity_t` のサブクラスを宣言するモジュールに（推移的にでも）到達しない**」こと。9 個の `extends` 節はすべて `entity_t` を指し、`entity.ts` は非循環コアに属するため、どんな評価順でも `entity.ts` の初期化完了前にサブクラス側の `extends entity_t` が評価されることはない。

この不変条件は破りやすい。たとえば `entity.ts` に `import { terminal_show_notice } from './terminal'` を足すと（基底クラスに死亡メッセージを出したくなれば十分ありえる）、`entity.ts` は `terminal → minimap → entity-cpu` 経由でサブクラス宣言モジュールに到達し、`entity-cpu.ts` の `extends entity_t` が `entity.ts` の初期化中に評価されうる。決定 3 が防ぐために作られたまさにその `ReferenceError` が復活し、しかも**評価順依存なので初回のリロードでは再現しないことがある**。この規則は `entity.ts` 先頭のコメントに明文化してある。

設計としては綺麗ではない。プレイヤー死亡をゲームループ側が検知する形に反転すれば `game.ts ⇄ entity-player.ts` は消えるが、それは死亡通知の経路を新設する話でスコープが広がるため今回は行わない。

## entity クラスの型付け

### 可視性

`_` 接頭辞は残し、実際の呼び出し元に基づいて修飾子を割り当てる。**TS では `private` メンバをサブクラスがオーバーライドできない**（"Types have separate declarations of a private property" になる）ため、オーバーライドされるものは `protected` 以上が必須。

| メンバ | 呼び出し元 | 修飾子 |
| --- | --- | --- |
| `_update()` | `game_tick()` のループ、サブクラスの `super` | `public` |
| `_render()` | `game_tick()` のループ、サブクラスの `super` | `public` |
| `_check(other)` | `game_tick()` のループ | `public` |
| `_receive_damage(from, amount)` | 他エンティティ（plasma / spider / sentry が相手に対して呼ぶ） | `public` |
| `_dead` | entity.ts 内、および `game_tick()` が読む | `public` |
| `x` `y` `z` `vx` `vy` `vz` `ax` `ay` `az` `f` `s` `h` | renderer 呼び出しと他エンティティ | `public` |
| `_kill()` | 自クラスとサブクラスのみ。game.ts からは呼ばれていない | `protected` |
| `_init(param)` | entity.ts の constructor、サブクラスがオーバーライド | `protected` |
| `_did_collide()` | entity.ts 内、サブクラスがオーバーライド | `protected` |
| `_collides(x, z)` | entity.ts 内のみ、オーバーライドなし。テストがサブクラス経由で呼ぶ | `protected` |
| `_angle` | `entity_player_t` 内、および **`minimap_draw()` 内が読む**（自機の向きを 1px で描くため） | `public` |
| `_bob` `_frame` `_last_shot` `_last_damage` | `entity_player_t` 内のみ | `private` |
| `_animation_time` | `entity_cpu_t` / `entity_spider_t` の各クラス内のみ（別々に宣言されている） | それぞれ `private` |

結果として `private` が実際に付くのは主にサブクラス固有の状態フィールドになる。これは最も価値のある位置でもある（「この敵が自分で持つ状態」がコード上に明示される）。

### field 宣言の追加

`entity_player_t._init()` は `this._bob` などを宣言なしで代入している。TS はこれを弾くので、各サブクラスに field 宣言を追加する。副産物として敵ごとの内部状態が読めるようになる。

基底クラスの `_dead` は現在 `_kill()` が呼ばれるまで `undefined` で、`game.js:182` の `if (e1._dead)` がそれを falsy として扱っている。`public _dead = false` と明示初期化する（挙動は変わらない）。

### `_init` の引数型

`_init` の引数型はサブクラスごとに異なる（`entity_plasma_t` と `entity_sentry_plasma_t` は角度 `number`、他 7 クラスは受け取らない）。当初は基底クラスを `entity_t<TInit>` と型引数化する案だったが、**実装中に TypeScript の分散(variance)推論と衝突することが判明したため撤回した。**

`TInit` は `_init` の引数位置にしか現れないため、TS は `entity_t<TInit>` を `entity_t<undefined>` に代入可能と見なさない。基底クラスの constructor が `state.entities.push(this)` する箇所で TS2345 になる。

```
error TS2345: Argument of type 'this' is not assignable to parameter of type 'entity_t<undefined>'.
  Type 'entity_t<TInit>' is not assignable to type 'entity_t<undefined>'.
```

回避するには `push(this as entity_t)` のようなキャストが必要になり、分散チェックを潰すことになる。一方で現行の 9 クラスの init 引数はすべて `number | undefined` であり、**型引数は今の要件に対して何も買っていない**。

したがって引数型を `number` 固定にする。

```ts
export class entity_t {
  constructor(x: number, y: number, z: number, friction: number, sprite: number, init_param?: number) { ... }
  protected _init(init_param?: number): void {}
}

export class entity_plasma_t extends entity_t {
  protected override _init(angle?: number): void { ... }
}
```

これでキャストは不要になり、型チェックが通る。引数を取らないサブクラスは `_init()` とだけ書けばよい（TS はより少ない引数のオーバーライドを許す）。

AGENTS.md の「現在の要件を完全に満たす、最もシンプルな実装を選ぶ」「将来を見越した過剰な抽象化は避ける」に従った判断である。将来 `number` 以外の init 引数が必要になったら、そのときに型を広げる。

### 暗黙グローバルの置き換え

要素 ID による暗黙グローバルを 3 箇所で使っている。`dom.ts` に集約する。

| 現行 | 使用箇所 | 移行後 |
| --- | --- | --- |
| `c` | renderer.js:2, renderer.js:104, terminal.js:171 | `dom.ts` の `canvas` |
| `m` | minimap.js:8, minimap.js:13, minimap.js:17 | `dom.ts` の `minimap_canvas` |
| `a` | terminal.js:82-121 の複数箇所 | `dom.ts` の `terminal_el` |

`c` は renderer と terminal の 2 モジュールから使われるため、`getElementById` と型アサーションを重複させないためにも集約する意味がある。

### `noImplicitThis` が要求する構造変更

`load_image()` はコールバック内の `this` が読み込まれた `Image` であることに依存している（`game.js:60` の `_temp.drawImage(this, 0, 0)`、`main.js:15` の `renderer_bind_image(this)`）。`strict` に含まれる `noImplicitThis` はこれを型付けできないため、画像を引数で渡す形に変える。

```ts
function load_image(
  url: string,
  callback: (image: HTMLImageElement) => void,
): void {
  const image = new Image()
  image.src = url
  image.onload = () => callback(image)
}
```

`name: string` ではなく解決済みの `url: string` を受け取る。`'m/' + id + '.png'` のような文字列連結だと Vite が参照を静的に検出できず、本番ビルドで `dist` に画像が出力されず 404 になるため（`game.ts:21-24`）。レベル画像は `import l1_url from '../m/l1.png'` のような静的 import で URL を得て、そのまま `load_image` に渡す。

### その他 strict で必要になる小変更

- `random.js` の `rand_high` / `rand_low` は宣言のみで未初期化。`let rand_high = 0` と明示する（`random_seed()` が必ず先に呼ばれるため挙動は変わらない）
- `keys[code] !== udef` による「追跡対象のキーか」の判定は、`udef` を削除するため `code in keys` に置き換える
- `array_rand()` は `<T>(array: T[]): T` のジェネリック関数にする

### WebGL の nullable

`getContext()` / `getUniformLocation()` / `createBuffer()` / `createProgram()` はいずれも `| null` を返す。これらが失敗した場合ゲームは成立しないため、初期化境界で非 null アサーション `!` を使い、実行時チェックは入れない。

## tsconfig

```jsonc
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022", "dom"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noImplicitOverride": true,
    "noEmit": true,           // 出力は Vite が行う
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["source"]
}
```

`noUncheckedIndexedAccess` を無効にするのは、`level_data[i]` と `keys[key_left]` の添字アクセスがコード全域にあり、有効にすると全部 `| undefined` になって毎回ガードが必要になるため。実害の割に読みにくさが増す。

`types: []` を指定するのは、`types` 配列がないと TS が `node_modules/@types` の全パッケージを自動 include してしまうため。将来 `@types/node` を引き込む依存が増えると Node 版の `setTimeout` の戻り値型（`NodeJS.Timeout`）が scope に入り、DOM 版を前提にした `terminal.ts` の `ReturnType<typeof setTimeout> = 0` が型エラーになる。`vite-env.d.ts` のトリプルスラッシュ参照はこの設定と無関係に解決される。

`noImplicitOverride`（`11fc10a` で追加）は `override` キーワードの明示を強制する。オーバーライドの意図が宣言に出るほか、基底側のメンバを消したときに `override` の付いた側が確実にエラーになる。

`skipLibCheck` は依存パッケージの `.d.ts` の型検査を飛ばす。自分のコードの型安全とは無関係で、ビルド時間短縮のため。

## テスト

`random.ts` はシード付き LCG（`random_seed()` → `random_int()`）で完全に決定論的であり、ローグライトの手続き的フロア生成の土台になる。まずここのシード再現性を Vitest で固定する。加えて `entity_t` の壁衝突判定を手組みの `level_data` グリッドに対して検証する。

テストは `source/*.test.ts` に併置する。

最終的には `random.test.ts` / `entity.test.ts` に加え、音色データの回帰検出用 `audio-data.test.ts` とフィールド初期化順序の恒久テスト `entity-init.test.ts` も追加され、4 ファイル 23 テストになった。カバレッジ網羅は追わない。テスト基盤の見返りが本格的に出るのはローグライト化のほう（ゲージ減少式、射撃間隔の三段乗算、部屋の重なり判定、非常口の配置規則）であり、今回の目的は「ハーネスが動くことの証明」に留める。

## ビルドとデプロイ

### vite.config.ts

`base: './'` を設定する。GitHub Pages のプロジェクトページは `<user>.github.io/takagiaction/` 配下で配信されるため、絶対パスでは資産を解決できない。

スプライトアトラスは `import atlas_url from '../m/q2.png'` で読み込み、Vite にハッシュ付きで出力させる。`m/l1.png` `l2.png` `l3.png` はローグライト化で手続き的生成に置き換わると不要になるが、今回の移行では残す。

### package.json スクリプト

| スクリプト | 内容 |
| --- | --- |
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |

### GitHub Actions

`.github/workflows/deploy.yml` を追加し、`npm ci` → `npm run build` → `actions/upload-pages-artifact`（`dist/`）→ `actions/deploy-pages` の流れにする。

`.gitignore` は `build` を削除し `dist` を追加する。

### 必要な手作業

**GitHub のリポジトリ設定 → Pages → Source を「Deploy from a branch」から「GitHub Actions」に変更する。** これはリポジトリ設定なのでコードからは変更できず、移行後にユーザーが行う必要がある。API からなら `gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow` で変えられる。

**この変更を忘れると、CI は全ジョブ success を返したまま壊れたものが公開される。** これは実際に起きた。2026-08-18 のマージ時、`build_type` が `legacy` のまま push した結果:

- `Deploy to GitHub Pages` ワークフローの build ジョブと deploy ジョブは**どちらも success**
- 同時に走った従来の `pages build and deployment`（`dynamic` トリガー）も success
- しかし `build_type: legacy` の間は従来のブランチ直配信が実際の公開内容を決めるため、配信されたのは**リポジトリ直下の未ビルド `index.html`**
- 結果として公開サイトは `<script type="module" src="/source/main.ts">` を返し、`/source/main.ts` は HTTP 200 で `Content-Type: video/mp2t`（GitHub Pages は `.ts` を MPEG transport stream として扱う）。ブラウザはモジュールの MIME を厳格に検査するため実行を拒否し、**ゲームは起動しなかった**
- `/assets/` は 404。ビルド成果物はどこにも配信されていなかった

`build_type` を `workflow` に変更してワークフローを再実行したところ、`index.html` は `./assets/index-*.js`（`application/javascript`、31046 バイト）を参照するようになり、`/source/main.ts` は 404 になり、本番 URL でゲームが起動した（ターミナルに「9 件のシステムを検出」、ミニマップ表示、`gl.getError()` 0、コンソールエラーなし）。

**教訓として、CI の success はこの設定が正しいことの証明にならない。** 公開 URL を実際に取得して、`index.html` が `./assets/` のバンドルを参照していることを確認する必要がある。

### AGENTS.md / README.md の更新

- 「ビルドツールもフレームワークも使わず、素の JavaScript を `<script>` で読み込むだけの構成」→ TypeScript + Vite 構成に書き換え
- 「開発時の実行」を `uv run python -m http.server 8000` から `npm run dev` に変更
- 「開発時は不要」としていた `build.sh` の記述を削除
- README のファイル構成表とビルド手順の節を更新

「Python は必ず uv で実行する」の方針は残す（開発サーバー以外の用途で使う可能性があるため）。

## 移行の段

1. Vite / Vitest / TypeScript の導入と設定（`package.json`、`tsconfig.json`、`vite.config.ts`、`vite-env.d.ts`）
2. 13KB ハックの削除（`build.sh`、`shrinkit.js`、`_math` / `_document` / `udef` / `_temp`）
3. `state.ts` / `dom.ts` / `input.ts` の切り出しと `game.ts` の再構成
4. `renderer.ts` の TS 化（`camera` オブジェクトの公開、頂点カウンタの隠蔽と `renderer_reset_level_geometry()` / `renderer_freeze_level_geometry()`）
5. entity 群の TS 化（field 宣言、可視性修飾子、`spawn_particles` の外出し）
6. audio 系の TS 化（`sonantx-reduced.d.ts` の手書き、`SonantInstrument` 型）
7. `minimap.ts` / `terminal.ts` / `main.ts` の TS 化と `index.html` の書き換え
8. Vitest のテスト追加（最終的に 4 ファイル 23 テスト）
9. GitHub Actions のワークフロー追加とドキュメント更新

各段の終わりにブラウザで実際にゲームが動くことを確認する。とくに段 3〜5 は循環参照が実行時エラーとして出るため、リロードして起動シーケンスが通ることの確認が検証手段になる。

## 移行前ベースライン

この移行の受け入れ基準は「移行前と移行後でゲームの挙動が変わっていないこと」そのものである。したがって移行前の実測値こそが、その基準を満たしたと言える唯一の証拠になる。実測は Task 1（旧構成、`8e42b59`）と Task 8（ESM 化直後）の 2 回、同じ手順で行った。

### 測定値

移行前（旧構成、`main` ブランチへの分岐点 `8e42b59` を `uv run python -m http.server 8000` で配信して実測）:

| 項目 | 値 |
| --- | --- |
| `game_running` | 1 |
| `state.entities.length` | 63 |
| `state.cpus_total` | 9（レベル 1） |
| `current_level` | 1 |
| 自機の初期座標 | (112, 456) |
| 自機の HP / 向き | 5 / π/2 (1.5708) |
| `num_verts`（レベル形状構築後） | 15522 |
| 手動フレーム送り 60 回後の非黒ピクセル | 5475 個（画面 320×180 の 9.5%） |
| 最大輝度（R+G+B の和） | 442 |
| `gl.getError()` | 0 |
| ミニマップの `display` | `block` |

移行後（ESM 化直後、Task 8。コード変更なしで動的 import により再測定）: 自機座標・エンティティ数・CPU 数・HP・向きは上表と完全一致（`state.entity_player.x === 112`、`.z === 456` まで一致しており、PNG デコードとシード付き乱数によるレベル生成が同一結果を出している直接の証拠になる）。カメラは自機座標の符号反転 `(-112, 0, -456)` に収束する。4 方向の移動は対称（右 +12.78 / 左 -12.75 / 上 -12.78 / 下 +12.75）。この値は「キーを 30 tick 押し続けた後、キーを離してさらに 60 tick 進め摩擦で残存速度を減衰させ切った」合計 90 tick 分の総変位である。30 tick（押下中のみ）の変位ではない（後述「測定方法」参照。30 tick だけなら 8.45 になり報告値と一致しない）。

非黒ピクセルは 5757 個（10.0%）、最大輝度 456、`gl.getError()` は 0 のまま。上表の 5475 個 / 442 との差は退行ではない。60 tick 手動送りの間に敵が乱数で動くため、測定時点のフレームで敵の位置が旧構成の測定時と一致するとは限らず、その分の描画面積・輝度が数 % 変動する。`num_verts` はこの段の Task 4 で renderer 内部に隠蔽されており、外から読める公開値ではなくなったため移行後には再測定していない（`renderer_reset_level_geometry()` / `renderer_freeze_level_geometry()` の呼び出しが正しく起きていることは Task 4 のレビューで別途確認済み）。

### 測定方法（再現手順）

**スクリーンショットでは判定できない。** ヘッドレスのブラウザペインは `document.visibilityState` が `'hidden'` に固定され、`requestAnimationFrame` が約 0.2fps まで絞られる。`game_tick` が事実上止まるため画面はほぼ黒のまま撮れる。加えて WebGL コンテキストは `preserveDrawingBuffer: false` で作られているため、rAF の外から `readPixels` すると合成後のバッファは破棄されていて全ゼロが返る。どちらもゲームの不具合ではない。

手順:

1. `window.requestAnimationFrame` を一時的に `() => 0` などの no-op に置き換える。`game_tick()` を rAF から切り離し、以降は手動で呼んだ回数だけ進むようにする
2. `performance.now` を「呼ぶたびに厳密に `1000/60` ms 進む」スタブに置き換える。

   ```js
   let stub_now = performance.now()
   performance.now = () => (stub_now += 1000 / 60)
   ```

   これが必要な理由: `game.ts` は `time_last = performance.now()` を基準に毎 tick `state.time_elapsed = (performance.now() - time_last) / 1000` を計算している。スタブなしで同期ループから `game_tick()` を連打すると呼び出し間隔は実時間でほぼ 0ms のため `time_elapsed` もほぼ 0 になり、物理がほとんど進まない。1 tick を厳密に 1/60 秒として進めるにはスタブが要る
3. **スタブ導入直後に空打ちの tick を数回流し、蓄積した実時間の差分を捨てる。** `time_last` はスタブ導入前の実時刻を保持したままなので、スタブ導入後最初の 1 tick は「ページを開いてからスタブを入れるまでの実時間」をそのまま `time_elapsed` として受け取る。数秒開けてからスタブを入れると、その数秒分がまるごと 1 tick の `time_elapsed` になり、摩擦計算が暴走して自機が画面外へ数千 px 飛ぶ。これは実際に発生した失敗であり、測定をやり直す原因になった。スタブ導入後、`state.time_elapsed` が 1/60（≈0.0167）に落ち着いたことを確認してから本計測に入ること
4. 非黒ピクセル・最大輝度・`gl.getError()` の確認は、`game_tick()` をさらに 60 回呼んで（カメラの初期減衰などを収束させる）から、**同一 JS ターン内で** `gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, buf)` を呼び、`R+G+B > 6` の画素数（非黒）・最大輝度・`gl.getError()` を読む。ターンを跨ぐと `preserveDrawingBuffer: false` によりバッファが破棄され全ゼロになる
5. 移動確認は `keys[key_right] = 1` のように `input.ts` の `keys` を直接叩いて **30 tick** 進める（キー押下）。続けて `keys[key_right] = 0` に戻し、**さらに 60 tick** 進める（摩擦で残存速度を減衰させ切る）。報告している移動量は**この合計 90 tick の総変位**であり、押下中の 30 tick だけの変位ではない（30 tick だけでは 8.45 になり、報告値 12.78 と一致しない）。`entity_player.x` / `.z` の変化量を見る（合成キーイベントに頼らない）
6. `window.requestAnimationFrame` と `performance.now` を元に戻し、`requestAnimationFrame(game_tick)` でループを再開する

状態・関数・`gl` へのアクセス方法は移行前後で異なる:

- **移行前**（旧構成、`<script>` タグの並列読み込み）: `game_running` / `entities` / `entity_player` / `gl` はいずれも top-level `var` で、classic script の実行モデル上すでに `window` のプロパティになっている。コンソールから素の識別子でそのまま読み書きできる
- **移行後**（ESM、Vite dev server）: 各モジュールはスコープを持つため素の識別子では読めないが、コードに手を入れる必要はない。Vite の開発サーバーが動いている状態で、ブラウザコンソールから `const { state } = await import('/source/state.ts')`、`const { game_tick } = await import('/source/game.ts')` のように動的 import すると、ページが実際に読み込んでいるのと同一のモジュールインスタンスが返る（ESM のモジュールキャッシュは URL 単位）。`gl` は `renderer.ts` が export していないため、`const { canvas } = await import('/source/dom.ts')` で `canvas` を取得し `canvas.getContext('webgl')` を呼ぶ（1 つの canvas は同じ型の WebGL コンテキストを 2 つ持てず、既存のコンテキストがそのまま返る）。ミニマップの `display` は `const { minimap_canvas } = await import('/source/dom.ts')` の後 `getComputedStyle(minimap_canvas).display` で読む。いずれの場合も**テスト用に `window` へ一時的に何かを生やす必要はない**

### 移動量のオフライン検証

上記の移動量（12.78 など）はブラウザなしでも検証できる。関与する物理は `entity.ts` の `_update()` の速度・位置更新式（`vx += ax*dt - vx*min(f*dt,1)`; `x += vx*dt`）そのもので、`dt = 1/60`、摩擦 `f = 5`（プレイヤーの `entity_t` コンストラクタ第 4 引数）、加速度 `ax = ±128`（`entity-player.ts` の `speed`）を単体で回すだけで再現できる。

```bash
node -e "
const dt = 1/60, f = 5, speed = 128;
let x = 0, vx = 0;
for (let i = 0; i < 30; i++) { vx += speed*dt - vx*Math.min(f*dt,1); x += vx*dt }  // キー押下
for (let i = 0; i < 60; i++) { vx += 0      - vx*Math.min(f*dt,1); x += vx*dt }    // 慣性を抜く
console.log(x.toFixed(2))  // 12.78
"
```

これが報告値 12.78 と一致することが、「30 tick 押下 + 60 tick 解放」という上記の再現手順が測定値を説明する唯一の経路であることの独立した証拠になる。ブラウザも WebGL も `performance.now` のスタブも要らないため、この数値の妥当性を疑うときはまずここで確認するのが最も速い。

## 非スコープ

- ローグライト化の機能実装（別設計書）
- `game.ts ⇄ entity-player.ts` の循環の解消
- 6 個の位置引数を取る entity コンストラクタの再設計
- `_` 接頭辞のリネーム
- minify されたバンドルサイズの最適化
