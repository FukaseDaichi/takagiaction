// ボスの数値と掃射の幾何。実行時 import を一切持たない葉モジュール。
// 3D の見た目は自動で確認できないため、形の性質だけをここで固定する
// （slash-model.ts と同じ流儀）。

// 砲口の本数の上限。O(n²) の衝突ループに乗る弾の数を抑える意味もある
export const boss_arms_max = 6

// 砲口の本数。深度スケールはこの 1 本だけで表す。見た目で強さが分かり、
// 無限深度でも上限で頭打ちになる。回転速度と弾速を一緒に動かさないのは、
// 二重にスケールすると難度が跳ねるため
export function boss_arms(depth: number): number {
  return Math.min(1 + Math.floor(depth / 5), boss_arms_max)
}

// 耐久（自機のプラズマ 1 発 = 1 ダメージ）。深度 5 の 60 発は、素の射撃間隔
// 0.1 秒なら当てっぱなしで 6 秒、回避しながらで 20〜40 秒。同深度のゲージ
// 寿命は約 72 秒なので「倒せるが、のんびりはできない」帯に収まる
export function boss_hp(depth: number): number {
  return 40 + 4 * depth
}

// 砲塔の角速度（rad/s）。1 周 12.6 秒
export const boss_spin_rate = 0.5

// 発射を刻む角度（rad）。時間ではなく掃引した角度で刻むのは、回転速度を
// 変えても弾の空間密度が変わらないようにするため
export const boss_fire_step = 0.18

// 弾速。セントリーの 64 より遅い。中央から闘技場の端（88px）まで約 1.6 秒
export const boss_bullet_speed = 56

// 掃引が発射のしきい値を何回またいだか。またいだ回数だけ斉射する。
// 引数は累積の掃引角（常に増える）で、回転の向きは含まない
export function boss_volleys(before: number, after: number): number {
  return Math.floor(after / boss_fire_step) - Math.floor(before / boss_fire_step)
}

// n 本の砲口の角度。等角に並んだまま全体が回る
export function boss_arm_angles(angle: number, arms: number): number[] {
  const out: number[] = []
  for (let i = 0; i < arms; i++) {
    out.push(angle + (i * Math.PI * 2) / arms)
  }
  return out
}

// 当たり判定の一辺（ワールド単位）。見た目だけ大きくして既定の 9 のまま
// 残すと、輪郭に撃った弾がすり抜ける。
// この値は闘技場の柱の間隔を縛る（docs/gameplay.md「ボス階」の 4 つ目の
// 不変条件）ため、レンダラや音に到達しない葉モジュールに置く。
// level-generator.test.ts が不変条件の検証のために読む
export const boss_hitbox = 14

// 判定・絵・銃口が共有する中心の、entity.x/z からの距離。game.ts の AABB は
// [x, x+w] なので、中心は半辺のところにある。3 つが別々の中心を持つと
// 「絵の左上に撃った弾がすり抜け、右下の素の床で当たる」ことになり、
// w を広げた意味が消える
export const boss_centre = boss_hitbox / 2

// 生成位置の補正。上の中心を灰皿タイル（8×8）の中心 = tile * 8 + 4 に重ねる
// ための戻し量で、game.ts が生成時に足す
export const boss_spawn_offset = 4 - boss_centre
