# images.md — 画像生成 AI 向けプロンプト集

> **残っているのは押収品コンテナ 1 枚だけ。** 装備アイコン 30 枚（§3・§6〜§8）は納品済みで `m/ui/gear-*.webp` にある。押収品コンテナ（§4・§5）だけが未納で、アトラス `m/q2.png` のタイル 42 には暫定のプレースホルダが焼いてある。§5 のプロンプトで本物を作り、`tools/atlas.py` で焼き直せば差し替わる。**差し替えたらこのファイルごと削除してよい。**

装備システム（押収品コンテナ）に必要な画像 31 枚を、画像生成 AI に作らせるためのプロンプト集。内訳は**ゲーム内スプライト 1 枚**（押収品コンテナ）と**UI アイコン 30 枚**（装備 3 系統 × 10 段）。既存アセットと並べて表示されるため、絵柄の一致が最優先事項である。まず「共通スタイル指定」を読み、それを前置きしてから各品のプロンプトを 1 つずつ使うこと。

**使い方**: 「共通スタイル指定 A」（アイコン）または「共通スタイル指定 B」（ドット絵）の全文をプロンプトの冒頭に貼り、続けて作りたい品のプロンプトを 1 つ貼る。共通指定は 31 回とも同じものを使う。日本語が通らない生成 AI には、各節に併記した英語版を使う。

---

## 1. 納品物一覧

### 装備アイコン 30 枚 — 256×256 PNG（透過背景）→ `m/ui/`

| 系統 | ファイル名 |
| --- | --- |
| 刃物 | `m/ui/gear-blade-01.png` 〜 `gear-blade-10.png` |
| ソール | `m/ui/gear-sole-01.png` 〜 `gear-sole-10.png` |
| パッチ | `m/ui/gear-patch-01.png` 〜 `gear-patch-10.png` |

### 押収品コンテナ 1 枚 — 512×512 PNG（背景マゼンタ）

| 用途 | ファイル名 | 置き場所 |
| --- | --- | --- |
| スプライトアトラス `m/q2.png` のタイル 42 に焼き込む素材 | `container.png` | 任意の作業ディレクトリ（リポジトリには残らない） |

---

## 2. 世界観とトーン

（`docs/story.md` の要約）

西暦 2718 年、喫煙は法律で全面禁止された。愛煙家の**高木**は、閉鎖された巨大施設の地下に「まだ使える喫煙所が残っている」という噂を聞いて潜り込む。敵は施設を巡回する**禁煙監視ロボット**。通貨は**ヤニ**（吸い殻。禁制品として闇で価値を持つ）。高木は倒れると地上の自席に運び戻され、自席の端末から繋がる**愛煙家の闇サイト**で物資を買って、また地下へ向かう。

目的は世界を救うことでも施設の秘密を暴くことでもない。**ただ、一服したい。**

トーンは深刻なディストピアではなく、**本人だけは大真面目な SF コメディ**。世界の危機・陰謀・黒幕をほのめかす要素は絵にも入れない。

装備品はすべて、**施設が押収した禁制品**か**闇サイトの怪しい通販商品**である。笑いどころは**大仰な商品名と実物のみすぼらしさのギャップ**にあり、名前が強くなるほど実物も本当に強くなる、という一貫性で成立させる。低い段は本当にみすぼらしく、高い段は本当に立派に描く。

> Year 2718. Smoking is banned worldwide. Takagi, a die-hard smoker, sneaks into a sealed underground facility hunting for a smoking room that still works. Enemies are anti-smoking patrol robots; the currency is "yani" (cigarette butts, contraband). All equipment is either **contraband confiscated by the facility** or **sketchy mail-order goods from a smokers' black-market site**. Tone: deadpan sci-fi comedy — the hero takes it completely seriously, the world does not. No dystopian gloom, no conspiracy, no world-ending stakes.

---

## 3. 共通スタイル指定 A — 装備アイコン 30 枚

既存の `m/ui/icon-cig` / `icon-lung` / `icon-nose` / `icon-leg` / `icon-bullet` / `icon-brain` を実測して言語化したもの。**この 6 枚とまったく同じ絵柄でなければならない。**

```
【共通スタイル: 装備アイコン】

出力: 256×256 px の PNG。背景は完全な透明（アルファ 0）。被写体以外は何も置かない。

画風: ネオンサイン（発光するガラス管）で描いた線画。面を塗らない・陰影を付けない・
質感を描かない。輪郭線だけで対象を成立させる、一筆書きに近い簡潔な線画。

線: 太さの揃った管で描く。芯の太さは 256px 中 3〜8px。芯の中心は色相を保ったまま
白く飛び（例: 黄なら (255,202,65)、緑なら (148,255,133)）、その外側に芯の 2〜3 倍幅
（7〜26px）の柔らかいにじみ（ブルーム）が広がる。にじみの外は急速に減衰して透明になる。

色: 1 枚につき色相は 1 つだけ（等級色。下表）。火・光点・警告灯のような小さな
アクセントにだけ第 2 色を許し、面積は全体の 5% 未満に留める。

構図: 被写体は中央に 1 個だけ。各辺に 10〜30px の余白を取り、被写体が画面の 55〜90%
を占めるようにする。斜め 30〜45 度に傾けるか、真横・真正面に据えるかのどちらかで、
輪郭が一目で読める姿勢にする。

描かないもの: 文字・数字・ロゴ・ラベルの字面、枠・角丸の縁・台座・背景の装飾、
人物、影、地面、反射。等級を表す枠は CSS が描くのでアイコンには入れない。

避ける画風: 写真、3D レンダリング、セルアニメ塗り、水彩、アイソメトリックの
ゲームアイコン、ステッカー風の白フチ、グラデーションの面塗り。

表示サイズ: 死亡画面では 1 枚 54px 前後まで縮む。細部ではなく輪郭で品を見分けられること。
```

