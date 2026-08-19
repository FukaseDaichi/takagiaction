# アーキテクチャ

TypeScript + Vite + Vitest の ESM 構成。`index.html` が読み込むのは `source/main.ts` の 1 本だけで、依存関係はすべて import が表す。

## モジュール構成

- `state.ts` — 共有可変データ。**実行時 import を一切持たない**（`import type` のみ）
- `dom.ts` — `canvas` / `minimap_canvas` / `terminal_el` の取得と型付けを集約
- `input.ts` — キー状態。「追跡対象のキーか」は `code in keys` で判定する
- `random.ts` — シード付き LCG。完全に決定論的で、手続き的生成の土台
- `renderer.ts` — WebGL。`camera` オブジェクトを公開し、頂点カウンタは内部に隠蔽
- `entity.ts` — 基底クラス `entity_t`。サブクラスは `entity-*.ts`
- `game.ts` — ゲームループとレベル遷移
- `sonantx-reduced.js` — サードパーティ（後述）
- テストは `source/*.test.ts` に併置する

## 共有可変状態の規則

ESM では import した束縛に代入できないため、規則は 1 つ:
**モジュール境界を越えて再代入される変数は、オブジェクトのプロパティにする。**

- ゲーム状態（`time_elapsed`, `game_running`, `entities`, `entity_player` など）→ `state.ts` の `state` オブジェクト
- カメラ（`x` / `y` / `z` / `shake`）→ `renderer.ts` の `camera` オブジェクト。所有者は renderer だが、追従とシェイクはゲームロジックなので game.ts が書く
- 再代入されない定数と、中身だけ書き換えるバッファ（`level_data` など）は通常の named export でよい
- 読み書きが 1 モジュールに閉じる変数（`time_last` など）はモジュールローカルにする

`num_verts` / `num_lights` / `level_num_verts` は renderer の内部実装。外部は
`renderer_reset_level_geometry()` / `renderer_freeze_level_geometry()` の 2 関数だけで操作する。

`state.entity_player` は `entity_player_t | null` だが、`game_tick` は `load_level` の代入後にしか走らないため、読み出し側は `!` を使い毎フレームの null チェックは入れない。WebGL の初期化 API（`getContext()` 等）の `| null` も同様に、失敗したらゲームが成立しないため初期化境界で `!` を使う。

## 循環参照の不変条件

実行時 import のグラフには 11 モジュール（audio, entity-cpu, entity-health, entity-plasma, entity-player, entity-sentry, entity-spider, game, input, minimap, terminal）からなる単一の循環クラスタが存在するが、これは**許容する**。クラスタ内の循環はすべてメソッド本体からの実行時参照であり、モジュール初期化時には評価されないため。

安全性を実際に支えている不変条件は次の 1 つ:

> **`entity.ts` は、`entity_t` のサブクラスを宣言するモジュールに（推移的にも）到達してはならない。**

`extends entity_t` はモジュール初期化時に評価されるため、これを破ると評価順によっては
`ReferenceError: Cannot access 'entity_t' before initialization` になる。**評価順依存なので、リロードによっては再現しないことがある**のがこのバグの厄介な点。たとえば `entity.ts` に `import { terminal_show_notice } from './terminal'` を足すと、terminal → minimap → entity-cpu 経由でサブクラス宣言に到達して壊れる。

このために `spawn_particles()` は `entity.ts` のメソッドではなく `entity-particle.ts` の自由関数になっている。基底クラスに機能を足したくなったら、代わりにゲームループ側が検知する形にできないか先に検討する。

## entity クラスの型付け

- `_` 接頭辞は歴史的なもの（js13k 時代の mangle 対象マーカー）。リネームせず、可視性は `private` / `protected` / `public` 修飾子で表現する。TS では `private` メンバをサブクラスがオーバーライドできないため、オーバーライドされるもの（`_init`, `_kill`, `_did_collide` など）は `protected` 以上
- constructor と `_init()` の分離も歴史的経緯だが、サブクラス群が全面的に依存しているため構造として維持する
- `_init` の引数型は `number` 固定。`entity_t<TInit>` と型引数化する案は、`TInit` が引数位置にしか現れず TS の分散推論と衝突して `state.entities.push(this)` が TS2345 になるため**撤回済み**。同じ案を再提案しないこと。`number` 以外が必要になったときに広げる

