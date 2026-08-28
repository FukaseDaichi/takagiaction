# OP 再設計: 予告編話法の 5 カット構成

状態: 体験設計（フェーズ構成）と素材計画は承認済み。実装構造は提案中。

## 目的

初回アクセスの OP の 3 つの不満 — 感情の起伏がない・視覚が単調・テンポが悪い — を解消し、
約 25 秒・常時スキップ可・「喫煙所だ。」の笑いで落ちる OP に置き換える。

## 決定事項

- **予告編話法の 5 カット + タイトルドロップ**。「やつら」の正体を最後まで名指しせず、
  4 枚目まで神格化しておいて 5 枚目で高木が落とす（スクリプトの正本は docs/story.md）
- **クリック先行**。音はブラウザの自動再生ポリシーで最初のクリック後にしか鳴らせないため、
  OP 本編をクリックの後に置き、全編を音付きで演出する（現行はイントロが実質無音で流れている）
- 尺は約 25 秒。全編クリック/キーで即スキップでき、スキップ先は自席の端末
- タイトル `TAKAGI ACTION` は起動画面に出さず、落ちの直後のタイトルドロップまで温存する
- 操作説明（WASD / スペース / M）は OP から外し、自席の端末に常設する
- 現行のターミナルログ式イントロ（クレジット 4 秒待ち・疑似スペック・NIC-0000 の生体ログ）は
  削除する。後方互換なし方針に従い、置き換えたら消す

## フェーズ表

**フェーズ 0: 起動画面（クリック待ち・無音）**
hero.webp + 原作クレジットの常設表示（UNDERRUN / DOMINIC SZABLEWSKI // PHOBOSLAB.ORG /
ANDREAS LÖSCH // NO-FATE.NET）+「クリックで起動」の明滅。タイトルロゴは出さない。
audio_init 完了までは「起動中...」を出し、完了後にクリック受付へ切り替える（現行の
ゲート順序を維持）。この間に OP 全素材（画像・動画）を先読みする。

クリック後の本編:

| # | 尺 | 字幕（語り） | 絵 | 音 |
| --- | --- | --- | --- | --- |
| 1 | 4s | 「西暦2718年。やつらは違法となった。」 | 夜の管理都市。監視ドローンの光条 | 深いブーム一発 → 低いドローン持続 |
| 2 | 4s | 「地上から、すべてのやつらが消えた。」 | 無機質な地上街。何かが撤去された跡だけが並ぶ（正体は見せない） | ブーム二発目。ドローンが半音上がる |
| 3 | 5s | 「しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。」 | 高木の後ろ姿が巨大閉鎖施設を見上げる | 鼓動のようなパルスが加わる |
| 4 | 5s | 「失われた人類の遺産。」「禁じられた聖域。」「最後の安息の地。」三連呼で 1 句ずつ | 地下深部。暗闇の降下口に一筋の光（宗教画の照明） | 句ごとにブームが強くなり最大音圧へ |
| 5 | 4s | 全音停止・黒 1 拍 → 高木「喫煙所だ。」 | みすぼらしい古い喫煙所（動画ループ: 蛍光灯明滅 + 漂う煙） | 静寂。表示と同時に安っぽい点灯音ひとつ |
| 6 | 3s | — | TAKAGI ACTION タイトルドロップ（動画ワンショット、黒背景） | スティング一発 |
| 完了 | — | 自席の端末（既存の死亡画面）へ | — | — |

落ちは二段: 言葉（三連呼 →「喫煙所だ。」）と絵（宗教画の光 → みすぼらしい実物）を
5 枚目で同時に決める。2 枚目の「撤去跡」は伏線で、4 枚目まで煙草・灰皿・喫煙所を画面に出さない。

## 声の設計

- カット 1〜4 の字幕は**語り**（映画予告編のナレーション）。OP 限定の第 3 の声で、
  画面中央にセリフ体（明朝系）で出し、ターミナルの等幅アンバーと視覚的に区別する
- カット 5 は**高木の声**。語りとも別のスタイル・色で「これは中の人」と分かる形にする
- story.md の「声の使い分け」に語りの行を追加済み

## 素材計画