**Common style — equipment icons (English)**

```
Output a 256×256 px PNG with a fully transparent background; nothing but the subject.
Style: **neon-sign line art** — a glowing glass tube drawing. No fills, no shading, no material rendering; the object is defined by its outline alone, in a simple near-single-stroke drawing.
Stroke: uniform tube, core width 3–8 px at 256 px. The core blows out to near-white while keeping its hue; a soft bloom 2–3× the core width (7–26 px) spreads outside it, then falls off quickly to transparent.
Color: one hue per icon (the rarity color, see table). A tiny second-color accent (an ember, a lamp, a light point) is allowed at under 5% of the area.
Composition: a single subject, centered, 10–30 px margin on every side (subject fills 55–90% of the frame). Either tilt it 30–45° or show it dead-on / in strict profile — whichever reads instantly in silhouette.
Never draw: letters, numbers, logos, label text, frames, rounded borders, pedestals, background decoration, people, shadows, ground, reflections. Do not draw a rarity border — CSS draws it.
Avoid: photography, 3D renders, cel shading, watercolor, isometric game icons, sticker-style white outlines, gradient fills.
The icon is displayed at roughly 54 px, so it must be identifiable by silhouette, not detail.
```

### 等級ごとの描き分け

段が上がるほど、造形が凝り、素材が良くなり、光沢と発光が増す。色と管の扱いで読ませる。

| 等級 | 段 | 主調色 | 管と発光 | 造形 |
| --- | --- | --- | --- | --- |
| 並品 | 1–2 | `#8a8a8a` 灰 | 芯 3〜4px と細く、太さが不揃い。にじみは芯の 1.5 倍と弱い。管を 1 か所途切れさせてよい（点灯不良） | 既製品の流用・欠損・歪み。錆、折れ、テープ補修 |
| 上物 | 3–4 | `#3af08a` 緑 | 芯 4〜5px で均一。にじみは芯の 2 倍 | 業務用として整っている。部品が 1 つ増える |
| 特上 | 5–6 | `#3ac6f0` 青 | 芯 5〜6px。補助の細線が 1 本入る。にじみは芯の 2.5 倍 | 専用設計に見える。目盛り、留め具、二層構造 |
| 業物 | 7–8 | `#a86df0` 紫 | 主線 6px の二重管（外側の管の内側にもう 1 本細い管）。芯が白く飛ぶ | 機械的。ユニット、配線、インジケータが付く |
| 銘品 | 9–10 | `#f0c93a` 金 | 主線 6〜8px の多重管。にじみが広く、小さな光点をいくつか散らす | 儀礼品じみた装飾。左右対称、翼・環・フィンなどの造形 |

> Rarity ladder (English): **並品 Common** `#8a8a8a` grey — thin (3–4 px core), uneven, weak bloom (1.5×), one broken/unlit tube segment allowed; scavenged, chipped, taped, rusted. **上物 Fine** `#3af08a` green — even 4–5 px core, 2× bloom; a proper industrial-grade tool, one extra part. **特上 Superior** `#3ac6f0` blue — 5–6 px core plus one thin secondary line, 2.5× bloom; purpose-built, gauges, clasps, two-layer construction. **業物 Masterwork** `#a86df0` purple — 6 px double tube (a thinner tube nested inside the main one), blown-out white core; mechanical, units, wiring, indicator dots. **銘品 Legendary** `#f0c93a` gold — 6–8 px multi-tube, wide bloom, scattered small light points; ceremonial ornamentation, symmetry, wings/rings/fins.

### 既存アセットについての注記

- 既存の 6 枚は透過ではなく近黒 `#0b100c` のベタ塗りだが、表示先の行の背景も暗色（`rgba(8,22,14,.85)`）なので、透過でも見え方は揃う。透過を出せない生成 AI には背景 `#0b100c` の単色を指定してよい
- `m/ui/item-spare.webp` だけはローポリ 3D レンダリングの絵柄だが、**これは例外なので真似しない。** 死亡画面が実際に読み込んでいるのはネオンの 6 枚である

---

## 4. 共通スタイル指定 B — アトラスのドット絵

`m/q2.png` は 16×16 タイルが 64 個並んだ 1024×16 のスプライトアトラス。既存タイル全体で色数は 20 色しかなく、小物タイル 6 枚（灰皿・貼り紙・標識）に至っては 13 色である。この密度に合わせる。

```
【共通スタイル: ドット絵スプライト】

出力: 512×512 px の PNG。ただし実効解像度は 16×16。1 論理ピクセル = 32×32 px の
単色ベタで塗り、32px グリッドに厳密に揃える。

アンチエイリアス・ぼかし・グラデーション・写真的テクスチャを一切使わない。
ツールが BOX 平均で 16×16 に縮小するため、グリッドからずれると縁に半端な色が出る。

背景: マゼンタ #FF00FF のベタ塗り。左上 (0,0) のピクセル色が透過キーになる。
絵の中にマゼンタ・ピンク・明るい紫を使わない（キーとのチャンネル差の合計が 90 以下の
色は透過に落ちて穴が開く）。

パレット: 20 色以下。次の 13 色から選ぶと既存タイルに最もよく馴染む。
  影・輪郭 #0f0a06 / 暗茶 #251b14 / 中茶 #382e22 / 錆 #4f2c13 / 明錆 #774e27 /
  暗鋼 #535048 / 中鋼 #6a5f53 / 明鋼 #7b736b / 生成り #fcfadf /
  看板青 #00457f・#0069af / 警告橙 #ff4200 / 淡緑灰 #7b9384

陰影: 光源は上。上面と上辺を明るい鋼、正面を中鋼、接地側を暗茶〜影色で締める。
専用の黒い輪郭線は引かず、暗い面で輪郭を作る。面はベタ基調で、1 ピクセル単位の
ハイライトだけを置く。ディザを散らさない。

視点: 真正面（ごくわずかに上から）。カメラを向くビルボードとして 3D 空間に立つので、
床との接地線が画像の最下段に来るように置く。

16×16 に縮小されても形が読めること。細部より、輪郭で何かが分かることを優先する。
```

