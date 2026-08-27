# アーキテクチャ

TypeScript + Vite + Vitest の ESM 構成。`index.html` が読み込むのは `source/main.ts` の 1 本だけで、依存関係はすべて import が表す。

## モジュール構成

- `main.ts` — エントリポイント。起動シーケンス（イントロ → クリック → `renderer_init()` → アトラス読み込み → 死亡画面）を持つ唯一の場所
- `state.ts` — ラン中の共有可変データ
- `meta.ts` — ラン間で持ち越す恒久状態と強化テーブル、拾った装備の段
- `dom.ts` — `canvas` / `minimap_canvas` / `terminal_el` / `hero_el` / `sniff_el` / `bubble_el` / `fade_el` / `slash_el` / `flash_el` の取得と型付けを集約。HUD のパネルは `hud.ts` が自前で組むためここには現れない
- `input.ts` — キー状態。「追跡対象のキーか」は `code in keys` で判定する
- `random.ts` — シード付き LCG。完全に決定論的で、手続き的生成の土台
- `level-generator.ts` — フロアの間取り生成。実行時 import は `random.ts` と `state.ts`（定数のみ）だけ
- `sniff.ts` — 嗅覚の残り香探索。`level-generator.ts` の `bfs_distances` を自機タイル起点で呼ぶ純粋関数。最寄りの目標**タイル**（`x` / `z`）と BFS 距離（`dist`）を返す。返すのは距離を測るのに使った隣接床ではなく目標タイル自身で、これがエンティティのミニマップ座標（`x >> 3`, `z >> 3`）と一致するため、`minimap.ts` は添字の一致だけで「いま嗅いでいるのはどれか」を判定できる。エンティティを知らないため、目標リストの組み立ては呼び出し側の責務
- `projection.ts` — ワールド座標→CSS ピクセル座標の変換。`renderer.ts` の GLSL 行列を JS 側に再現する（詳細は後述の「renderer.ts と projection.ts の定数複製」）
- `renderer.ts` — WebGL。`camera` オブジェクトを公開し、頂点カウンタは内部に隠蔽
- `minimap.ts` — 霧つきミニマップ（1 タイル = 1 ピクセル）。嗅覚の目標リストを組み立てて `sniff.ts` に渡すのはここ
- `game.ts` — ゲームループとレベル遷移
- `entity.ts` — 基底クラス `entity_t`。サブクラスは `entity-*.ts` に 1 つずつ置く
- `entity-slash.ts` — 薙ぎの弧。`slash-model.ts` の形を `push_quad` で積むだけの、判定を持たない絵のエンティティ
- `slash-model.ts` — 薙ぎの弧のジオメトリ（掃引の進み具合と三日月の 4 隅）。3D の見た目を自動では確認できないため、形の性質はここでテストする
- `entity-boss.ts` — ボス（灰皿撤去ユニット）とその弾。当たり判定を `entity_t.w` で広げ、絵を `push_quad` で積む（後述の「スプライトの大きさと当たり判定」）
- `boss-model.ts` — ボスの数値と幾何（砲口の本数・耐久・フェーズ・周回の半径と速度・発射を刻む掃引角・追尾の旋回）。`slash-model.ts` と同じ流儀で、形の性質だけをここでテストする。当たり判定の一辺だけは `level-generator.test.ts` も読む（闘技場の柱の隙間を縛るため。docs/gameplay.md「ボス階」）
- `screen-slash.ts` — 一撃必殺の決めの閃光（`#sl` のクラス付け替え）。CSS は `index.html` が持つ
- `screen-flash.ts` — ボスのフェーズ移行の赤い全画面フラッシュ（`#bf` のクラス付け替え）。`screen-slash.ts` と同じ形だが別の層で、CSS も `index.html` が持つ。斜めの閃光帯（`#sl`）は「斬った」という意味を持つ絵なので流用しない
- `nicotine.ts` — ニコチンの数値ロジック（段階判定・減少速度・移動速度・射撃と薙ぎの間隔）
- `equipment.ts` — 装備の数値モデル（品名・効果の式・抽選・等級・ヤニ換算）。画像も DOM も知らない
- `equip-screen.ts` — 押収品コンテナの開封ダイアログ。アイコンは `gear-icons.ts` から読む。スタイルは `equip-screen.css`
- `gear-icons.ts` — 装備アイコン 30 枚の静的 import テーブル。`equip-screen.ts` と死亡画面の装備確認パネル（`death-screen.ts`）の両方が読む唯一の出どころ
- `boss-reward.ts` — ボス撃破の報酬ダイアログ（恒久強化 1 段の選択）。スタイルは `boss-reward.css`
- `boss-reward-model.ts` — ボス報酬の実効段（`meta.levels` ＋ このランで選んだ回数）と上限の判定
- `upgrade-rows.ts` — 恒久強化 6 行の表示定義（名前・アイコン・色・フレーバー・効果の書式）。死亡画面とボス報酬の両方が読む唯一の出どころ
- `hud.ts` — ゲーム中の HUD（タバコ型のニコチンゲージ・HP・予備の一本・武器スロット・ミニマップの枠・非常口の通過カウントダウン）。構造を起動時に 1 度だけ組み、`hud_update()` は値が変わったノードだけを書き換える。スタイルは `hud.css` が持ち、タバコもカウントダウンのリングも画像を使わず CSS だけで描く
- `hud-model.ts` — HUD の表示条件（何をいつ出して、いつ消すか）
- `death-screen.ts` — 死亡時のリザルトと闇サイト（恒久強化の購入）を統合した全画面 DOM UI。DOM は 1 度だけ組み、以降はキー入力のたびに class とテキストだけを書き換える。スタイルは `death-screen.css` が持つ
- `death-screen-model.ts` — 死亡画面の表示ロジック（死因メッセージ、生存時間の書式、状態機械、強調階層）
- `body-figure.ts` — 死亡画面が使う人体模型のジオメトリ（部位のアンカーとアイコン定位置、収納比率、装備アンカー、器官の SVG）
- `death-sequence-model.ts` — 死亡シーケンスの時間割（ビートの発火判定、死体とドローン光の高さ）
- `smoking-sequence-model.ts` — 一服演出の時間割（吸引中の煙、完了後の感知器と防災扉）
- `monologue.ts` — 高木の内心の吹き出しの DOM とセリフプール。位置は `projection.ts` で自機頭上に追従させる
- `monologue-model.ts` — 吹き出しのタイプライター状態機械とセリフ抽選
- `terminal.ts` — 施設端末の表示。表示チェーンの契約は後述
- `audio.ts` — `AudioContext` と再生。音色データは `sound-effects.ts`（効果音）と `music-dark-meat-beat.ts` / `music-boss.ts`（BGM 2 曲。後述の「BGM は 2 曲」）
- `sonantx-reduced.js` — サードパーティ（後述）
- テストは `source/*.test.ts` に併置する。`test-setup.ts` は Vitest の `setupFiles`（後述の「テストと localStorage」）