| 素材 | ファイル（案） | 形式 | 用途 |
| --- | --- | --- | --- |
| カット 1: 管理都市 | m/op1.webp | 静止画 + CSS Ken Burns | 本編カット |
| カット 2: 撤去跡 | m/op2.webp | 静止画 + CSS Ken Burns | 本編カット |
| カット 3: 施設見上げ | m/op3.webp | 静止画 + CSS Ken Burns | 本編カット |
| カット 4: 地下の光 | m/op4.webp | 静止画 + CSS Ken Burns | 本編カット |
| カット 5: 喫煙所 | m/op5.mp4 + m/op5.webp | 動画（全画面シームレスループ 3〜4s）+ ポスター静止画 | 落ちの絵 |
| タイトルドロップ | m/title.mp4 + m/title.webp | 動画（全画面ワンショット 2.5〜3s、黒背景）+ 最終フレーム静止画 | タイトル |
| 起動画面 | m/hero.webp（既存） | 静止画 | フェーズ 0 |

動画の仕様:

- どちらも H.264 mp4（yuv420p）、16:9、1280×720、各 2〜3MB 以下、音なし、muted + playsinline
- カット 5 はシームレスループ（先頭と末尾のフレームが一致）。タイトルはワンショットで、
  最終フレームでロゴが静止した状態で終わる（pause してそのまま保持する）
- タイトル動画は背景が黒画面のシーンに全画面で置くため、透過（alpha）は不要
- 全動画にポスター静止画をセットで持ち、`prefers-reduced-motion` とロード失敗時は
  静止画へフォールバックする

## 技術制約

- 音・動画の再生開始はすべて最初のクリック後（自動再生ポリシー）
- OP 素材はフェーズ 0（クリック待ち）の間に先読みし、クリック後は待ちゼロで開始する
- `prefers-reduced-motion`: 赤フラッシュと Ken Burns を止め、カットは静止画の切替のみ。
  動画はポスターに差し替え、視覚演出に対応する JS の待ち時間も同じ設定で畳む
- スキップはどの時点でも即・自席の端末へ。タイマー・音・動画を単一のコントローラで
  まとめて停止できる構造にする

## 実装構造（提案中）

- **新設 `source/opening.ts` + `source/opening.css`**: フェーズ 0〜6 の進行を持つ。
  タイマー ID を 1 箇所に集約した単一タイムラインで、`opening_skip()` が全タイマー・
  音・動画を止めて即 `death_screen_show(null, run_start)` へ渡す
- **`source/opening-model.ts`（純ロジック）**: フェーズ遷移表・尺・reduced-motion 分岐を
  DOM なしで持ち、既存の `vi.mock('./dom')` 方式でテストする
- **main.ts**: クリック先行に再構成。audio_init 完了 → クリック受付 → audio_unlock →
  opening 開始。renderer/atlas の初期化は OP 再生と並行して進める
- **terminal.ts**: `terminal_run_intro` / `terminal_run_garbage` / `terminal_run_story` /
  タイトル・ノイズ・ストーリー文面を削除。ゲーム内通知（`terminal_show_notice` 系)は残す
- **index.html**: 起動画面（#h 流用 + クレジット・起動プロンプト）と OP 用コンテナを追加
- **death-screen**: 操作説明の常設表示を追加

## docs への反映

- docs/story.md: 「オープニングの基準文」を予告編話法の 5 枚スクリプトに差し替え、
  「声の使い分け」に語りを追加（本仕様と同時に更新済み。実装が追従するまで
  story.md がコードに先行する）

## 付録: 素材生成プロンプト

すべての静止画は hero.webp を画風参照として添付し、16:9・1920×1080 で生成する。
共通スタイル指定（各プロンプトの先頭に付ける）:

> Highly detailed hi-bit pixel art, dark dystopian retro-future, deep teal-green
> shadows with warm amber-orange artificial lights, subtle CRT scanline texture
> over the whole image, grimy industrial surfaces, cinematic composition, 16:9.
> Match the art style, palette and pixel density of the attached reference image.

### 静止画（本編カット 1〜4、Ken Burns 用）