**Common style — pixel-art sprite (English)**

```
Output a 512×512 px PNG whose **effective resolution is 16×16**: every logical pixel is a flat 32×32 px block, snapped exactly to a 32 px grid. No anti-aliasing, no blur, no gradients, no photographic texture — the file is BOX-downscaled to 16×16, so anything off-grid turns to mush at the edges.
Background: solid magenta `#FF00FF`. The top-left pixel is the transparency key, so use no magenta, pink, or bright purple anywhere in the artwork.
Palette: 20 colors max. Best match to the existing tiles: `#0f0a06` shadow/outline, `#251b14` dark brown, `#382e22` mid brown, `#4f2c13` rust, `#774e27` light rust, `#535048` dark steel, `#6a5f53` mid steel, `#7b736b` light steel, `#fcfadf` off-white, `#00457f`/`#0069af` signage blue, `#ff4200` warning orange, `#7b9384` pale green-grey.
Lighting from above: bright steel on top faces and upper edges, mid steel on the front, dark brown to shadow at the base. No dedicated black outline — let dark faces form the contour. Flat fills with single-pixel highlights; no dithering.
View: straight-on front elevation, very slightly from above (it is a camera-facing billboard standing in a 3D world), with the floor contact line on the very bottom row.
It must stay readable as a silhouette once shrunk to 16×16.
```

---

## 5. 押収品コンテナ — `container.png`

共通スタイル B を前置きして使う。

```
禁煙監視ロボットが施設内で押収した禁制品を封入する、腰の高さの金属コンテナ。
角の張った箱で、幅は高さよりやや広い。上面がわずかに見える程度の、ほぼ真正面の視点。

正面の中央やや上に封印灯が 1 つだけ点いている。1〜2 ピクセルの小さな灯で、色は
生成り #fcfadf。封印灯には絶対に色を付けない（実行時にレア度に応じた色のライトを
重ねるため、絵に色があると混ざる）。

正面の中ほどに封印の合わせ目が横一本入り、その両端に暗い留め具が 1 つずつ。四隅は
補強の当て金で明るい鋼 #7b736b、正面の面は中鋼 #6a5f53、下端 1〜2 ピクセルは影色
#0f0a06 で床に接地させる。使い込まれた官給品らしく、面のどこかに錆 #4f2c13 を
2〜3 ピクセルだけ乗せる。

配置: 箱は 16×16 のうち下 12〜13 行・中央 12〜14 列を占め、最下行が床。上の 3〜4 行と
左右の余りはマゼンタのまま空ける。

既存タイルの樽（円筒）や貼り紙（薄い板）と輪郭で区別が付くよう、角のある箱の
シルエットを保つこと。
```

```
A waist-high metal container used by anti-smoking patrol robots to seal away confiscated contraband. A hard-cornered crate, slightly wider than it is tall, seen almost straight on with just a sliver of the top face visible.
A **single seal lamp** sits slightly above center on the front face: a 1–2 pixel light in off-white `#fcfadf`. **The lamp must stay white/achromatic** — a colored light is composited over it at runtime to signal rarity, so any color painted in will contaminate it.
A horizontal seam runs across the middle of the front face with one dark latch at each end. Corner reinforcement plates in light steel `#7b736b`, front face in mid steel `#6a5f53`, and the bottom 1–2 pixels in shadow `#0f0a06` to plant it on the floor. Add 2–3 pixels of rust `#4f2c13` somewhere on the face — this is well-used government-issue equipment.
Layout: the crate occupies the bottom 12–13 of the 16 rows and the center 12–14 of the 16 columns, with its base on the very bottom row. Leave the top 3–4 rows and the side margins as flat magenta.
Keep a boxy, hard-cornered silhouette so it never reads like the existing barrel (a cylinder) or notice board (a flat panel).
```

---

## 6. 刃物（blade）— 近接武器 10 枚

共通スタイル A を前置きして使う。系統の軸は**ヤニ落とし**（喫煙具に付いたヤニ＝タールをこそげ落とす、細長いヘラ状の道具）で、この世界では武器に転用されている。

### 刃物 1 — 錆びたカッター（並品 / 灰 `#8a8a8a`）
`gear-blade-01.png`

```
事務用の折る刃式カッターナイフ。刃は 1 段だけ出ている。斜め 40 度に傾けて置く。
刃の縁は 2 か所欠け、柄の管は中ほどで一度途切れている（点灯不良）。全体に線が歪み、
安っぽく頼りない。主調色は灰 #8a8a8a。刃先にだけ錆の橙 #c0632a を 1 点、小さく。
```

```
A cheap office snap-off box cutter, blade extended by a single segment, tilted about 40°.
Two chips missing from the cutting edge; the tube of the handle is broken in one place as
if the neon has failed. Wobbly, flimsy linework. Main hue grey #8a8a8a, with one tiny
rust-orange #c0632a point at the blade tip.
```

