// ラン間で持ち越す恒久状態と強化テーブル。ラン状態（state.ts）と寿命が違うため
// 分離する。state.ts と同様に実行時依存を持たない葉モジュールで、
// Node（Vitest）でモックなしに評価できることが条件。

export const meta_upgrade_ids = ['lung', 'tolerance', 'sniff', 'power', 'spare'] as const
export type meta_upgrade_id_t = (typeof meta_upgrade_ids)[number]

export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 10, tolerance: 10, sniff: 10, power: 10, spare: 5,
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

// コストは 15 + 10lv + 5lv²（15〜510）。10 段の項目は 2025、予備（5 段）は 325 で
// 全解放の合計は 8425。倍々（20 << lv）は 10 段だと最終段 10240 になり破綻する
export function meta_upgrade_cost(level: number): number {
  return 15 + 10 * level + 5 * level * level
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

// 減少速度に掛ける係数。全強化 0.60 と最大ゲージ 2 倍の実効 3.33 倍が新しい上限
export function meta_drain_factor(): number {
  return 1 - 0.04 * meta.levels.tolerance
}

// shot_interval() に渡す火力係数。10 段で 0.50
export function meta_power_factor(): number {
  return 1 - 0.05 * meta.levels.power
}

export function meta_spare_count(): number {
  return meta.levels.spare
}

// 発動しきい値（ニコチン比率）。Lv1 = 30% から等間隔で Lv10 = 60% まで上がる。
// 上限を 60% に留めるのは、恒久ナビ化すると中核の問い（ゲージが尽きる前に
// 喫煙所を見つけられるか）を恒久的に無効化するため（従来設計を維持）
export function meta_sniff_threshold(level: number): number {
  return 0.3 + (level - 1) * (0.3 / 9)
}

// 嗅覚は「追い詰められたときだけ働く救済」。ratio は state.nicotine / state.nicotine_max
export function meta_sniff_active(ratio: number): boolean {
  const level = meta.levels.sniff
  return level > 0 && ratio <= meta_sniff_threshold(level)
}

// 最終段は方向に加えて距離も出す。効果値の判定はすべてこのモジュールに置く
export function meta_sniff_distance(): boolean {
  return meta.levels.sniff >= 10
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
