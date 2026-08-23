# アーキテクチャ

TypeScript + Vite + Vitest の ESM 構成。`index.html` が読み込むのは `source/main.ts` の 1 本だけで、依存関係はすべて import が表す。

## モジュール構成

- `state.ts` — 共有可変データ。**実行時 import を一切持たない**（`import type` のみ）
- `dom.ts` — `canvas` / `minimap_canvas` / `terminal_el` / `hero_el` / `sniff_el` / `bubble_el` の取得と型付けを集約。HUD のパネルは `hud.ts` が自前で組むためここには現れない
- `input.ts` — キー状態。「追跡対象のキーか」は `code in keys` で判定する
- `random.ts` — シード付き LCG。完全に決定論的で、手続き的生成の土台
- `level-generator.ts` — フロアの間取り生成。`random.ts` と `state.ts`（定数のみ）以外の実行時 import を持たない、葉に近いモジュール
- `sniff.ts` — 嗅覚の残り香探索。`level-generator.ts` の `bfs_distances` を自機タイル起点で呼ぶ純粋関数。ユークリッド角（`angle`）と経路の第一歩の方角（`path_angle`）を常に両方返し、段による選択は `minimap.ts` が行う。エンティティを知らないため、目標リストの組み立ては呼び出し側の責務
- `projection.ts` — ワールド座標→CSS ピクセル座標の変換。実行時 import を一切持たない、最も葉に近いモジュール。`renderer.ts` の GLSL 行列を JS 側に再現する（詳細は後述の「renderer.ts と projection.ts の定数複製」）
- `renderer.ts` — WebGL。`camera` オブジェクトを公開し、頂点カウンタは内部に隠蔽
- `entity.ts` — 基底クラス `entity_t`。サブクラスは `entity-*.ts`
- `entity-container.ts` — 押収品コンテナ
- `game.ts` — ゲームループとレベル遷移
- `death-screen.ts` — 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。スタイルは `death-screen.css` が持つ
- `death-screen-model.ts` — 死亡画面の表示ロジック（死因メッセージ、体調テキスト、生存時間の書式）。実行時 import は `nicotine.ts` のみで、Node でモックなしに評価できる
- `death-sequence-model.ts` — 死亡シーケンスの時間割（ビートの発火判定、死体とドローン光の高さ）。実行時 import を一切持たない、最も葉に近いモジュール
- `nicotine.ts` — ニコチンの数値ロジック。実行時 import を一切持たない、最も葉に近いモジュール
- `equipment.ts` — 装備の数値モデル（品名・効果の式・抽選・等級・ヤニ換算）。実行時 import を一切持たない葉モジュールで、画像も DOM も知らない
- `equip-screen.ts` — 押収品コンテナの開封ダイアログ。アイコン 30 枚の静的 import はここが持つ。スタイルは `equip-screen.css`
- `meta.ts` — ラン間で持ち越す恒久状態と強化テーブル、拾った装備の段。実行時 import は `equipment.ts`（同じく葉モジュール）のみで、Node でモックなしに評価できる
- `hud.ts` — ゲーム中の HUD（タバコ型のニコチンゲージ・HP・予備の一本・ミニマップの枠）。構造を起動時に 1 度だけ組み、`hud_update()` は値が変わったノードだけを書き換える。スタイルは `hud.css` が持ち、タバコは画像を使わず CSS だけで描く
- `hud-model.ts` — HUD の表示条件（何をいつ出して、いつ消すか）。実行時 import は `nicotine.ts` のみで、Node でモックなしに評価できる
- `monologue-model.ts` — 高木の内心の吹き出しのタイプライター状態機械とセリフ抽選。実行時 import を一切持たない、最も葉に近いモジュール
- `sonantx-reduced.js` — サードパーティ（後述）
- テストは `source/*.test.ts` に併置する。`test-setup.ts` は Vitest の `setupFiles`（後述の「テストと localStorage」）

## 共有可変状態の規則

ESM では import した束縛に代入できないため、規則は 1 つ:
**モジュール境界を越えて再代入される変数は、オブジェクトのプロパティにする。**