### 刃物 2 — 折れたヤニ落とし（並品 / 灰 `#8a8a8a`）
`gear-blade-02.png`

```
細長いヘラ状の掃除道具「ヤニ落とし」。先端が斜めにぽっきり折れて欠けている。
持ち手には補修のテープが 3〜4 巻き（管を横切る短い線を数本）。垂直よりやや傾けて置く。
線は細く不揃いで、下側の管が 1 か所消えている。主調色は灰 #8a8a8a。アクセントなし。
```

```
A long, narrow tar-scraper spatula ("yani-otoshi") used to scrape tar off smoking gear.
The tip is snapped off at an angle, leaving a jagged stub. The grip is patched with 3–4
wraps of tape, drawn as short lines crossing the tube. Stand it slightly off vertical.
Thin, uneven strokes with one unlit gap in the lower tube. Main hue grey #8a8a8a, no accent.
```

### 刃物 3 — 換気ダクト用スクレーパー（上物 / 緑 `#3af08a`）
`gear-blade-03.png`

```
幅広の四角い刃を持つ、長柄の業務用スクレーパー。ダクト内のヤニをこそげ落とす道具。
刃面には、こそげた跡の縦筋が 3 本。柄の尻に吊り下げ用の丸穴が 1 つ。斜め 35 度。
線は均一で、道具として真っ当に整っている。主調色は緑 #3af08a。アクセントなし。
```

```
A long-handled industrial scraper with a wide rectangular blade, made for scraping tar out
of ventilation ducts. Three vertical scrape marks across the blade face; one round hanging
hole at the butt of the handle. Tilted about 35°. Clean, even strokes — an honest working
tool. Main hue green #3af08a, no accent.
```

### 刃物 4 — 業務用 灰かき棒〈研磨済〉（上物 / 緑 `#3af08a`）
`gear-blade-04.png`

```
先端が L 字に曲がった長い鉄棒（灰をかき出す火かき棒）。研磨済みなので、棒の上辺に
沿って短い平行線が 2〜3 本（光沢の表現）。手元側にはローレット加工を示す細かい刻みが
5〜6 本。斜め 45 度。主調色は緑 #3af08a。アクセントなし。
```

```
A long iron ash-rake: a straight shaft with an L-shaped hook at the tip. It has been
polished, so 2–3 short parallel highlight lines run along the upper edge of the shaft.
Near the grip, 5–6 fine knurling notches. Tilted 45°. Main hue green #3af08a, no accent.
```

### 刃物 5 — 【訳あり】禁制品解体ナイフ（特上 / 青 `#3ac6f0`）
`gear-blade-05.png`

```
押収品を切り開くための、無骨で武骨な直刃ナイフ。刃元に鋸歯（セレーション）が 4 山。
鍔と柄の境に丸い留め具。柄尻の穴には封印用の紐が結ばれていたが、それが切られて
2 本の短い端が垂れている（＝「訳あり」）。斜め 40 度。刃の峰に沿って補助の細線が
1 本走る。主調色は青 #3ac6f0。アクセントなし。
```

```
A blunt, utilitarian straight-bladed knife for cutting open confiscated goods. Four
serration teeth near the ricasso; a round rivet where the guard meets the grip. A seal cord
was once tied through the hole in the pommel — it has been cut, leaving two short dangling
ends (this is the "damaged goods" joke). Tilted 40°. One thin secondary line runs along the
spine of the blade. Main hue blue #3ac6f0, no accent.
```

### 刃物 6 — 旧世紀製 葉巻カッター（特上 / 青 `#3ac6f0`）
`gear-blade-06.png`

```
ギロチン式の葉巻カッター。中央に葉巻を通す円い穴があり、その両脇から 2 枚の半月刃が
噛み合う。骨董品らしく、外周に装飾的な縁飾りが施されている（波打つ細線 1 周）。
ほぼ真正面から、わずかに傾けて置く。主調色は青 #3ac6f0。アクセントなし。
```

```
A guillotine cigar cutter: a round hole in the center for the cigar, with two crescent
blades closing in from either side. Being an antique from the old century, its outer rim
carries a decorative scalloped border (one wavy thin line around the perimeter). Shown
nearly head-on, tilted a few degrees. Main hue blue #3ac6f0, no accent.
```

### 刃物 7 — 【業物】ヤニ落とし・改（業物 / 紫 `#a86df0`）
`gear-blade-07.png`

```
2 段目のヘラ（ヤニ落とし）を改造した一本。ヘラの輪郭は保ったまま、柄に外付けの
制御ユニットとトグルスイッチが 1 つ、そこから刃元へ配線が 2 本這う。刃の背側に
補助ブレードがもう 1 枚重なる。斜め 40 度。管は二重（主線の内側にもう 1 本細い管）で、
芯が白く飛ぶ。主調色は紫 #a86df0。アクセントなし。
```

```
The tar-scraper spatula from tier 2, heavily modified. The spatula outline is preserved,
but the handle now carries a bolted-on control unit with a toggle switch, and two wires run
from it down to the blade. A second auxiliary blade is stacked along the spine. Tilted 40°.
Double tube (a thinner tube nested inside the main stroke) with a blown-out white core.
Main hue purple #a86df0, no accent.
```

### 刃物 8 — 【業物】単分子ヤニ落とし MK-II（業物 / 紫 `#a86df0`）
`gear-blade-08.png`

```
ヘラ（ヤニ落とし）の形を保った、精密機械めいた一本。刃の縁だけが厚みのない極細の
一本線になっており（単分子刃）、その線だけが際立って白く強く光る。柄には円筒形の
エネルギーセルが 1 個はまり、その脇にインジケータの点が 3 つ縦に並ぶ。斜め 40 度。
管は二重。主調色は紫 #a86df0。アクセントなし。
```

