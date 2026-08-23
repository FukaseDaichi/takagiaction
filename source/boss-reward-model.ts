import { meta_max_level, meta_upgrade_ids } from './meta'
import type { meta_upgrade_id_t } from './meta'

// ボス報酬の実効段。報酬は run_end() まで meta に書かない（game.ts）ので、
// ダイアログが meta.levels をそのまま出すと、深度 5 と 10 で同じトラックを
// 選んだとき 2 回とも同じ「現在 → 次」が表示される。base は meta.levels[id]、
// picked はこのランで選んだ id の並び。

export function reward_level(
  id: meta_upgrade_id_t, base: number, picked: readonly meta_upgrade_id_t[],
): number {
  let level = base
  for (const p of picked) {
    if (p === id) { level++ }
  }
  return Math.min(level, meta_max_level[id])
}

export function reward_available(
  id: meta_upgrade_id_t, base: number, picked: readonly meta_upgrade_id_t[],
): boolean {
  return reward_level(id, base, picked) < meta_max_level[id]
}

// 6 本すべてが上限なら報酬ダイアログを出さない（呼び出し側はコンテナを
// もう 1 個落とす）。強化が満杯のプレイヤーに、まだ意味が残っている報酬は
// 装備の段だけである
export function reward_any_available(
  levels: Record<meta_upgrade_id_t, number>,
  picked: readonly meta_upgrade_id_t[],
): boolean {
  return meta_upgrade_ids.some((id) => reward_available(id, levels[id], picked))
}