### 葉モジュールと Node で評価できるモジュール

似ているが別の 2 つの性質があり、モジュールを足すときはどちらに入れるかを先に決める。

- **実行時 import を持たない**（`import type` だけ）— `state` `dom` `nicotine` `equipment` `random` `projection` `slash-model` `boss-model` `body-figure` `death-screen-model` `death-sequence-model` `smoking-sequence-model` `monologue-model` `sound-effects` `music-dark-meat-beat` `music-boss`。後述の循環参照の起点になりえない
- **Node（Vitest）でモックなしに評価できる** — 上から `dom` を除いたものに、`meta`（→ `equipment`）・`level-generator`（→ `random` / `state`）・`sniff`（→ `level-generator`）・`boss-reward-model`（→ `meta`）・`hud-model` を加えたもの。条件は、モジュール初期化時に `document` / `canvas.getContext()` / `new AudioContext()` を触るモジュールへ（推移的にも）到達しないことで、破ると該当モジュールのテストが一斉にモック必須になる

`dom` が 1 つ目だけを満たすとおり、この 2 つは一致しない。数値・時間割・状態機械を DOM から切り離して `*-model.ts` に置いているのは、2 つ目を満たすためである。

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

`terminal_show_notice()` は完了コールバックを受け取らず、戻り値も持たない。降下は `state.descend_duration` を `state.descend_timer` に積み、`game_tick` が `state.time_elapsed` で減らして 0 で `next_level()` を呼ぶ。この形は 2 つのことを同時に満たす: 走査中の `state.entities` を衝突ループの内側から差し替えないこと、そして演出中に別の通知が挟まっても降下が消えないこと。ラン終了中（`state.game_running` が 0）は予約を進めず、`load_level` が 0 に戻す。