```
A precision-engineered version of the tar-scraper spatula. Its silhouette is unchanged, but
the cutting edge is a single hairline with no thickness (a monomolecular edge) that glows
noticeably brighter and whiter than the rest. A cylindrical energy cell is seated in the
handle, with three indicator dots stacked beside it. Tilted 40°. Double tube.
Main hue purple #a86df0, no accent.
```

### 刃物 9 — 【銘品】監視ロボ解体用 大鉈（銘品 / 金 `#f0c93a`）
`gear-blade-09.png`

```
監視ロボットを解体するための、幅広で重い大鉈。刃はどっしりと広く、峰側には解体用の
鉤（フック）が 3 山。柄は長く、柄尻に房飾りが下がる。鍔に小さな円環が 1 つ。
斜め 40 度に構えて置く。管は多重で、にじみが広い。刃の周囲に小さな光点を 4 つ散らす。
主調色は金 #f0c93a。アクセントなし。
```

```
A broad, heavy cleaver built for dismantling patrol robots. The blade is wide and weighty;
three breaching hooks run along its spine. Long handle with a tassel hanging from the
pommel, and a small ring on the guard. Posed at 40°. Multi-tube strokes with a wide bloom,
and four small light points scattered around the blade. Main hue gold #f0c93a, no accent.
```

### 刃物 10 — 【銘品】FINAL DRAG（銘品 / 金 `#f0c93a`）
`gear-blade-10.png`

```
系統の到達点。細長いヤニ落としの造形を保ちながら、刃の輪郭が煙草のシルエットと
重なっている一本。刃先に火の点、柄の側にはフィルタを示す細かい網目が 4〜5 マス。
背後に左右対称の光条が 4 本まっすぐ伸びる。垂直よりわずかに傾けて置く。
管は多重で最も太く、にじみが最も広い。小さな光点を 6 つ散らす。
主調色は金 #f0c93a。刃先の火の点にだけ橙 #ff6a1e を小さく 1 点。
```

```
The pinnacle of the line: it keeps the long, narrow tar-scraper form, but its outline now
doubles as the silhouette of a cigarette — an ember point at the tip and a 4–5 cell filter
mesh pattern toward the grip. Four symmetrical light rays radiate straight out behind it.
Stand it slightly off vertical. The thickest multi-tube strokes and the widest bloom in the
set, with six small light points scattered around. Main hue gold #f0c93a, plus one tiny
orange #ff6a1e ember point at the tip.
```

---

## 7. ソール（sole）— 移動速度を上げる靴 10 枚

共通スタイル A を前置きして使う。

### ソール 1 — 片方だけの安全靴（並品 / 灰 `#8a8a8a`）
`gear-sole-01.png`

```
つま先に鉄芯の入った作業用安全靴が、片方だけ 1 足。真横から見た姿。靴紐が途中で
切れて 2 本だらりと垂れ、踵は斜めにすり減っている。つま先の鉄芯部分に、線が 1 本
横切って芯の位置を示す。線は細く不揃いで、靴底の管が 1 か所途切れている。
主調色は灰 #8a8a8a。アクセントなし。
```

```
A single steel-toed work boot — just the one, no pair. Strict side profile. One lace has
snapped, leaving two ends dangling; the heel is worn down at an angle. A line crosses the
toe to indicate the steel cap. Thin, uneven strokes with one unlit gap in the sole tube.
Main hue grey #8a8a8a, no accent.
```

### ソール 2 — 廃品回収業者のサンダル（並品 / 灰 `#8a8a8a`）
`gear-sole-02.png`

```
平べったいゴムサンダル。真横よりやや斜め上から。鼻緒が一度切れており、針金を
ぐるぐる巻いて留め直してある（結び目に短い線を 3 本）。ソールは薄く、底面に
すり減った波形の溝が 3 本だけ残る。全体に安っぽく、線が歪んでいる。
主調色は灰 #8a8a8a。アクセントなし。
```

```
A flat rubber sandal, seen from a slightly raised three-quarter angle. The thong strap
snapped once and has been lashed back together with wire (three short lines at the knot).
The sole is thin, with only three worn wavy tread grooves left on the bottom. Cheap and
wobbly throughout. Main hue grey #8a8a8a, no accent.
```

### ソール 3 — 静音ソール〈中古〉（上物 / 緑 `#3af08a`）
`gear-sole-03.png`

```
靴ではなく、靴底だけの製品。真横からの姿。厚い吸音層の断面に、小さな丸い空孔が
6〜8 個一列に並ぶ。中古なので踵側が片減りして薄くなっている。上面の縁に沿って
補助の細線が 1 本。線は均一で製品としては整っている。主調色は緑 #3af08a。
アクセントなし。
```

```
Not a shoe — a replacement sole unit on its own, in side profile. A row of 6–8 small round
cavities runs through the thick sound-damping layer. It is second-hand, so the heel end is
worn thinner than the toe. One thin secondary line follows the upper edge. Even, tidy
strokes. Main hue green #3af08a, no accent.
```

### ソール 4 — 配管工の作業靴（上物 / 緑 `#3af08a`）
`gear-sole-04.png`

```
足首まである、ゴム長靴風の作業靴。真横からやや斜めに。甲に金具のバックルが 1 つ、
靴底には深い滑り止めの溝が 5 本。爪先と踵に補強の当てが入る。全体にがっしりと
した実用品。線は均一。主調色は緑 #3af08a。アクセントなし。
```

