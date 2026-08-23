"""m/q2.png のタイル 43・44 に薙ぎの弧の帯を焼き込む。

使い方: uv run --with pillow python tools/slash_tiles.py

tools/atlas.py と違って元画像を取らない。この 2 枚は絵ではなく
「横方向に一様な帯」で、幅方向の色とディザ密度だけが情報を持つため、
コードで生成するほうが原本になる。何度流しても同じ結果になる（冪等）。

v = 0（画像の行 0）が弧の外周＝刃先の縁、v = 1（行 15）が内周に対応する
（renderer.ts の push_quad の UV 割り当て）。フラグメントシェーダが
a < 0.8 を discard するので中間アルファは使えず、明るさは色そのものと
ディザ密度で落とす。各行は U 方向に周期 2 なので、弧を分割した板ごとに
タイルを繰り返しても継ぎ目が出ない。
"""
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16

# (行の範囲, 色, ディザ密度)。範囲外の行は透過。
# ディザは内側の落ち際だけに使う — 帯の大半に散らすと発光ではなく
# 「ごみ」に見える
CORE_TILE = 43
CORE_ROWS = [
    ((0, 1), (255, 255, 255), 1.0),
    ((2, 5), (238, 247, 255), 1.0),
    ((6, 8), (196, 219, 247), 1.0),
    ((9, 11), (150, 186, 231), 0.5),
]

GLOW_TILE = 44
GLOW_ROWS = [
    ((0, 3), (206, 227, 255), 1.0),
    ((4, 6), (158, 190, 234), 0.5),
    ((7, 9), (118, 153, 205), 0.25),
]


def dither(x: int, y: int, density: float) -> bool:
    if density >= 1.0:
        return True
    if density == 0.5:
        return (x + y) % 2 == 0
    return x % 2 == 0 and y % 2 == 0


def bake_band(atlas: Image.Image, tile: int, rows: list) -> None:
    spec_by_row = {}
    for (lo, hi), color, density in rows:
        for y in range(lo, hi + 1):
            spec_by_row[y] = (color, density)

    pixels = atlas.load()
    ox = tile * TILE_SIZE
    for y in range(TILE_SIZE):
        spec = spec_by_row.get(y)
        for x in range(TILE_SIZE):
            if spec is None:
                pixels[ox + x, y] = (0, 0, 0, 0)
                continue
            color, density = spec
            pixels[ox + x, y] = (*color, 255) if dither(x, y, density) else (0, 0, 0, 0)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    bake_band(atlas, CORE_TILE, CORE_ROWS)
    bake_band(atlas, GLOW_TILE, GLOW_ROWS)
    atlas.save(ATLAS)
    print(f'baked tiles {CORE_TILE}, {GLOW_TILE} into {ATLAS}')


if __name__ == '__main__':
    main()
