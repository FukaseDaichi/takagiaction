import { nicotine_stage_edgy, nicotine_stage_withdrawal } from './nicotine'

// ラン間で持ち越す恒久状態と強化テーブル。ラン状態（state.ts）と寿命が違うため
// 分離する。state.ts と同様に実行時依存を持たない葉モジュールで、
// Node（Vitest）でモックなしに評価できることが条件。

export const meta_upgrade_ids = ['lung', 'tolerance', 'sniff', 'power', 'spare'] as const
export type meta_upgrade_id_t = (typeof meta_upgrade_ids)[number]

export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 5, tolerance: 5, sniff: 3, power: 3, spare: 3,
}

export const meta = {
  yani: 0,
  best_depth: 0,
  // localStorage が使えない環境（プライベートモード等）で false。
  // メニューが「このセッション限り」の警告を出すために読む
  persistent: true,
  levels: { lung: 0, tolerance: 0, sniff: 0, power: 0, spare: 0 } as
    Record<meta_upgrade_id_t, number>,
}

// コストは段階ごとに倍々: 20/40/80/160/320。3 段の項目は先頭 3 つを使う。
// 全解放の合計は 1660
export function meta_upgrade_cost(level: number): number {
  return 20 << level
}

export function meta_buy(id: meta_upgrade_id_t): boolean {
  const level = meta.levels[id]
  if (level >= meta_max_level[id]) { return false }
  const cost = meta_upgrade_cost(level)
  if (meta.yani < cost) { return false }
  meta.yani -= cost
  meta.levels[id]++
  meta_save()
  return true
}

export function meta_nicotine_max(): number {
  return 100 + 10 * meta.levels.lung
}

// 減少速度に掛ける係数。全強化 0.70 は、最大ゲージ 1.5 倍と合わせた実効 2.143 倍が
// nicotine_drain_rate の √ 式と深度 37 で釣り合う前提の値（gameplay.md 参照）
export function meta_drain_factor(): number {
  return 1 - 0.06 * meta.levels.tolerance
}

// shot_interval() に渡す火力係数。3 段で 0.64
export function meta_power_factor(): number {
  return 1 - 0.12 * meta.levels.power
}

export function meta_spare_count(): number {
  return meta.levels.spare
}

// 嗅覚は「追い詰められたときだけ働く救済」。恒久ナビにすると中核の問い
// （ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化するため、
// 1 段は離脱症状帯（30% 以下）のみ、2 段以上でそわそわ帯（60% 以下）に緩和
export function meta_sniff_active(stage: number): boolean {
  if (meta.levels.sniff === 0) { return false }
  const threshold = meta.levels.sniff >= 2
    ? nicotine_stage_edgy
    : nicotine_stage_withdrawal
  return stage >= threshold
}

const meta_storage_key = 'takagi_meta'

function meta_clamp_int(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value | 0)
    : 0
}

export function meta_load(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(meta_storage_key)
    meta.persistent = true
  } catch {
    meta.persistent = false
    return
  }
  if (!raw) { return }
  try {
    const data = JSON.parse(raw) as {
      yani?: unknown, best_depth?: unknown, levels?: Record<string, unknown>,
    }
    meta.yani = meta_clamp_int(data.yani)
    meta.best_depth = meta_clamp_int(data.best_depth)
    for (const id of meta_upgrade_ids) {
      meta.levels[id] = Math.min(meta_clamp_int(data.levels?.[id]), meta_max_level[id])
    }
  } catch {
    // 壊れた保存データは捨てて初期値のまま始める
  }
}

export function meta_save(): void {
  try {
    localStorage.setItem(meta_storage_key, JSON.stringify({
      yani: meta.yani, best_depth: meta.best_depth, levels: meta.levels,
    }))
  } catch {
    meta.persistent = false
  }
}