```
An ankle-high rubber work boot of the kind a facility plumber wears, seen from a slight
three-quarter side view. One metal buckle across the instep; five deep anti-slip grooves in
the sole; reinforcement caps at toe and heel. Sturdy and practical throughout. Even strokes.
Main hue green #3af08a, no accent.
```

### ソール 5 — 【訳あり】巡回員用 高速ソール（特上 / 青 `#3ac6f0`）
`gear-sole-05.png`

```
施設の巡回員に官給される高速移動用ソール。真横から。踵に小型のローラーが 2 個、
側面には規格プレートの四角い枠が 1 つ（中の文字は描かない）。「訳あり」なので、
所属マークがあった位置が四角く切り取られ、その部分だけ管が破線になっている。
上面の縁に補助の細線が 1 本。主調色は青 #3ac6f0。アクセントなし。
```

```
A high-speed sole issued to facility patrol staff, in side profile. Two small rollers at the
heel; on the flank, one rectangular spec-plate outline (draw no text inside it). Being
"damaged goods", the square where the unit insignia used to be has been cut away, and the
tube along that patch is drawn as a dashed line. One thin secondary line along the top edge.
Main hue blue #3ac6f0, no accent.
```

### ソール 6 — 反重力インソール〈体験版〉（特上 / 青 `#3ac6f0`）
`gear-sole-06.png`

```
靴の中に敷く中敷き（インソール）1 枚だけ。斜め上から見た、足形の平たい板。
うっすら宙に浮いており、真下に浮遊を示す短い横線が 3 本（下ほど短くする）。
「体験版」なので、輪郭の後ろ半分だけが破線（点灯の抜けた管）になっている。
表面に細かい格子の目が 3×5 ほど。主調色は青 #3ac6f0。アクセントなし。
```

```
A single insole — a flat, foot-shaped plate seen from a raised three-quarter angle. It
hovers slightly, with three short horizontal levitation lines directly beneath it (shorter
as they go down). Because it is a "trial version", the rear half of its outline is drawn as
a dashed tube, as if that section never lights up. A fine 3×5 grid pattern on its surface.
Main hue blue #3ac6f0, no accent.
```

### ソール 7 — 【業物】密輸業者のブーツ（業物 / 紫 `#a86df0`）
`gear-sole-07.png`

```
踝の高い、しっかりしたブーツ。真横から。ヒール部分に隠し収納があり、小さな扉が
開いて中から煙草が 1 本のぞいている。甲には留め具が 3 つ縦に並び、靴底には
細かい溝。管は二重（主線の内側にもう 1 本細い管）で、芯が白く飛ぶ。
主調色は紫 #a86df0。のぞく煙草の火口にだけ橙 #ff6a1e を 1 点、小さく。
```

```
A solid, ankle-high boot in side profile. A hidden compartment in the heel stands open, one
cigarette peeking out of it. Three clasps stacked up the instep; fine grooves in the sole.
Double tube (a thinner tube nested inside the main stroke) with a blown-out white core.
Main hue purple #a86df0, plus one tiny orange #ff6a1e point at the tip of the cigarette.
```

### ソール 8 — 【業物】慣性キャンセラ内蔵ソール（業物 / 紫 `#a86df0`）
`gear-sole-08.png`

```
厚底のソールに機械ユニットが埋め込まれた一足。真横から。側面にジャイロを示す
同心の円環が 2 重、その脇にインジケータの点が 3 つ。踵の後方へ、制動を示す短い弧が
2 本流れる。ソール上面には放熱のスリットが 4 本。管は二重で芯が白く飛ぶ。
主調色は紫 #a86df0。アクセントなし。
```

```
A thick-soled shoe with a machine unit embedded in it, in side profile. On the flank, two
concentric gyroscope rings with three indicator dots beside them. Two short braking arcs
trail backward from the heel. Four heat-vent slits along the top of the sole. Double tube
with a blown-out white core. Main hue purple #a86df0, no accent.
```

### ソール 9 — 【銘品】監視ロボ振り切り用 加速脚（銘品 / 金 `#f0c93a`）
`gear-sole-09.png`

```
脛まで覆う外骨格の脚部。真横からやや斜めに。ふくらはぎの位置に推進ユニットが 1 基、
足首に 3 枚のフィンが放射状に開く。膝下から足先へ、骨格のフレームが 2 本走る。
管は多重で、にじみが広い。推進ユニットの後方に小さな光点を 4 つ散らす。
主調色は金 #f0c93a。アクセントなし。
```

```
An exoskeletal leg piece covering the shin, seen from a slight three-quarter side view. A
thruster unit sits at the calf; three fins fan out at the ankle. Two structural frame rails
run from below the knee to the toe. Multi-tube strokes with a wide bloom, and four small
light points scattered behind the thruster. Main hue gold #f0c93a, no accent.
```

### ソール 10 — 【銘品】ASH RUNNER（銘品 / 金 `#f0c93a`）
`gear-sole-10.png`

```
系統の到達点。流線型のランニングシューズ 1 足を真横から。ヒールカウンターが
左右対称の翼の形に張り出し、ソールからは後方へ、灰と火の粉が流れる軌跡（後ろに
なびく短い線 3 本と、その周りに散る小さな点 6 つ）が伸びる。甲には細い通気の線が
4 本。管は多重で最も太く、にじみが最も広い。主調色は金 #f0c93a。
火の粉のうち 2 点だけ橙 #ff6a1e にする。
```

```
The pinnacle of the line: a streamlined running shoe in strict side profile. The heel
counter flares into a symmetrical pair of wings, and a trail of ash and sparks streams
backward from the sole — three short swept lines with six small points scattered around
them. Four thin ventilation lines across the instep. The thickest multi-tube strokes and
widest bloom in the set. Main hue gold #f0c93a, with just two of the sparks in orange
#ff6a1e.
```

