# 画像生成プロンプト

アトラス `m/q2.png` のタイル 45（ボス = 灰皿撤去ユニット）1 枚ぶん。
生成した PNG を `45.png` という名前でディレクトリに置き、
`uv run --with pillow python tools/atlas.py <そのディレクトリ>` で焼き込む。
焼き込んだらこのファイルは削除する（役目を終えるため）。

## 共通の制約

- **正方形。16×16 ピクセルに縮小されて使われる。** ディテールではなくシルエットで読ませること
- **背景は単色べた塗り。** 左上 (0,0) のピクセル色が背景キーとして透過に落とされる。機体の色と明確に違う色にすること
- **目・発光部は純粋な橙赤 `#FF4200`。** この色だけがシェーダの full-bright 規則を通り、暗いフロアでも光って見える。他の部分にこの色を使わないこと
- 機体色は無彩色寄りの灰（既存のセントリー・清掃ドローンと同じ帯）
- 正面向き、上下は切らない。真横や俯瞰にしない（ビルボードとして常に正面を向く）

## タイル 45: 灰皿撤去ユニット

日本語: 巨大な業務用の解体ロボット。ずんぐりした箱型の胴体に、放射状に伸びる
複数の短い砲身。低い姿勢でうずくまり、何かの上に居座っているような重量感。
胴体中央に横一文字の橙赤のスリット（単眼）。傷と煤で汚れた灰色の装甲。
背景は濃い青緑の単色。

English: A massive industrial demolition robot, squat boxy chassis with several
short gun barrels radiating outward from its torso. Low crouching posture, heavy
and immovable, as if squatting on top of something. A single horizontal slit eye
in pure orange-red (#FF4200) across the center of the chassis. Grey armor plating,
scratched and soot-stained. Flat solid dark teal background. Front view, full body
in frame, pixel-art friendly silhouette.