**予約する秒数を通知の表示時間から取らない。** 以前は `terminal_show_notice()` が「表示にかかる秒数」を返し、降下がそれをそのまま積んでいた。文体の都合で決まる値が降下の間合いを決めることになり、通知の文面を 1 行足すだけで降下が 1 秒延びる（docs/gameplay.md「非常口」）。

例外は `main.ts` の起動シーケンス 1 つだけである。`terminal_write_line()` の完了コールバックに `renderer_init()` ・アトラス画像読み込み・`death_screen_show(null, run_start)` を載せており、チェーンの完了に依存したままになっている。ここが安全なのは、ラン開始前は通知の出どころが存在しないため（`audio_toggle()` の `terminal_show_notice()` 呼び出しは `state.game_running` でガードされている）で、割り込みでチェーンごと捨てられる心配がない。

表示の文体（1 行あたりの待ちと `> ` プレフィックスの有無）は表示チェーンの引数として引き回し、モジュール変数には置かない。早送り・プレフィックスなしで流すのはイントロのノイズ表示だけで、通常値に戻すのは後続のストーリー表示である。モジュール変数に持たせると、`terminal_cancel()` がノイズ表示のチェーンを途中で捨てたときに戻す側が永久に走らず、以後そのセッションのすべての通知が早送り・プレフィックスなしで表示されてしまう（クリックでイントロを飛ばすと実際に起きた）。引数にしておけば、チェーンごとの設定がチェーンの寿命を超えて残ることはない。

死亡画面（`death-screen.ts`）はこの制約の外にある。入力ハンドラを表示チェーンに載せるのではなく、`document` の `keydown` と各要素の `onclick` を自分で張り、表示に入る時点で逆にチェーンを打ち切って `terminal_clear()`（表示内容と `terminal_text_buffer` を対で戻す）を呼んでから隠す。ターミナルを使わない UI なので、入力の有効期間をチェーンの寿命に結び付ける必要がない。

## ターミナルのテキストに `_` を書かない

`terminal_prepare_text()` は `_` を改行 10 個に置き換える（`text.replace(/_/g, '\n'.repeat(10))`）。表示は 1 行ごとに待ちを挟むため、`_` 1 個が約 1 秒の間になる。**間を置きたい位置に `_` を書く**のが記法であり、文中の記号として `_` を使うと意図しない長い空白が入る。効くのはターミナルに流すテキストすべて（`terminal.ts` のイントロ・ストーリーと、`terminal_show_notice()` に渡す通知）で、通知の出どころは複数モジュールに散っているため、文言を足す側が守る規則になる。

## 循環参照の不変条件

実行時 import のグラフには 8 モジュール（entity-boss, entity-container, entity-drone, entity-plasma, entity-player, entity-sentry, entity-spider, entity-yani）からなる単一の循環クラスタが存在するが、これは**許容する**。クラスタ内の循環はすべてメソッド本体からの実行時参照であり、モジュール初期化時には評価されないため。

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

## スプライトの大きさと当たり判定

`push_sprite()` のクアッドは 6 ワールド単位の固定サイズで、拡大を持たない。**それより大きいものを描く側は `push_quad()` を直に呼ぶ**（薙ぎの弧とボス）。`push_floor` / `push_block` / `push_sprite` はどれも `push_quad` の薄い包みで、4 隅の座標をそのまま取れるプリミティブはこれだけなので、これはレンダラの能力を増やしているのではなく既にある能力を使っているだけである。

当たり判定の一辺は `entity_t.w`（既定 9）で、衝突ループは `[x, x+w]` の AABB を x/z だけで比べる。**見た目の寸法と判定の寸法を別に持つのは、片方だけを動かす必要があるため** — 絵の大きさは遠近感のあるビュー行列に載って強さの説得力になるが、判定の一辺は「重なり」の意味（一服が外れる距離、コンテナを踏む距離、薙ぎの中心）に直結している。既定の 9 は全エンティティが共有し、上書きしているのはボスだけ（14）である。

ボスでは**絵・判定・銃口の中心を 1 点に揃え**、生成側がその 1 点を灰皿タイルの中心に置くためのオフセットを足す。判定の箱を絵からずらすと、輪郭に撃った弾がすり抜けて素の床で当たることになり、`w` を広げた意味が消える。中心が原点からずれるぶんは距離を測る側も揃える必要がある: 薙ぎの判定は**角ではなく中心同士**で測る。角の差は幅が違う相手では `(e.w - t.w)/2` だけ狂い、低い段の刃物では届かない方角が生まれる。