カット 1（西暦2718年。やつらは違法となった。）:

> Vast megacity at night seen from a high vantage point, dense brutalist towers
> with tiny amber windows, low toxic haze between buildings, several patrol
> drones hovering and sweeping cold blue-white searchlight cones downward, giant
> red holographic prohibition signs (circle-with-slash, the inner icon blurred
> and indistinct) projected onto tower faces, no people, oppressive and orderly
> mood. Keep the center of the frame low-contrast so a subtitle can sit over it.
> No readable text anywhere.

カット 2（地上から、すべてのやつらが消えた。）:

> Sterile street-level walkway at dusk, a long grimy concrete wall with a row of
> conspicuously clean rectangular patches where wall-mounted fixtures were
> removed long ago — exposed bolt holes, faint outline stains, official hazard
> tape, small unreadable notice plates, one boxy maintenance robot rolling past,
> no people, melancholic emptiness. Do NOT show any cigarettes, ashtrays or
> smoking icons — what was removed must stay ambiguous. Keep the center of the
> frame low-contrast for a subtitle.

カット 3（しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。）:

> The same protagonist as in the reference image, seen from behind, small in the
> lower third of the frame: a middle-aged Japanese man with short messy black
> hair, rumpled dark suit jacket, loosened tie, hands in pockets, looking up at
> a colossal sealed industrial facility — a monolithic gate of rusted steel
> plates and hazard stripes, dead floodlights, a faint green emergency-exit glow
> high above, light drizzle catching the amber security lights, monumental scale
> gap between the tiny man and the gate. No readable text.

カット 4（失われた人類の遺産。禁じられた聖域。最後の安息の地。）:

> Deep underground vertical shaft interior with cathedral-like scale, one divine
> shaft of warm golden light falling from far above through dusty air onto a
> massive sealed vault door at the bottom, floating dust motes in the beam,
> pipes and catwalks dissolving into darkness at the edges, religious-painting
> solemnity, no people, no text.

### 動画生成に使う静止画（開始フレーム / ポスター兼フォールバック）

カット 5 ポスター（喫煙所）:

> Interior of a pitiful old smoking room, staged like a holy altar: yellowed
> cracked wall tiles, a single battered stainless standing ashtray in the exact
> center, a half-dead fluorescent tube on the ceiling, an old faded wall sign
> with a burning-cigarette pictogram (no readable text), thin haze, and one
> dramatic god-ray of golden light falling on the ashtray as if it were a sacred
> relic, dust motes in the beam, no people, static symmetrical altar-like
> composition. The comedy is the gap: divine lighting on a shabby mundane room.

タイトル最終フレーム:

> Game title logo on a pure black background (#000000): the words "TAKAGI
> ACTION" stacked in two lines, blocky chunky pixel font, glowing amber-orange
> phosphor color like an old CRT terminal, subtle scanlines and slight glow
> bleed, a single thin wisp of pixel-art cigarette smoke rising from the last
> letter, nothing else in frame, perfectly centered. The text must read exactly
> "TAKAGI ACTION".

### 動画生成用プロンプト

カット 5（image-to-video、開始フレーム = カット 5 ポスター、3〜4 秒・シームレスループ）:

> Static locked-off camera, no camera motion, no people. The half-dead
> fluorescent tube flickers irregularly (two or three quick stutters), a thin
> ribbon of smoke-like haze drifts slowly upward through the golden god-ray,
> dust motes float gently in the light. Everything else stays perfectly still.
> Seamless loop: the first and last frames must be identical. Keep the pixel-art
> texture crisp, no morphing, no new objects appearing.

タイトルドロップ（2.5〜3 秒・ワンショット、可能なら終端フレーム = タイトル最終フレームを指定）:

> Starts on a pure black screen. For the first moment only faint amber CRT
> scanline flickers are visible. Then pixel-art glitch bars and a quick burst of
> smoke sweep across the frame, and the amber pixel-font logo "TAKAGI ACTION"
> snaps into place with one hard glitch stutter. The glow stabilizes and the
> logo holds perfectly still for the final second. No camera motion, no other
> elements, pure black background throughout. The final frame must match the
> attached logo image exactly.
