"""m/q2.png のタイル 46・49 を焼き込む。

使い方: uv run --with pillow python -X utf8 tools/boss_tiles.py

46（ボスの掃射）と 49（ボスの追尾弾）は絵ではなく単色の点なので、
tools/slash_tiles.py と同じくコードが原本になる。何度流しても同じ結果に
なる（冪等）。

46 の色は既存の敵の赤 (255,66,0) — 蜘蛛（27）とセントリー（32）の目に
使われているまさにその色で、フラグメントシェーダの full-bright 規則
（r>0.95 && g>0.25 && b==0）を満たす。

49 は水色で、同じシェーダに足したもう 1 本の規則
（b>0.95 && g>0.25 && r==0）を満たす。掃射と同じ赤の帯に置くと弾が密な
ときに埋もれるため、帯の外へ出す必要がある。追尾弾はその場で横へよける
のではなく、旋回の外へ回り込ませて追い越させる弾なので、一目で別物と
分かることに価値がある。

この規則を満たす texel はライトも霧も通さないので、弾は push_light()
なしで等しく明るく見える。ボスの弾は同時に 40 発以上飛び、
max_lights = 16 には載せられないため、これが唯一の経路。

45（ボス本体）は tools/atlas.py で画像から焼き込まれており、m/q2.png が
唯一の原本になる。この tool は 45 を変更しない。
"""
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16

BULLET_TILE = 46
HOMING_TILE = 49

# full-bright 規則（r>0.95 && g>0.25 && b==0）を満たす 2 色。
# 外周は敵の赤、芯だけ橙に寄せて厚みを出す
BULLET_EDGE = (255, 66, 0)
BULLET_CORE = (255, 150, 0)
# もう 1 本の規則（b>0.95 && g>0.25 && r==0）を満たす 2 色。
# g を 102 と 220 に取るのは、下限 64 を確実に超えつつ水色に見せるため
HOMING_EDGE = (0, 102, 255)
HOMING_CORE = (0, 220, 255)
BULLET_RADIUS = 3.2
BULLET_CORE_RADIUS = 1.6


def clear(pixels, tile: int) -> None:
    ox = tile * TILE_SIZE
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            pixels[ox + x, y] = (0, 0, 0, 0)


def bake_dot(pixels, tile: int, edge, core) -> None:
    ox = tile * TILE_SIZE
    clear(pixels, tile)
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            dx = x - 7.5
            dy = y - 7.5
            d = (dx * dx + dy * dy) ** 0.5
            if d <= BULLET_CORE_RADIUS:
                pixels[ox + x, y] = (*core, 255)
            elif d <= BULLET_RADIUS:
                pixels[ox + x, y] = (*edge, 255)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    pixels = atlas.load()
    bake_dot(pixels, BULLET_TILE, BULLET_EDGE, BULLET_CORE)
    bake_dot(pixels, HOMING_TILE, HOMING_EDGE, HOMING_CORE)
    atlas.save(ATLAS)
    print(f'baked tiles {BULLET_TILE}, {HOMING_TILE} into {ATLAS}')


if __name__ == '__main__':
    main()