## サードパーティ: sonantx-reduced.js

sonant-x の派生（zlib ライセンス）。意図的に `.js` のまま残し、型は手書きの
`sonantx-reduced.d.ts` が担う（`.d.ts` があれば TS は `.js` 本体を読まないため `allowJs` は不要）。原本からの変更は末尾の `export` 追加と `_math` → `Math` の置換のみ。**アルゴリズム・数値・ライセンスヘッダには触れない。**

音色データ（`sound-effects.ts` / `music-dark-meat-beat.ts`）は `SonantInstrument` インターフェースで型付けする。フィールド名の打ち間違いが無音で失敗するのを防ぐため。

## tsconfig の非自明な設定

- `noUncheckedIndexedAccess: false` — `level_data[i]` / `keys[key]` の添字アクセスが全域にあり、有効化すると全部 `| undefined` になって実害の割に読みにくい
- `types: []` — 指定しないと `node_modules/@types` を全自動 include する。将来 `@types/node` が紛れ込むと `setTimeout` の戻り値型が Node 版になり `terminal.ts` が壊れる
- `noImplicitOverride: true` — 基底側のメンバを消したとき `override` の付いた側が確実にエラーになる

## アセットの読み込み

画像 URL は `import atlas_url from '../m/q2.png'` のような**静的 import** で得る。`'m/' + id + '.png'` のような文字列連結は Vite が静的に検出できず、本番ビルドで画像が `dist` に出力されずに 404 になる。`load_image(url, callback)` は解決済み URL を受け取り、読み込んだ `HTMLImageElement` をコールバック引数で渡す（`this` には依存しない）。

## ビルドとデプロイ

- `vite.config.ts` の `base: './'` は必須。GitHub Pages のプロジェクトページは `<user>.github.io/takagiaction/` 配下で配信されるため、絶対パスでは資産を解決できない
- リポジトリ設定の Pages → Source は「GitHub Actions」（`build_type: workflow`）でなければならない。`legacy` のままだと **CI が全ジョブ success を返したまま**未ビルドの `index.html` が直配信され、`/source/main.ts` が `video/mp2t` の MIME で返ってゲームが起動しない（実際に起きた）。デプロイの検証は CI の結果ではなく、公開 URL の `index.html` が `./assets/` のバンドルを参照していることの確認で行う

## ブラウザでの動作検証

スクリーンショットでは判定できない。ヘッドレス環境では `document.visibilityState` が `'hidden'` になり rAF が絞られて画面がほぼ黒のまま、かつ `preserveDrawingBuffer: false` のため rAF の外から `readPixels` すると全ゼロが返る。どちらもゲームの不具合ではない。

検証手順の要点:

1. `window.requestAnimationFrame` を no-op に置き換え、`game_tick()` を手動で呼ぶ
2. `performance.now` を「呼ぶたびに `1000/60` ms 進む」スタブに置き換える（実時間で連打すると `time_elapsed` ≈ 0 になり物理が進まない）
3. スタブ導入直後に空打ちの tick を流し、`state.time_elapsed` が 1/60 に落ち着いてから本計測に入る（怠ると導入前の実時間が 1 tick に乗り、自機が画面外へ飛ぶ）
4. `readPixels` は tick を進めたのと**同一 JS ターン内**で呼ぶ
5. モジュールへのアクセスは Vite dev server 上でブラウザコンソールから `await import('/source/state.ts')` する。ESM のモジュールキャッシュは URL 単位なので、ページが読み込んでいるのと同一インスタンスが返る。`window` に何かを生やす必要はない
6. 入力は `keys[key_right] = 1` のように `input.ts` の `keys` を直接叩く

移動量など物理の数値は、`entity.ts` の `_update()` の更新式（`vx += ax*dt - vx*min(f*dt,1)`; `x += vx*dt`）を Node のワンライナーで単体再現すればブラウザなしで検証できる。
