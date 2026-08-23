"""m/q2.png のタイル 33〜46 に画像を焼き込む。

使い方: uv run --with pillow python tools/atlas.py <src_dir>
<src_dir> に 33.png .. 46.png を置く（任意サイズ、正方形推奨）。
左上 (0,0) のピクセル色を背景キーとみなし、近い色を透過にする。

43・44・46 はコードで作る帯と点（tools/slash_tiles.py, tools/boss_tiles.py）
なので、この tool 用の元画像を置かなければ黙って飛ばされる。
"""
import sys
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16
TILE_RANGE = range(33, 47)
# 背景キー色との距離（チャンネル毎の絶対差の和）がこの値以下なら透過
KEY_TOLERANCE = 90


def bake_tile(atlas: Image.Image, index: int, src_path: Path) -> None:
    src = Image.open(src_path).convert('RGBA')
    tile = src.resize((TILE_SIZE, TILE_SIZE), Image.BOX)

    key = tile.getpixel((0, 0))
    pixels = tile.load()
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            p = pixels[x, y]
            if sum(abs(p[i] - key[i]) for i in range(3)) <= KEY_TOLERANCE:
                pixels[x, y] = (0, 0, 0, 0)

    # 既存タイルを消してから貼る（冪等にするため）
    atlas.paste((0, 0, 0, 0), (index * TILE_SIZE, 0, (index + 1) * TILE_SIZE, TILE_SIZE))
    atlas.paste(tile, (index * TILE_SIZE, 0), tile)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('usage: uv run --with pillow python tools/atlas.py <src_dir>')
    src_dir = Path(sys.argv[1])

    atlas = Image.open(ATLAS).convert('RGBA')
    baked = []
    for index in TILE_RANGE:
        src_path = src_dir / f'{index}.png'
        if not src_path.exists():
            continue
        bake_tile(atlas, index, src_path)
        baked.append(index)

    if not baked:
        sys.exit(f'no source images (33.png..46.png) found in {src_dir}')
    atlas.save(ATLAS)
    print(f'baked tiles {baked} into {ATLAS}')


if __name__ == '__main__':
    main()
