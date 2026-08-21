"""配信する画像を WebP に変換する。

使い方: uv run --with pillow python tools/webp.py <png> ...
渡した PNG の隣に同名の .webp を書き、元の PNG は消さない（消すのは git 側の作業）。

死亡画面のイラストとアイコンはロッシー圧縮でも原本と見分けがつかず、
PNG の 1/10 前後まで縮む。スプライトアトラス m/q2.png はこの tool の
対象外で、理由は docs/architecture.md に書いてある。
"""
import sys
from pathlib import Path

from PIL import Image

# 看板の日本語・ラップトップの細い赤文字・暗部のディザで原本と差が出ない
# 最小の品質。これ以上上げてもサイズだけが増える
QUALITY = 85
# 一番遅い＝一番縮む探索。変換は手作業なので速度は問題にならない
METHOD = 6


def to_webp(src: Path) -> Path:
    dst = src.with_suffix('.webp')
    image = Image.open(src)
    # 配信対象はすべてアルファを持たないので RGB に落とす。
    # アルファ付きを渡された場合は WebP 側もアルファを保つ
    mode = 'RGBA' if image.mode in ('RGBA', 'LA', 'PA') else 'RGB'
    image.convert(mode).save(dst, 'WEBP', quality=QUALITY, method=METHOD)
    return dst


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('usage: uv run --with pillow python tools/webp.py <png> ...')

    for arg in sys.argv[1:]:
        src = Path(arg)
        if not src.exists():
            sys.exit(f'not found: {src}')
        dst = to_webp(src)
        before = src.stat().st_size
        after = dst.stat().st_size
        print(f'{src} -> {dst}  {before / 1024:.1f}K -> {after / 1024:.1f}K ({after / before:.1%})')


if __name__ == '__main__':
    main()