**弾はすべて `y = 0` を飛ぶ。** ビュー行列が 45° 傾いているので `y` は画面上で奥行きに化け、1 タイルぶん（8）上げると絵が 1 タイルずれる。判定は x/z だけなので、砲口の高さに弾を出すと絵と当たり判定が食い違う。高さを持つのは絵だけで（ボスは灰皿ブロックの上に立つぶん本体を上げる）、その定数は見た目専用である。

## エンティティループの 1 フレーム

`game_tick` の走査中に `state.entities` は伸びる。`_kill()` が新しいエンティティを生む経路があり（清掃ドローンのドロップ、破片、煙）、生成は `entity_t` の constructor が末尾に push する。外側・内側どちらのループも毎回 `entities.length` を読み直すので、**そのフレームで生まれたものは同じフレームのうちに更新・衝突判定・描画まで回る**。走査中に配列を差し替えないこと（`state.entities` への再代入は `load_level` だけが行い、降下は `descend_timer` 経由で遅らせる）がこの形の前提である。

死んだものが `state.entities` から消えるのはフレーム末尾（`entities_to_kill` のフィルタ）なので、上の 2 つが噛み合うと死体が自分のドロップに触れる。**衝突判定は `_dead` を両側で見て外す**。この判定はループ側に 1 か所だけ置く:

- 外側の `_dead` スキップだけでは足りない。撃破の処理が走るのは `e2._check(e1)` の側（弾が敵を殺す）なので、`e1` は自分の内側ループの最中に死ぬ
- エンティティ側の `_check` に `_dead` ガードを足して回る形は採らない。プレイヤーの死体の除外（`corpse`）と同じ理由で、同じ判定が実装の数だけ散る

同じ理由から、`_check` の中で相手の生死を見る必要はない。ペアの中では `e1._check(e2)` → `e2._check(e1)` の順に走るので、**前半で殺した相手に対して後半が走りうる**点だけがループの外にある（`_kill()` を副作用付きでオーバーライドしている側は `_dead` を自分で見る）。

## サードパーティ: sonantx-reduced.js

sonant-x の派生（zlib ライセンス）。意図的に `.js` のまま残し、型は手書きの
`sonantx-reduced.d.ts` が担う（`.d.ts` があれば TS は `.js` 本体を読まないため `allowJs` は不要）。原本からの変更は末尾の `export` 追加と `_math` → `Math` の置換のみ。**アルゴリズム・数値・ライセンスヘッダには触れない。**

音色データ（`sound-effects.ts` / `music-dark-meat-beat.ts` / `music-boss.ts`）は `SonantInstrument` インターフェースで型付けする。フィールド名の打ち間違いが無音で失敗するのを防ぐため。

## tsconfig の非自明な設定

- `noUncheckedIndexedAccess: false` — `level_data[i]` / `keys[key]` の添字アクセスが全域にあり、有効化すると全部 `| undefined` になって実害の割に読みにくい
- `types: []` — 指定しないと `node_modules/@types` を全自動 include する。将来 `@types/node` が紛れ込むと `setTimeout` の戻り値型が Node 版になり `terminal.ts` が壊れる
- `noImplicitOverride: true` — 基底側のメンバを消したとき `override` の付いた側が確実にエラーになる

## アセットの読み込み

画像 URL は `import atlas_url from '../m/q2.png'` のような**静的 import** で得る。`'m/' + id + '.webp'` のような文字列連結は Vite が静的に検出できず、本番ビルドで画像が `dist` に出力されずに 404 になる。レベルは `level-generator.ts` の手続き生成によるもので画像を使わないため、静的 import される画像はスプライトアトラス `m/q2.png` 1 枚と、死亡画面（`death-screen.ts`）が使う `m/ui/` 配下のイラスト・アイコン 14 枚、装備アイコン 30 枚（`gear-icons.ts` が静的 import を持ち、開封ダイアログと死亡画面の装備確認パネルへ配る）を合わせた 45 枚である（ゲーム中の HUD は画像を使わない）。`m/ui/` も同じ静的 import の規則に従う。`load_image()` は存在しない。