---

## 8. パッチ（patch）— ニコチンの減りを遅くする 10 枚

共通スタイル A を前置きして使う。

### パッチ 1 — 期限切れのニコチンガム（並品 / 灰 `#8a8a8a`）
`gear-patch-01.png`

```
押し出し式のブリスターシート（PTP 包装）1 枚。斜め上から見た平たい板。5×2 の
10 マスのうち 8 マスは既に押し出されて潰れており、残っているガムは 2 粒だけ。
シートの角が 1 つ折れて反り返っている。線は細く不揃いで、縁の管が 1 か所途切れる。
主調色は灰 #8a8a8a。アクセントなし。
```

```
A single push-through blister pack (PTP sheet), a flat card seen from a raised three-quarter
angle. Of its 5×2 grid of ten cells, eight are already popped and crumpled; only two pieces
of gum remain. One corner of the sheet is folded and curling. Thin, uneven strokes with one
unlit gap along the border tube. Main hue grey #8a8a8a, no accent.
```

### パッチ 2 — 使いかけの禁煙パッチ（逆用）（並品 / 灰 `#8a8a8a`）
`gear-patch-02.png`

```
円い禁煙パッチ 1 枚。斜め上から。剥離紙が半分めくれ上がってカールし、露出した
粘着面には埃が 3 点付いている。パッチ表面の丸い縁取りが 1 周。使いかけらしく、
円の輪郭が歪んでいる。線は細く不揃い。主調色は灰 #8a8a8a。アクセントなし。
```

```
A single round nicotine patch, seen from a raised three-quarter angle. The backing paper is
half peeled and curling away; three specks of dust cling to the exposed adhesive. One
circular border line runs around the face of the patch. The circle itself is slightly
distorted — this one has been used before. Thin, uneven strokes.
Main hue grey #8a8a8a, no accent.
```

### パッチ 3 — 業務用ニコチンパッチ〈弱〉（上物 / 緑 `#3af08a`）
`gear-patch-03.png`

```
角丸の四角い大判パッチ 1 枚。斜め上から。表面に業務用らしい格子状のメッシュが
4×4 マス。左の縁には投与量の目盛りが 5 本刻まれている（数字は描かない）。
角に貼り付け用のつまみが 1 つ。線は均一で製品として整っている。
主調色は緑 #3af08a。アクセントなし。
```

```
One large rounded-square patch, seen from a raised three-quarter angle. Its face carries an
industrial 4×4 mesh grid; five dosage tick marks are notched along the left edge (draw no
numbers). One application tab at a corner. Even, tidy strokes.
Main hue green #3af08a, no accent.
```

### パッチ 4 — 密造ニコチンパッチ（上物 / 緑 `#3af08a`）
`gear-patch-04.png`

```
手作り感のある、辺の長さが不揃いな四角いパッチ 1 枚。斜め上から。四辺をガムテープ
（幅のある帯を 2 本、十字ではなく上下に）で押さえてあり、中央には液の入った小袋が
ぷっくり膨らんで丸く盛り上がる。裏から伸びる細いチューブが 1 本。
線は均一だが、輪郭だけ手作りらしくわずかに歪む。主調色は緑 #3af08a。アクセントなし。
```

```
A home-made patch with uneven, hand-cut edges, seen from a raised three-quarter angle. Two
broad strips of tape hold it down along the top and bottom; in the center, a small pouch of
liquid bulges out as a rounded dome. One thin tube runs out from behind it. Strokes are even
apart from the outline, which stays slightly irregular to read as improvised.
Main hue green #3af08a, no accent.
```

### パッチ 5 — 【訳あり】徐放型パッチ〈治験品〉（特上 / 青 `#3ac6f0`）
`gear-patch-05.png`

```
二層構造の角丸パッチ 1 枚。斜め上から。上層はわずかに浮いて 1 枚ずれて重なり、
その下にマイクロ針の細かい格子が 6×6 で覗く。右下の角には治験ロットの札が
小さく 1 枚ぶら下がる（形だけ。文字は描かない）。上層の縁に補助の細線が 1 本。
主調色は青 #3ac6f0。アクセントなし。
```

```
A two-layer rounded-square patch, seen from a raised three-quarter angle. The upper layer
floats slightly offset above the lower one, revealing a fine 6×6 microneedle grid beneath.
A small trial-lot tag hangs from the bottom-right corner (shape only — no text). One thin
secondary line follows the edge of the upper layer.
Main hue blue #3ac6f0, no accent.
```

### パッチ 6 — 旧世紀製 ニコチン点滴パック（特上 / 青 `#3ac6f0`）
`gear-patch-06.png`

```
吊り下げ式の輸液バッグ 1 個。真正面から、上部に吊り下げ用の穴が 1 つ。下部から
点滴筒を経てチューブが伸び、S 字に 1 回うねって下端で終わる。チューブの途中に
ローラークランプが 1 つ。バッグの中身の水位を示す横線が 1 本と、目盛りが 4 本。
点滴筒の中の雫だけを小さな光点で示す。主調色は青 #3ac6f0。
雫にだけ琥珀 #f0a93a を 1 点、小さく。
```

```
One hanging IV bag, seen head-on, with a hanging hole at the top. From the bottom, a drip
chamber leads into a tube that curves once in an S and ends at the lower edge; a roller
clamp sits partway along it. A single horizontal fluid line marks the level inside the bag,
with four tick marks beside it. The falling droplet inside the drip chamber is a small light
point. Main hue blue #3ac6f0, with one tiny amber #f0a93a point for the droplet only.
```