- ゲーム状態（`depth`, `nicotine`, `smoking`, `exit_open`, `descend_timer`, `kills`, `run_seed` など）→ `state.ts` の `state` オブジェクト
- カメラ（`x` / `y` / `z` / `shake`）→ `renderer.ts` の `camera` オブジェクト。所有者は renderer だが、追従とシェイクはゲームロジックなので game.ts が書く
- 再代入されない定数と、中身だけ書き換えるバッファ（`level_data` など）は通常の named export でよい
- 読み書きが 1 モジュールに閉じる変数（`time_last` など）はモジュールローカルにする

`num_verts` / `num_lights` / `level_num_verts` は renderer の内部実装。外部は
`renderer_reset_level_geometry()` / `renderer_freeze_level_geometry()` の 2 関数だけで操作する。

`state.entity_player` は `entity_player_t | null` だが、`game_tick` は `load_level` の代入後にしか走らないため、読み出し側は `!` を使い毎フレームの null チェックは入れない。WebGL の初期化 API（`getContext()` 等）の `| null` も同様に、失敗したらゲームが成立しないため初期化境界で `!` を使う。

## terminal の表示チェーンに副作用を載せない

`terminal.ts` の通知は 1 行ずつ `setTimeout` を繋ぐ表示チェーンで、その予約は `terminal_timeout_id` 1 本に集約される。`terminal_show_notice()` は冒頭で `terminal_cancel()` を呼ぶため、**新しい通知は先行する通知のチェーンを途中で丸ごと捨てる**。通知の出どころは複数モジュールに散っている（喫煙所、非常口、予備の一本、音声トグル、フロア到達）ので、いつ捨てられるかは呼び出し側から予測できない。

> **表示チェーンの完了に依存する副作用を作ってはならない。** ゲーム進行に必要な処理は `state` に予約し、`game_tick` に実行させる。

`terminal_show_notice()` は完了コールバックを受け取らず、代わりに表示にかかる秒数を返す。降下はこの秒数を `state.descend_timer` に積み、`game_tick` が `state.time_elapsed` で減らして 0 で `next_level()` を呼ぶ。この形は 2 つのことを同時に満たす: 走査中の `state.entities` を衝突ループの内側から差し替えないこと、そして演出中に別の通知が挟まっても降下が消えないこと。ラン終了中（`state.game_running` が 0）は予約を進めず、`load_level` が 0 に戻す。

例外は `main.ts` の起動シーケンス 1 つだけである。`terminal_write_line()` の完了コールバックに `renderer_init()` ・アトラス画像読み込み・`death_screen_show(null, run_start)` を載せており、チェーンの完了に依存したままになっている。ここが安全なのは、ラン開始前は通知の出どころが存在しないため（`audio_toggle()` の `terminal_show_notice()` 呼び出しは `state.game_running` でガードされている）で、割り込みでチェーンごと捨てられる心配がない。

表示の文体（1 行あたりの待ちと `> ` プレフィックスの有無）は表示チェーンの引数として引き回し、モジュール変数には置かない。早送り・プレフィックスなしで流すのはイントロのノイズ表示だけで、通常値に戻すのは後続のストーリー表示である。モジュール変数に持たせると、`terminal_cancel()` がノイズ表示のチェーンを途中で捨てたときに戻す側が永久に走らず、以後そのセッションのすべての通知が早送り・プレフィックスなしで表示されてしまう（クリックでイントロを飛ばすと実際に起きた）。引数にしておけば、チェーンごとの設定がチェーンの寿命を超えて残ることはない。

死亡画面（`death-screen.ts`）はこの制約の外にある。入力ハンドラを表示チェーンに載せるのではなく、`document` の `keydown` と各要素の `onclick` を自分で張り、表示に入る時点で逆にチェーンを打ち切って `terminal_clear()`（表示内容と `terminal_text_buffer` を対で戻す）を呼んでから隠す。ターミナルを使わない UI なので、入力の有効期間をチェーンの寿命に結び付ける必要がない。

## ターミナルのテキストに `_` を書かない

