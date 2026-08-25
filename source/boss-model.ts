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

// フェーズ。1 = 前半、2 = 激昂。段を 3 つ以上にしないのは、各段が短くなって
// 違いが読めなくなるため
export const boss_phase_rage = 2

// HP がちょうど半分のときは激昂に入れる。境界をどちらに寄せるかは
// 恣意的だが、決めておかないと実装とテストが食い違う
export function boss_phase(hp: number, hp_max: number): number {
  return hp <= hp_max / 2 ? boss_phase_rage : 1
}

// 以下 4 つは激昂で変わる摘み。倍率を 1 つの係数で表さず値を直に並べるのは、
// 上がり方が揃っていないため（回転 ×1.5 / 刻み ×0.83 / 弾速 ×1.25）。
// 係数にすると「揃っている」という嘘の情報が入る

// 砲塔の角速度（rad/s）。前半は 1 周 12.6 秒
export function boss_spin_rate(phase: number): number {
  return phase === boss_phase_rage ? 0.75 : 0.5
}

// 発射を刻む角度（rad）。時間ではなく掃引した角度で刻むのは、回転速度を
// 変えても弾の空間密度が変わらないようにするため
export function boss_fire_step(phase: number): number {
  return phase === boss_phase_rage ? 0.15 : 0.18
}

// 掃射の弾速。前半の 56 はセントリーの 64 より遅い。激昂の 70 はそれを
// 上回る — ラン中で最も速い弾を激昂したボスが撃つのは序列として正しい
export function boss_bullet_speed(phase: number): number {
  return phase === boss_phase_rage ? 70 : 56
}

// 掃引が発射のしきい値を何回またいだか。またいだ回数だけ斉射する。
// 引数は累積の掃引角（常に増える）で、回転の向きは含まない。
// step を引数に取るのは、掃射（boss_fire_step）と追尾弾（boss_homing_step）が
// 同じ規則を共有するため。時間で刻む別のタイマーを持ち込まない
export function boss_volleys(before: number, after: number, step: number): number {
  return Math.floor(after / step) - Math.floor(before / step)
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

// 周回の目標半径の帯（px。灰皿タイルの中心から測る）。
// 下限 10 は灰皿の上にまだ被る位置。上限 70 は、外周壁の内面（中心から
// 88px）からボスの半辺（7px）と余白を引いた値 — 壁に張り付くと自機が
// 背後を取れなくなる。柱リング（半径 8 タイル）を跨ぐ帯なので、ボスは
// 隙間を通って内外を行き来する
export const boss_orbit_radius_min = 10
export const boss_orbit_radius_max = 70

// 目標を引き直す間隔（秒）
export const boss_wander_interval = 2.5
// 柱に塞がれて引き直すときの下限（秒）。置かないと、引いた先も塞がれて
// いる間は毎フレーム引き直し続け、半径がその場で震えて進まない
export const boss_wander_retry_min = 0.4

// 速度係数の帯。1 を挟むので、平均すれば基準の線速度になる
const boss_speed_factor_min = 0.7
const boss_speed_factor_max = 1.3

// 半径を目標へ寄せる速さは、周回の線速度に対する比で持つ。1 にすると
// 接線方向と動径方向が同じ速さになり、合成速度が基準の 1.41 倍まで出る。
// 0.5 なら 1.12 倍に収まり、docs が示す線速度の帯と食い違わない
const boss_radius_speed_factor = 0.5

// 周回の線速度（px/s）。角速度ではなく線速度を一定にする — 角速度を
// 一定にすると半径 10 と 70 で線速度が 7 倍違い、同じ相手が半径によって
// 別の速さで動いて見える。自機の約 130 に対して十分遅く、逃げ切れる
export function boss_orbit_speed(phase: number): number {
  return phase === boss_phase_rage ? 54 : 36
}

// rand は [0, 1] を呼び出し側が渡す（テストで決定的にするため）
export function boss_pick_radius(rand: number): number {
  return boss_orbit_radius_min +
    rand * (boss_orbit_radius_max - boss_orbit_radius_min)
}

export function boss_pick_speed_factor(rand: number): number {
  return boss_speed_factor_min +
    rand * (boss_speed_factor_max - boss_speed_factor_min)
}

export function boss_radius_step(
  current: number, target: number, speed: number, dt: number,
): number {
  const max = speed * boss_radius_speed_factor * dt
  const delta = target - current
  return Math.abs(delta) <= max ? target : current + Math.sign(delta) * max
}

// 角速度は線速度から導く。半径が 0 に近いと発散するので下限で割る
export function boss_orbit_omega(speed: number, radius: number): number {
  return speed / Math.max(radius, boss_orbit_radius_min)
}
