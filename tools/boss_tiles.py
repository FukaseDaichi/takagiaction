"""m/q2.png のタイル 46 を焼き込む。

使い方: uv run --with pillow python tools/boss_tiles.py

46（ボスの弾）は絵ではなく単色の点なので、tools/slash_tiles.py と同じく
コードが原本になる。色は既存の敵の赤 (255,66,0) — 蜘蛛（27）とセントリー
（32）の目に使われているまさにその色で、フラグメントシェーダの full-bright
規則（r>0.95 && g>0.25 && b==0）を満たす。この規則を満たす texel はライトも
霧も通さないので、弾は push_light() なしで等しく明るく見える。ボスの弾は
同時に最大 26 発飛び、max_lights = 16 には載せられないため、これが唯一の経路。

45（ボス本体）は tools/atlas.py で画像から焼き込まれており、m/q2.png が
唯一の原本になる。この tool は 45 を変更しない。
"""
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16

BULLET_TILE = 46

# full-bright 規則を満たす 2 色。外周は敵の赤、芯だけ橙に寄せて厚みを出す
BULLET_EDGE = (255, 66, 0)
BULLET_CORE = (255, 150, 0)
BULLET_RADIUS = 3.2
BULLET_CORE_RADIUS = 1.6


def clear(pixels, tile: int) -> None:
    ox = tile * TILE_SIZE
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            pixels[ox + x, y] = (0, 0, 0, 0)


def bake_bullet(pixels) -> None:
    ox = BULLET_TILE * TILE_SIZE
    clear(pixels, BULLET_TILE)
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            dx = x - 7.5
            dy = y - 7.5
            d = (dx * dx + dy * dy) ** 0.5
            if d <= BULLET_CORE_RADIUS:
                pixels[ox + x, y] = (*BULLET_CORE, 255)
            elif d <= BULLET_RADIUS:
                pixels[ox + x, y] = (*BULLET_EDGE, 255)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    pixels = atlas.load()
    bake_bullet(pixels)
    atlas.save(ATLAS)
    print(f'baked tile {BULLET_TILE} into {ATLAS}')


if __name__ == '__main__':
    main()