`terminal_prepare_text()` は `_` を改行 10 個に置き換える（`text.replace(/_/g, '\n'.repeat(10))`）。表示は 1 行ごとに待ちを挟むため、`_` 1 個が約 1 秒の間になる。**間を置きたい位置に `_` を書く**のが記法であり、文中の記号として `_` を使うと意図しない長い空白が入る。効くのはターミナルに流すテキストすべて（`terminal.ts` のイントロ・ストーリーと、`terminal_show_notice()` に渡す通知）で、通知の出どころは複数モジュールに散っているため、文言を足す側が守る規則になる。

## 循環参照の不変条件

実行時 import のグラフには 11 モジュール（entity-container, entity-exit, entity-health, entity-plasma, entity-player, entity-sentry, entity-smoking-area, entity-spider, entity-yani, game, minimap）からなる単一の循環クラスタが存在するが、これは**許容する**。クラスタ内の循環はすべてメソッド本体からの実行時参照であり、モジュール初期化時には評価されないため。

（`audio.ts` と `terminal.ts` も互いを import し合い、別に独立した 2 モジュールの循環を作っている。これも同じ理由で無害だが、どちらも `entity_t` のサブクラスを宣言しないため、上のクラスタや下の不変条件とは無関係。）

安全性を実際に支えている不変条件は次の 1 つ:

> **`entity.ts` は、`entity_t` のサブクラスを宣言するモジュールに（推移的にも）到達してはならない。**

`extends entity_t` はモジュール初期化時に評価されるため、これを破ると評価順によっては
`ReferenceError: Cannot access 'entity_t' before initialization` になる。**評価順依存なので、リロードによっては再現しないことがある**のがこのバグの厄介な点。たとえば `entity.ts` に `import { run_end } from './game'` を足すと、game → minimap → entity-exit 経由でサブクラス宣言に到達して壊れる。

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

画像 URL は `import atlas_url from '../m/q2.png'` のような**静的 import** で得る。`'m/' + id + '.webp'` のような文字列連結は Vite が静的に検出できず、本番ビルドで画像が `dist` に出力されずに 404 になる。レベルは `level-generator.ts` の手続き生成によるもので画像を使わないため、静的 import される画像はスプライトアトラス `m/q2.png` 1 枚と、死亡画面（`death-screen.ts`）が使う `m/ui/` 配下のイラスト・アイコン 14 枚、開封ダイアログ（`equip-screen.ts`）が使う装備アイコン 30 枚を合わせた 45 枚である（ゲーム中の HUD は画像を使わない）。`m/ui/` も同じ静的 import の規則に従う。`load_image()` は存在しない。

これに加えて、イントロの hero 画像（`m/hero.webp`）だけは静的 import ではなく、`index.html` の `<style>` 内の `url(m/hero.webp)` から参照する。Vite はインライン `<style>` も CSS として処理するため、この参照も静的 import と同様にビルドで解決される（ハッシュ付きで `dist/assets/` に出力され、`dist/index.html` がその URL を指す）。禁止されているのは Vite が静的に検出できない JS 側の文字列連結であって、`index.html` 内の静的な CSS 参照は使ってよい。ただし効くのは CSS として解釈される位置に限る。`m/` へのパスを `<style>` の外（属性値の文字列など）へ動かすと `dist` に出なくなる。

### 画像の形式

配信する画像 45 枚は WebP のロッシー圧縮（`quality=85`）で、変換は `tools/webp.py` が行う。ロッシーにするのは、イラスト 2 枚（`m/hero.webp` と `m/ui/hero.webp`）だけで 447KB と `dist`（約 1.2MB）の 4 割を占めるうえ、ロスレス WebP では PNG の 8 割程度にしか縮まないため。品質 85 は、劣化が最も出やすい `m/ui/hero.webp` の看板の日本語とラップトップの細い赤文字で原本と差が出ない下限である。表示サイズは `background-size: cover` でほぼ等倍になるので、寸法は縮小していない。

装備アイコン 30 枚（`m/ui/gear-*.webp`）は合計 571KB（1 枚あたり約 19KB）で、`dist` の 2 番目に大きい塊になる。**ネオンの発光をアルファ付きで持つ絵は、既存アイコン（2〜13KB）ほど WebP が縮まない。** 枚数を削らないのは、品ごとに絵が違うことが開封の報酬そのものだから（docs/equipment.md「画像」）。

