// ニコチンの数値ロジック。副作用を持たず、実行時 import も持たない。
// Node 環境（Vitest）でモックなしに評価できることがこのモジュールの条件。
// entity-player / game / minimap / hud の四者から読まれるため、式をここに一本化する。

export const nicotine_stage_normal = 0 // 100〜61%
export const nicotine_stage_edgy = 1 // 60〜31% そわそわ
export const nicotine_stage_withdrawal = 2 // 30〜1% 離脱症状
export const nicotine_stage_limit = 3 // 0% 限界

export function nicotine_stage(nicotine: number, nicotine_max: number): number {
  const ratio = nicotine / nicotine_max
  if (ratio > 0.6) { return nicotine_stage_normal }
  if (ratio > 0.3) { return nicotine_stage_edgy }
  if (ratio > 0) { return nicotine_stage_withdrawal }
  return nicotine_stage_limit
}

// 毎秒の減少量。深度が上がるほど速くなるが、線形だと計画B の恒久強化の実効倍率
// （最大 150 / 耐性 −30% = 2.143 倍）と深度 20 でちょうど相殺してしまい、
// それ以降は伸びしろがゼロになる。√ にすると釣り合う点が深度 37 まで動く。
// 係数 0.19 は設計書 §1 の目安（深度 1 で 100 秒 / 深度 11 で 62 秒）を通る値。
export function nicotine_drain_rate(depth: number): number {
  return 1 + 0.19 * Math.sqrt(depth - 1)
}

export function player_speed(stage: number): number {
  return stage >= nicotine_stage_withdrawal ? 96 : 128
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
