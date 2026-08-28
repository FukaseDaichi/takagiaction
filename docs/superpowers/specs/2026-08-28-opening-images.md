# OP 素材の生成プロンプト

設計の正本は [2026-08-28-opening-design.md](2026-08-28-opening-design.md)。
このファイルは素材生成の作業用で、素材が `m/` に揃ったら削除する。

## 共通指定

- すべての静止画は `m/hero.webp` を画風参照として添付する
- 16:9・1920×1080 で生成する
- 各プロンプトの先頭に次の共通スタイル指定を付ける:

```text
Highly detailed hi-bit pixel art, dark dystopian retro-future, deep teal-green shadows with warm amber-orange artificial lights, subtle CRT scanline texture over the whole image, grimy industrial surfaces, cinematic composition, 16:9. Match the art style, palette and pixel density of the attached reference image.
```

## 静止画（本編カット 1〜4、Ken Burns 用）

### カット 1 → m/op1.webp

字幕: 「西暦2718年。やつらは違法となった。」
禁止ホログラムの中身はぼかして正体を隠す。

```text
Vast megacity at night seen from a high vantage point, dense brutalist towers with tiny amber windows, low toxic haze between buildings, several patrol drones hovering and sweeping cold blue-white searchlight cones downward, giant red holographic prohibition signs (circle-with-slash, the inner icon blurred and indistinct) projected onto tower faces, no people, oppressive and orderly mood. Keep the center of the frame low-contrast so a subtitle can sit over it. No readable text anywhere.
```

### カット 2 → m/op2.webp

字幕: 「地上から、すべてのやつらが消えた。」
撤去跡の伏線。煙草要素は出さない。

```text
Sterile street-level walkway at dusk, a long grimy concrete wall with a row of conspicuously clean rectangular patches where wall-mounted fixtures were removed long ago — exposed bolt holes, faint outline stains, official hazard tape, small unreadable notice plates, one boxy maintenance robot rolling past, no people, melancholic emptiness. Do NOT show any cigarettes, ashtrays or smoking icons — what was removed must stay ambiguous. Keep the center of the frame low-contrast for a subtitle.
```

### カット 3 → m/op3.webp

字幕: 「しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。」
hero.webp の高木と同一人物指定。

```text
The same protagonist as in the reference image, seen from behind, small in the lower third of the frame: a middle-aged Japanese man with short messy black hair, rumpled dark suit jacket, loosened tie, hands in pockets, looking up at a colossal sealed industrial facility — a monolithic gate of rusted steel plates and hazard stripes, dead floodlights, a faint green emergency-exit glow high above, light drizzle catching the amber security lights, monumental scale gap between the tiny man and the gate. No readable text.
```

### カット 4 → m/op4.webp

字幕: 「失われた人類の遺産。禁じられた聖域。最後の安息の地。」

```text
Deep underground vertical shaft interior with cathedral-like scale, one divine shaft of warm golden light falling from far above through dusty air onto a massive sealed vault door at the bottom, floating dust motes in the beam, pipes and catwalks dissolving into darkness at the edges, religious-painting solemnity, no people, no text.
```

## 動画生成に使う静止画（開始フレーム・ポスター兼フォールバック）

### カット 5 ポスター → m/op5.webp

落ちの絵。神々しい光 × みすぼらしい実物。

```text
Interior of a pitiful old smoking room, staged like a holy altar: yellowed cracked wall tiles, a single battered stainless standing ashtray in the exact center, a half-dead fluorescent tube on the ceiling, an old faded wall sign with a burning-cigarette pictogram (no readable text), thin haze, and one dramatic god-ray of golden light falling on the ashtray as if it were a sacred relic, dust motes in the beam, no people, static symmetrical altar-like composition. The comedy is the gap: divine lighting on a shabby mundane room.
```

### タイトル最終フレーム → m/title.webp

黒シーンに全画面で置くため透過は不要。完全な黒背景で作る。

```text
Game title logo on a pure black background (#000000): the words "TAKAGI ACTION" stacked in two lines, blocky chunky pixel font, glowing amber-orange phosphor color like an old CRT terminal, subtle scanlines and slight glow bleed, a single thin wisp of pixel-art cigarette smoke rising from the last letter, nothing else in frame, perfectly centered. The text must read exactly "TAKAGI ACTION".
```

## 動画生成用プロンプト

納品形式: H.264 mp4（yuv420p）・1280×720・各 2〜3MB 以下・音なし（音はゲーム側で鳴らす）。

### カット 5 → m/op5.mp4

image-to-video。開始フレーム = m/op5.webp。3〜4 秒・シームレスループ。

```text
Static locked-off camera, no camera motion, no people. The half-dead fluorescent tube flickers irregularly (two or three quick stutters), a thin ribbon of smoke-like haze drifts slowly upward through the golden god-ray, dust motes float gently in the light. Everything else stays perfectly still. Seamless loop: the first and last frames must be identical. Keep the pixel-art texture crisp, no morphing, no new objects appearing.
```

### タイトルドロップ → m/title.mp4

2.5〜3 秒・ワンショット。終端フレーム指定ができるツールなら m/title.webp を終端に添付する。

```text
Starts on a pure black screen. For the first moment only faint amber CRT scanline flickers are visible. Then pixel-art glitch bars and a quick burst of smoke sweep across the frame, and the amber pixel-font logo "TAKAGI ACTION" snaps into place with one hard glitch stutter. The glow stabilizes and the logo holds perfectly still for the final second. No camera motion, no other elements, pure black background throughout. The final frame must match the attached logo image exactly.
```