変換元の PNG はリポジトリに残していない。イラストを差し替えるときは新しい PNG を `tools/webp.py` に通し、出力した WebP だけをコミットする。

スプライトアトラス `m/q2.png` だけは PNG のまま。WebGL のテクスチャとして最近傍サンプリングで引くためピクセル値が厳密に一致する必要があり、6KB しかないので変換しても削減幅が誤差である。

### アトラスの焼き込み

喫煙所まわりのタイル（33〜38）と押収品コンテナ（42）は `tools/atlas.py` が `m/q2.png` に焼き込む（`TILE_RANGE` は 33〜42）。番号が 33 から始まるのは 32 以下を既存のスプライトが使い切っているため（32 はセンチネル）。この番号は tool と `entity-smoking-area.ts` / `entity-smoke.ts` / `entity-sentry.ts`（コンテナの生成側）が共有する契約で、片方だけ動かすと別の絵が出る。焼き込みは元画像の左上ピクセルを背景キーとみなして近い色を透過に落とし、貼る前に貼り先を消すので、同じ入力なら何度流しても結果は同じ（冪等）。ブロックの面に使うタイルでも背景キーは効くため、四隅が透過して面取りされた輪郭になる。焼き込み元の画像はリポジトリに含めていないため、`m/q2.png` に焼き込み済みの 16×16 ピクセルが唯一の原本であり、この tool で今の絵を再生成することはできない。

## renderer.ts と projection.ts の定数複製

`projection.ts` は DOM の吹き出し（`monologue.ts`）をワールド座標に追従させるため、`renderer.ts` の頂点シェーダが使う view・projection 行列（`v` / `r`）と `renderer_end_frame()` が加える `cam` オフセット（`y - 10` / `z - 30`）を JS 側の関数として再現している。行列は GLSL 文字列リテラル内の `const mat4` であり JS から直接読めないため、共有定数への切り出しではなく複製という形になっている。この数値は `renderer.ts` と `projection.ts` が共有する契約で、片方だけ動かすと吹き出しが実際のカメラと違う位置に出る。

## 起動時の hero レイヤー

`index.html` の `#h` はイントロ用のフルスクリーン画像レイヤーで、`#c` の直後・`#a`（terminal）の直前に配置する。`z-index` は使わず、DOM 順（`#c` → `#h` → `#a`）だけで重なりを決めているため、この順序を変えると terminal の文字が hero の下に隠れる。`::after` の暗いグラデーション（スクリム）は terminal の文字を hero 画像の上でも視認できるようにするためのもの。アニメーションは 30 秒かけて `scale(1)` から `scale(1.06)` まで拡大する Ken Burns 効果のみで、他の演出は乗せない。

`hero_el`（`dom.ts`）はゲーム開始クリックで `opacity` を 1 秒かけてフェードアウトさせたあと `display:none` にする。この非表示はページの生存期間中ずっと有効で、死亡画面などで hero を再表示することはない。

## 音声の初回解錠

`audio.ts` はモジュール初期化時に `AudioContext` を生成する。これはユーザー操作より前なので、自動再生ポリシーの下では `suspended` で始まる。この状態は操作があっても自動では解除されず、ページ側がジェスチャのハンドラ内で `resume()` を呼ばなければならない。`main.ts` のゲーム開始クリック（ページで唯一の必須ジェスチャ）から `audio_unlock()` を呼ぶのがその一点で、ほかに解錠の経路はない。

`audio_unlock()` までは `audio_play()` は何も鳴らさない。`suspended` の AudioContext は時計が止まっているため、そのあいだに `start()` したソースはすべて同じ時刻に予約され、`resume()` した瞬間にまとめて鳴る。イントロのタイピング音は 100 行以上あるので、予約を許すとクリックの瞬間に轟音になる。BGM の開始も同じ理由で `audio_init()` のコールバックから `audio_unlock()` に移してある（`audio_init()` は生成した楽曲バッファを保持するだけ）。

解錠済みかどうかはモジュール変数のフラグで持つ。`audio_ctx.state` を見る形は使えない: Chrome では `resume()` の直後に同期で読んでもまだ `'suspended'` のままで（実機で確認済み）、`audio_unlock()` 自身が鳴らす BGM がそこで落ちる。