これに加えて、イントロの hero 画像（`m/hero.webp`）だけは静的 import ではなく、`index.html` の `<style>` 内の `url(m/hero.webp)` から参照する。Vite はインライン `<style>` も CSS として処理するため、この参照も静的 import と同様にビルドで解決される（ハッシュ付きで `dist/assets/` に出力され、`dist/index.html` がその URL を指す）。禁止されているのは Vite が静的に検出できない JS 側の文字列連結であって、`index.html` 内の静的な CSS 参照は使ってよい。ただし効くのは CSS として解釈される位置に限る。`m/` へのパスを `<style>` の外（属性値の文字列など）へ動かすと `dist` に出なくなる。

### 画像の形式

配信する画像 45 枚は WebP のロッシー圧縮（`quality=85`）で、変換は `tools/webp.py` が行う。ロッシーにするのは、イラスト 2 枚（`m/hero.webp` と `m/ui/hero.webp`）だけで 437KB と `dist`（約 1.2MB）の 4 割近くを占めるうえ、ロスレス WebP では PNG の 8 割程度にしか縮まないため。品質 85 は、劣化が最も出やすい `m/ui/hero.webp` の看板の日本語とラップトップの細い赤文字で原本と差が出ない下限である。表示サイズは `background-size: cover` でほぼ等倍になるので、寸法は縮小していない。

装備アイコン 30 枚（`m/ui/gear-*.webp`）は合計 571KB（1 枚あたり約 19KB）で、イラスト 2 枚（437KB）を抜いて `dist` で最も大きい塊になる。**ネオンの発光をアルファ付きで持つ絵は、既存アイコン（1〜14KB）ほど WebP が縮まない。** 枚数を削らないのは、品ごとに絵が違うことが開封の報酬そのものだから（docs/equipment.md「画像」）。

変換元の PNG はリポジトリに残していない。イラストを差し替えるときは新しい PNG を `tools/webp.py` に通し、出力した WebP だけをコミットする。

スプライトアトラス `m/q2.png` だけは PNG のまま。WebGL のテクスチャとして最近傍サンプリングで引くためピクセル値が厳密に一致する必要があり、6KB しかないので変換しても削減幅が誤差である。

### アトラスの焼き込み

喫煙所まわりのタイル（33〜38）と押収品コンテナ（42）は `tools/atlas.py` が `m/q2.png` に焼き込む（`TILE_RANGE` は 33〜46）。番号が 33 から始まるのは 32 以下を既存のスプライトが使い切っているため（32 はセンチネル）。この番号は tool と `entity-smoking-area.ts` / `entity-smoke.ts`、そしてコンテナを生成する 2 つ（`entity-sentry.ts` / `entity-boss.ts`）が共有する契約で、片方だけ動かすと別の絵が出る。焼き込みは元画像の左上ピクセルを背景キーとみなして近い色を透過に落とし、貼る前に貼り先を消すので、同じ入力なら何度流しても結果は同じ（冪等）。ブロックの面に使うタイルでも背景キーは効くため、四隅が透過して面取りされた輪郭になる。焼き込み元の画像はリポジトリに含めていないため、`m/q2.png` に焼き込み済みの 16×16 ピクセルが唯一の原本であり、この tool で今の絵を再生成することはできない。

薙ぎの帯（43・44）だけは別で、`tools/slash_tiles.py` が**元画像を取らずコードから生成する**。この 2 枚は絵ではなく「横方向に一様な帯」で、幅方向の色とディザ密度しか情報を持たないため、生成側が原本になる。したがってこの 2 枚は再生成できる。

非常口の標識（47）と床（48）は `tools/exit_tiles.py` が焼く。この 2 枚も `slash_tiles.py` と同じくコードが原本になる — 16×16 の 1 ピクセルごとの配置が「走る人と扉」という記号そのもので、大きい絵から縮小すると潰れて読めなくなるためである。したがってこの 2 枚は再生成できる。番号は tool と `entity-exit.ts`（標識）/ `game.ts`（床）が共有する契約である。緑の選び方は docs/gameplay.md「非常口」を参照。

ボス（45）は `tools/atlas.py` が画像から焼くタイルで、焼き込み元をリポジトリに含めないため `m/q2.png` が唯一の原本である。眼の 4 texel は敵の赤 `(255,66,0)` で、フラグメントシェーダの full-bright 規則のうち赤の 1 本を満たす。掃射の弾（46）と追尾弾（49）は `tools/boss_tiles.py` がコードから焼く単色の点で、外周と芯の 2 色を持つ — 46 は同じ敵の赤と橙、49 は水色の 2 段である。**4 色とも full-bright 規則から外れる色に変えてはならない** — ライトを積めない弾を等しい明るさで見せる唯一の経路である（docs/enemies.md「ボス（灰皿撤去ユニット）」）。弾種を色で見分けられることも要件なので、46 と 49 を同じ帯の色に寄せてもいけない。番号は tool と `game.ts`（本体の生成）/ `entity-boss.ts`（2 種の弾の生成）が共有する契約である。

