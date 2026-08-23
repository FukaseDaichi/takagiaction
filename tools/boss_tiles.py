"""m/q2.png のタイル 45・46 を焼き込む。

使い方: uv run --with pillow python tools/boss_tiles.py

46（ボスの弾）は絵ではなく単色の点なので、tools/slash_tiles.py と同じく
コードが原本になる。色は既存の敵の赤 (255,66,0) — 蜘蛛（27）とセントリー
（32）の目に使われているまさにその色で、フラグメントシェーダの full-bright
規則（r>0.95 && g>0.25 && b==0）を満たす。この規則を満たす texel はライトも
霧も通さないので、弾は push_light() なしで等しく明るく見える。ボスの弾は
同時に最大 26 発飛び、max_lights = 16 には載せられないため、これが唯一の経路。

45（ボス本体）は暫定のプレースホルダである。生成した絵ができたら
tools/atlas.py で焼き直し、この関数ごと消す（押収品コンテナ 42 と同じ手順）。
"""
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16

BOSS_TILE = 45
BULLET_TILE = 46

# full-bright 規則を満たす 2 色。外周は敵の赤、芯だけ橙に寄せて厚みを出す
BULLET_EDGE = (255, 66, 0)
BULLET_CORE = (255, 150, 0)
BULLET_RADIUS = 3.2
BULLET_CORE_RADIUS = 1.6

# プレースホルダの機体色と、full-bright の目
BODY = (96, 102, 108)
EYE = (255, 66, 0)


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


def bake_boss_placeholder(pixels) -> None:
    ox = BOSS_TILE * TILE_SIZE
    clear(pixels, BOSS_TILE)
    for y in range(2, 15):
        for x in range(2, 14):
            pixels[ox + x, y] = (*BODY, 255)
    for x in (4, 5, 10, 11):
        for y in (5, 6):
            pixels[ox + x, y] = (*EYE, 255)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    pixels = atlas.load()
    bake_bullet(pixels)
    bake_boss_placeholder(pixels)
    atlas.save(ATLAS)
    print(f'baked tiles {BOSS_TILE}, {BULLET_TILE} into {ATLAS}')


if __name__ == '__main__':
    main()