この結果、自動再生が許可されている環境（Media Engagement Index が高いなど）でもイントロは無音になる。クリックまで音が出ないのは docs/gameplay.md「操作」に書いたとおりの挙動であり、環境によって鳴る／鳴らないが変わらないほうが望ましい。

## ビルドとデプロイ

- `vite.config.ts` の `base: './'` は必須。GitHub Pages のプロジェクトページは `<user>.github.io/takagiaction/` 配下で配信されるため、絶対パスでは資産を解決できない
- リポジトリ設定の Pages → Source は「GitHub Actions」（`build_type: workflow`）でなければならない。`legacy` のままだと **CI が全ジョブ success を返したまま**未ビルドの `index.html` が直配信され、`/source/main.ts` が `video/mp2t` の MIME で返ってゲームが起動しない（実際に起きた）。デプロイの検証は CI の結果ではなく、公開 URL の `index.html` が `./assets/` のバンドルを参照していることの確認で行う
- 4096 バイト未満の画像は Vite の既定設定でデータ URI としてバンドルに埋め込まれ、それより大きいものだけが `dist/assets/` にハッシュ付きの別ファイルとして出る。`dist/assets/` に見当たらない画像は欠けているのではなくインライン化されている（死亡画面の小さいアイコンが該当する）

## テストと localStorage

Node の `globalThis.localStorage` は「`--localstorage-file` が無い」という ExperimentalWarning を出すゲッターで、**読むだけで発火する**。`typeof localStorage === 'undefined'` のガードもゲッターを呼ぶので警告は消せない（返る値は `undefined` でも警告は出る）。

そのため `meta.ts` 側は触らず、Vitest の `setupFiles`（`source/test-setup.ts`）でプロパティごと `delete` する。参照は `ReferenceError` になり、`meta.ts` の `try`/`catch` がそのまま拾って `persistent` が `false` になる（ゲッターが `undefined` を返していた従来と同じ結果）。ブラウザはこのファイルを読まないため、保存・読み込みの挙動は変わらない。

`--disable-warning=ExperimentalWarning` や `NODE_NO_WARNINGS` で黙らせる案は採らない。他の実験的機能の警告まで一律に消えるため。

## ブラウザでの動作検証

スクリーンショットでは判定できない。ヘッドレス環境では `document.visibilityState` が `'hidden'` になり rAF が絞られて画面がほぼ黒のまま、かつ `preserveDrawingBuffer: false` のため rAF の外から `readPixels` すると全ゼロが返る。どちらもゲームの不具合ではない。

検証手順の要点:

1. `game_tick` は `export` されていない（モジュールスコープの `function`）ため、外から直接は呼べない。rAF に渡されるコールバックを捕まえるのが唯一の入口: `window.requestAnimationFrame` を `(cb) => { window.__tick = cb; return 0 }` のようなスタブに置き換え、以降は `window.__tick()` を手動で呼んで 1 tick 進める（tick の末尾で `requestAnimationFrame(game_tick)` が呼ばれるたびに `window.__tick` は次のコールバックで上書きされるので、そのまま呼び続けられる）
2. `performance.now` を「呼ぶたびに `1000/60` ms 進む」スタブに置き換える（実時間で連打すると `time_elapsed` ≈ 0 になり物理が進まない）
3. スタブ導入直後に空打ちの tick を流し、`state.time_elapsed` が 1/60 に落ち着いてから本計測に入る（怠ると導入前の実時間が 1 tick に乗り、自機が画面外へ飛ぶ）
4. `readPixels` は tick を進めたのと**同一 JS ターン内**で呼ぶ
5. モジュールへのアクセスは Vite dev server 上でブラウザコンソールから `await import('/source/state.ts')` する。ESM のモジュールキャッシュは URL 単位なので、ページが読み込んでいるのと同一インスタンスが返る。`window` に何かを生やす必要はない
6. 入力は `keys[key_right] = 1` のように `input.ts` の `keys` を直接叩く

移動量など物理の数値は、`entity.ts` の `_update()` の更新式（`vx += ax*dt - vx*min(f*dt,1)`; `x += vx*dt`）を Node のワンライナーで単体再現すればブラウザなしで検証できる。