### full-bright 規則は 2 本ある

フラグメントシェーダは、次のどちらかを満たす texel をライトも霧も通さずそのまま出す。

- 赤〜橙〜黄 — `t.r>0.95 && t.g>0.25 && t.b==0.0`（蜘蛛・セントリー・清掃ドローン・ボスの眼、喫煙所の標識、ボスの掃射）
- 水色 — `t.b>0.95 && t.g>0.25 && t.r==0.0`（ボスの追尾弾）

1 本目が `b==0.0` という厳密な等値を含むため、満たせる色域は 1 つの帯に縛られる。**別系統の色を full-bright にしたければ規則を増やすしかない** — 条件を緩めて 1 本に畳む形は採らない。緩めるほど、意図せず規則を満たす texel が既存のタイルから出る危険が増える。

**規則を足すときは、足す前にアトラスの全タイルを走査して、その規則を誤って満たす texel が 1 つもないことを確認する。** 誤爆は「特定のタイルの一部だけが霧を無視する」形で出るので、遊んで気づける保証がない。現行の 2 本については、`m/q2.png` の 64 タイルのうち上に挙げた絵以外にこの条件を満たす texel は無い。

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

## BGM は 2 曲

通常曲（`music-dark-meat-beat.ts`）とボス階専用（`music-boss.ts`）の 2 本を、それぞれ別の `AudioBuffer` として生成して持つ。BGM は効果音と別のチェーン（`music_source` → `music_gain` → `music_filter` → `audio_gain`）に載っており、レート・音量・ローパスを効果音と独立に動かせる。曲の差し替えはこのチェーンの入口（`music_source`）だけを付け替えて行う。

**2 曲のデータは共通化せず、独立した創作アセットとして持つ。** `music-boss.ts` が通常曲と同じ 6 楽器の構造を持っていても、配列や音色を共通の基底から導く形にはしない。片方の編曲がもう片方へ波及し、曲単体の調整ができなくなるためである。`audio-data.test.ts` はボス曲全体のハッシュを固定しており、意図して編曲したときだけ差分を確認してハッシュを更新する。

**生成順が契約である。通常曲だけが起動の臨界パスに載る。** `audio_init()` のコールバック（ゲーム開始のクリックハンドラを張る経路）は通常曲の完成で呼び、ボス曲の生成はその**あとから続けて**始める。2 曲を同時に走らせると、生成が `setTimeout` で刻まれる都合で 1 曲目の完成が遅れ、起動時間がそのぶん伸びる。最初のボス階（深度 5）に着くのは数分後なので実際に間に合わないことはないが、未生成なら通常曲のまま続ける分岐を 1 本持つ。

**同じ曲への切替は鳴らし直さない。** 今鳴っているバッファを覚えておき、一致したら何もしない。鳴らし直すとループの頭出しが起きて、フロアを跨ぐたびに曲が巻き戻る。差し替えるときだけ、ポップを避けるために音量を 0.25 秒でランプする。

| 契機 | 動作 |
| --- | --- |
| ボス階のロード | ボス曲へ差し替え |
| ボス階以外のロード | 通常曲へ差し替え（既に通常曲なら何もしない） |
| ボスのフェーズ移行 | `playbackRate` を 0.6 秒かけて 1.12 へ上げる |
| ボス撃破 | 通常曲へ差し替え |
| 自機の死 | テープストップ（レートとローパスを落として無音へ） |
| 次のラン開始 | 通常再生へ復帰 |

**復帰はバッファまで戻す。** レート・ローパス・音量だけを戻す形では、ボス階で死んだ次のランがボス曲で始まる。この 4 つは 1 つの関数（`audio_music_restore()`）が一緒に戻す責務を持ち、呼ぶのはラン開始の 1 か所だけである。

フェーズ 2 用に 3 曲目は作らない。曲データと生成コストが 1 本ぶん増えるのに対し、再生レートを上げるだけで「速くなった」は伝わる。レート操作は死亡のテープストップで既に使っている経路なので、新しい仕組みも要らない。

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
