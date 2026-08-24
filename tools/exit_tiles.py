"""m/q2.png のタイル 47・48（非常口の標識と床）を焼き込む。

使い方: uv run --with pillow python tools/exit_tiles.py [--preview <out.png>]

tools/atlas.py と違って元画像を取らない。この 2 枚は「緑地に白のピクトグラム」
という記号そのもので、16×16 の 1 ピクセルごとの配置が意味を持つ（縮小すると
走る人と扉が潰れて読めなくなる）ため、コードが原本になる。何度流しても同じ
結果になる（冪等）。

47 は非常口の標識で、開通した非常口の上に頭上の高さで浮かぶビルボード
（entity-exit.ts）。48 は非常口タイルの床で、game.ts が静的ジオメトリに敷く。
どちらも full-bright 規則（r>0.95 && g>0.25 && b==0）は満たさないので、
霧とライトを受ける。近くまで来れば「どのタイルが非常口か」が読める、という
役割に必要なのはそこまでで、遠距離はミニマップの緑の明滅が担う。
"""
import sys
from pathlib import Path

from PIL import Image

ATLAS = Path(__file__).resolve().parent.parent / 'm' / 'q2.png'
TILE_SIZE = 16

SIGN_TILE = 47
FLOOR_TILE = 48

# 標識の色。ミニマップの非常口（0,220,120）と同じ緑の帯に置いて、
# 「緑 = 非常口」を画面とミニマップで揃える。
#
# 青を強く抑えてあるのは、頂点シェーダの環境光が vec3(0.3, 0.3, 0.6) で青が緑の
# 2 倍あるため。素直な緑（0,150,84）を置くと画面では青と緑が並んで青緑に見え、
# ミニマップの緑と別の色になる。白のピクトグラムも同じ理由で黄緑寄りに置く。
PALETTE = {
    '.': None,                  # 透過
    'd': (2, 40, 14),           # 縁（暗い緑）
    'g': (0, 150, 40),          # 地の緑
    'G': (34, 222, 74),         # 明るい緑（発光の縁）
    'w': (238, 255, 196),       # ピクトグラム（白）
    'k': (10, 16, 12),          # 床の地（暗い金属）
    'K': (22, 34, 24),          # 床の地（明るい側）
}

# 標識: 緑地に白の走る人と扉。左が人、右が扉。
SIGN = [
    'dddddddddddddddd',
    'dGGGGGGGGGGGGGGd',
    'dGggggggggwwwwGd',
    'dGgggwwgggwggggd',
    'dGgggwwgggwggggd',
    'dGggggggggwggggd',
    'dGggwwwwwgwggggd',
    'dGgwwwwgggwggggd',
    'dGgwgwwgggwggggd',
    'dGgwggwgggwggggd',
    'dGggggwwggwggggd',
    'dGgggwwgwgwggggd',
    'dGggwwgggwwggggd',
    'dGggwgggggwwwwGd',
    'dGGGGGGGGGGGGGGd',
    'dddddddddddddddd',
]

# 床: 緑の枠に下向きの山形 2 段。v=0（行 0）が奥、v=1（行 15）が手前なので、
# 山形は手前＝プレイヤーが乗る側へ向く
FLOOR = [
    'GGGGGGGGGGGGGGGG',
    'GddddddddddddddG',
    'GdkkkkkkkkkkkkdG',
    'GdkkKKKKKKKKkkdG',
    'GdkGGkkkkkkGGkdG',
    'GdkkGGkkkkGGkkdG',
    'GdkkkGGkkGGkkkdG',
    'GdkkkkGGGGkkkkdG',
    'GdkkkkkGGkkkkkdG',
    'GdkGGkkkkkkGGkdG',
    'GdkkGGkkkkGGkkdG',
    'GdkkkGGkkGGkkkdG',
    'GdkkkkGGGGkkkkdG',
    'GdkkKKKGGKKKkkdG',
    'GddddddddddddddG',
    'GGGGGGGGGGGGGGGG',
]


def bake(pixels, tile: int, art: list[str]) -> None:
    ox = tile * TILE_SIZE
    for y in range(TILE_SIZE):
        row = art[y]
        for x in range(TILE_SIZE):
            color = PALETTE[row[x]]
            pixels[ox + x, y] = (0, 0, 0, 0) if color is None else (*color, 255)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    pixels = atlas.load()
    bake(pixels, SIGN_TILE, SIGN)
    bake(pixels, FLOOR_TILE, FLOOR)

    if '--preview' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--preview') + 1])
        crop = atlas.crop((SIGN_TILE * TILE_SIZE, 0, (FLOOR_TILE + 1) * TILE_SIZE, TILE_SIZE))
        crop.resize((crop.width * 12, crop.height * 12), Image.NEAREST).save(out)
        print(f'preview written to {out}')
        return

    atlas.save(ATLAS)
    print(f'baked tiles {SIGN_TILE}, {FLOOR_TILE} into {ATLAS}')


if __name__ == '__main__':
    main()
