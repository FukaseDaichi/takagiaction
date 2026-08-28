// フロアの明るさ。WebGL も DOM も触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（death-sequence-model.ts と同じ扱い）。
//
// 環境光と霧の遠距離は、以前はシェーダ文字列に直接書かれていた。ボス階だけを
// 明るくするために uniform へ出したので、**両方の値の正本はここ**である
// （renderer.ts の lighting は毎フレームの受け渡し口にすぎない）。
//
// ボス階は到達から boss_light_duration 秒かけて明転する。ボスの機体と旋回が
// 闘技場のどこにいても読めることが要件で、環境光を上げるだけでは足りない —
// 闘技場は arena_side（23）タイル四方 = 184 単位あり、通常の霧（遠 112）では
// 遠側が黒く沈む。明側は霧の遠距離もその外まで押す。

export const boss_light_duration = 3

// 暗側 = 通常フロアの見え方。ここを変えると全フロアの基準が動く
const ambient_dark: [number, number, number] = [0.3, 0.3, 0.6]
const fog_far_dark = 112

// 明側。環境光は暗側の 1.5 倍で、**RGB の比は動かさない**。青が緑の 2 倍という
// 比率は非常口の緑タイルの焼き色が依存する不変条件で（docs/gameplay.md
// 「非常口」）、明側だけ比を変えると同じタイルがボス階でだけ別の色に見える。
// 霧は闘技場の端（arena_side * 8 = 184）の外へ出す
const ambient_bright: [number, number, number] = [0.45, 0.45, 0.9]
const fog_far_bright = 200

// 到達からの経過秒を 0〜1 へ。線形だと明転の開始と終了が段差として見えるので
// smoothstep で両端を寝かせる
export function boss_light_progress(elapsed: number): number {
  const x = Math.max(0, Math.min(1, elapsed / boss_light_duration))
  return x * x * (3 - 2 * x)
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function light_ambient(t: number): [number, number, number] {
  return [
    mix(ambient_dark[0], ambient_bright[0], t),
    mix(ambient_dark[1], ambient_bright[1], t),
    mix(ambient_dark[2], ambient_bright[2], t),
  ]
}

export function light_fog_far(t: number): number {
  return mix(fog_far_dark, fog_far_bright, t)
}
