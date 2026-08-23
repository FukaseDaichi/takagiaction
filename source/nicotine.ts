// ニコチンの数値ロジック。副作用を持たず、実行時 import も持たない。
// Node 環境（Vitest）でモックなしに評価できることがこのモジュールの条件。
// entity-player / game / minimap / hud の四者から読まれるため、式をここに一本化する。

export const nicotine_stage_normal = 0 // 100〜61%
export const nicotine_stage_edgy = 1 // 60〜31% そわそわ
export const nicotine_stage_withdrawal = 2 // 30〜1% 離脱症状
export const nicotine_stage_limit = 3 // 0% 限界

// 段階の境界（比率）。HUD のタバコはこの 2 値の位置に印字帯を描くため、
// しきい値を式に埋め込まず名前で公開する（CSS 側に数値を複製すると、
// 境界を動かしたときに計器の目盛りだけが古い位置に残る）
export const nicotine_edgy_ratio = 0.6
export const nicotine_withdrawal_ratio = 0.3

export function nicotine_stage(nicotine: number, nicotine_max: number): number {
  const ratio = nicotine / nicotine_max
  if (ratio > nicotine_edgy_ratio) { return nicotine_stage_normal }
  if (ratio > nicotine_withdrawal_ratio) { return nicotine_stage_edgy }
  if (ratio > 0) { return nicotine_stage_withdrawal }
  return nicotine_stage_limit
}

// 毎秒の減少量。深度が上がるほど速くなるが、線形だと恒久強化の実効倍率
// （最大 200 / 耐性 −40% = 3.33 倍、docs/meta-progression.md）と深度 40 で
// ちょうど相殺してしまい、それ以降は伸びしろがゼロになる。
// √ にすると釣り合う点が深度 152 まで動き、到達しうる深度の外に出る。
// 係数 0.19 は設計書 §1 の目安（深度 1 で 100 秒 / 深度 11 で 62 秒）を通る値。
export function nicotine_drain_rate(depth: number): number {
  return 1 + 0.19 * Math.sqrt(depth - 1)
}

// 基礎 128（離脱症状で 96）× 移動速度係数（恒久強化、省略時 1）
// + 装備の加算（ソール、省略時 0）。
// 装備を乗算しないのは、乗算だと深いほど効きが増してインフレするため
// （docs/equipment.md「加算にする理由」）。定数加算は離脱症状帯にも同じ量だけ
// 効くので、弱っているときほど相対的に大きく助ける
export function player_speed(stage: number, speed_factor = 1, bonus = 0): number {
  return (stage >= nicotine_stage_withdrawal ? 96 : 128) * speed_factor + bonus
}

// 薙ぎの間隔。離脱症状の手の震えは近接にも効くが、火力強化（銃の強化）は
// 掛からない。base は刃物の段が決める（equipment.ts の blade_interval）
export function swing_interval(stage: number, base: number): number {
  return base * (stage >= nicotine_stage_withdrawal ? 1.8 : 1)
}

// 基礎 0.1 秒 × 火力係数（恒久強化、省略時 1） × ニコチン係数（離脱症状で 1.8）
export function shot_interval(stage: number, power_factor = 1): number {
  return 0.1 * power_factor * (stage >= nicotine_stage_withdrawal ? 1.8 : 1)
}

// 射角に加算する乱数の幅。0.2 が既定（entity-player の元の実装と同じ）
export function shot_spread(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 0.4 : 0.2
}

// push_light() の第 7 引数。減衰は 1/(falloff * 距離) なので、
// falloff を上げるほど照らされる半径が縮む。RGB を下げても青く沈むだけで
// 見える範囲は変わらない（霧と環境光が別に効いているため）。
export function player_light_falloff(stage: number): number {
  if (stage === nicotine_stage_normal) { return 0.04 }
  if (stage === nicotine_stage_edgy) { return 0.07 }
  return 0.1
}

export function minimap_radius(stage: number): number {
  if (stage === nicotine_stage_normal) { return 10 }
  if (stage === nicotine_stage_edgy) { return 7 }
  return 5
}

// camera.shake は毎フレーム 0.9 倍に減衰するので、0.15 を足し続けると
// 1.5 付近で釣り合う（蜘蛛の撃破が 1、歩哨が 3）。フレームレート依存だが、
// 減衰側が既にそうなっているので合わせる。
export function camera_shake_amount(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 0.15 : 0
}

export function stage_color(stage: number): string {
  return ['#e90', '#f70', '#f30', '#f00'][stage]
}