### パッチ 7 — 【業物】経皮ニコチン供給器 MK-II（業物 / 紫 `#a86df0`）
`gear-patch-07.png`

```
腕に巻くバンド型の機械。正面からやや斜めに、輪の形が分かる姿勢で。中央に円形の
供給ポートがあり、その内側にもう 1 周細い環。脇に小さな制御ダイヤルが 1 つと、
インジケータの点が 3 つ横に並ぶ。バンドの両端には留め具。管は二重（主線の内側に
もう 1 本細い管）で、芯が白く飛ぶ。主調色は紫 #a86df0。アクセントなし。
```

```
A machine cuff worn around the arm, angled so the ring shape reads clearly. A circular
delivery port sits at the center with a second thin ring inside it; beside it, one small
control dial and three indicator dots in a row. Clasps at both ends of the band. Double tube
(a thinner tube nested inside the main stroke) with a blown-out white core.
Main hue purple #a86df0, no accent.
```

### パッチ 8 — 【業物】皮下埋込式ニコチンリザーバ（業物 / 紫 `#a86df0`）
`gear-patch-08.png`

```
皮膚の下に埋め込むカプセル型ユニット 1 個。斜めに寝かせて置く。胴の中ほどに丸窓が
あり、その中に貯蔵室の水位線が 1 本。両端からは短いカテーテルが 1 本ずつ伸びて、
先が細くなる。ユニットの周りに、皮膚の断面を示す薄い破線が 1 本、横に走る。
管は二重で芯が白く飛ぶ。主調色は紫 #a86df0。アクセントなし。
```

```
A capsule-shaped unit made to sit under the skin, lying at an angle. A round window in the
middle of its body shows a single fluid-level line inside the reservoir. A short catheter
runs out of each end, tapering to a point. One faint dashed line crosses horizontally behind
it to indicate the plane of the skin. Double tube with a blown-out white core.
Main hue purple #a86df0, no accent.
```

### パッチ 9 — 【銘品】血中濃度定常化ユニット（銘品 / 金 `#f0c93a`）
`gear-patch-09.png`

```
胸に着ける円盤型のユニット 1 個。真正面から。中央に同心円が 3 重（濃度を保つ環）、
その中心に小さな点。外周には放熱の細かいフィンが 12 枚、放射状に等間隔で並ぶ。
円盤の左右に装着用の短いアームが 1 本ずつ。管は多重で、にじみが広い。
外周に沿って小さな光点を 4 つ散らす。主調色は金 #f0c93a。アクセントなし。
```

```
A disc-shaped unit worn on the chest, seen head-on. Three concentric rings at its center
with a small dot in the middle; twelve fine cooling fins radiate evenly around the rim. One
short mounting arm on each side. Multi-tube strokes with a wide bloom, and four small light
points scattered around the rim. Main hue gold #f0c93a, no accent.
```

### パッチ 10 — 【銘品】ETERNAL SMOKER（銘品 / 金 `#f0c93a`）
`gear-patch-10.png`

```
系統の到達点。首から下げる勲章めいた装置。真正面から、上部にチェーンの輪が 1 つ。
本体は円い窓で、その中を細い煙が 3 本、永久に立ちのぼっている（下から上へ緩く
うねる波線 3 本）。窓の左右には翼の形をしたヒートシンクが左右対称に張り出し、
それぞれに細いスリットが 4 本。下端に小さな飾りが 1 つ垂れる。管は多重で最も太く、
にじみが最も広い。小さな光点を 6 つ散らす。主調色は金 #f0c93a。アクセントなし。
```

```
The pinnacle of the line: a medal-like device worn on a neck chain, seen head-on, with one
chain ring at the top. The body is a round window in which three thin ribbons of smoke rise
forever (three gently undulating wavy lines running upward). Symmetrical wing-shaped heat
sinks flare out on both sides of the window, each cut with four thin slits; a small pendant
ornament hangs from the bottom. The thickest multi-tube strokes and widest bloom in the set,
with six small light points scattered around. Main hue gold #f0c93a, no accent.
```

---

## 9. 生成後の手順

画像生成 AI がやるのは **PNG を置くところまで。** 変換は開発者が実行する。

### 装備アイコン 30 枚

1. `gear-blade-01.png` 〜 `gear-patch-10.png` を `m/ui/` に置く（256×256、透過）
2. 開発者が `uv run --with pillow python tools/webp.py m/ui/gear-*.png` で WebP に変換する
3. 変換後に PNG を削除する。リポジトリに残るのは `.webp` だけ（既存アセットと同じ規約）

### 押収品コンテナ

1. `container.png`（512×512、背景マゼンタ）を任意の作業ディレクトリに置く
2. 開発者が `42.png` にリネームし、`uv run --with pillow python tools/atlas.py <そのディレクトリ>` を流して `m/q2.png` のタイル 42 に焼き込む（`tools/atlas.py` の `TILE_RANGE` は現在 33〜38 なので、42 を焼くには開発者側で範囲を広げる）
3. 焼き込み後の 16×16 ピクセルが唯一の原本になる。元の PNG はリポジトリに含めない

### 受け入れ確認の観点

- アイコン 30 枚を並べて、**等級（灰→緑→青→紫→金）が色だけで読めるか**
- 既存の `m/ui/icon-*.webp` 6 枚と混ぜて並べたとき、**どれが新しいか分からないか**
- 54px まで縮めたとき、**同じ系統の 10 枚が互いに見分けられるか**
- コンテナを 16×16 に縮小したとき、**箱として読めて、封印灯の位置が分かるか**
