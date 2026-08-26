// ラン間で持ち越す恒久状態・強化テーブル・拾った装備の段を持つ。ラン状態
// （state.ts）とは寿命が違うため分離する。実行時 import は equipment.ts
// （同じく葉モジュール）のみで、Node（Vitest）でモックなしに評価できることが
// 条件（「一切持たない」から緩めた形で、条件自体は変わらない）。

import { gear_max_tier, gear_slots } from './equipment'
import type { gear_slot_t } from './equipment'

export const meta_upgrade_ids =
  ['lung', 'tolerance', 'sniff', 'leg', 'power', 'spare'] as const
export type meta_upgrade_id_t = (typeof meta_upgrade_ids)[number]

export const meta_max_level: Record<meta_upgrade_id_t, number> = {
  lung: 10, tolerance: 10, sniff: 5, leg: 10, power: 10, spare: 5,
}

export const meta = {
  yani: 0,
  best_depth: 0,
  // localStorage が使えない環境（プライベートモード等）で false。
  // 死亡画面が「このセッション限り」の警告を出すために読む
  persistent: true,
  levels: { lung: 0, tolerance: 0, sniff: 0, leg: 0, power: 0, spare: 0 } as
    Record<meta_upgrade_id_t, number>,
  // 押収品コンテナで拾った装備。系統ごとに 1 つ・段が全順序なので、
  // 所持状態は「その系統で持っている段」の整数 1 つに還元できる（0 = 未所持）
  gear: { blade: 0, sole: 0, patch: 0 } as Record<gear_slot_t, number>,
}

// 全トラック共通の価格曲線（15/30/55/90/135/190/255/330/415/510）。
// 倍々（20 << lv）は 10 段だと最終段 10240 になり破綻する
function meta_upgrade_cost(level: number): number {
  return 15 + 10 * level + 5 * level * level
}

// 段の価格。嗅覚だけ共通曲線を 1 段飛ばしでサンプルして 15/55/135/255/415
// （合計 875）にする。段ごとに機能が解放される 5 段トラックなので、曲線
// どおりの合計 325 では全トラック中で最安になってしまう。曲線そのものは
// 1 本のままで、サンプリング位置だけを変える。
// 10 段の項目 1 本が 2025、予備（5 段）が 325、全解放の合計は 9300
export function meta_upgrade_price(
  id: meta_upgrade_id_t, level: number,
): number {
  return meta_upgrade_cost(level * (id === 'sniff' ? 2 : 1))
}

export function meta_buy(id: meta_upgrade_id_t): boolean {
  const level = meta.levels[id]
  if (level >= meta_max_level[id]) { return false }
  const cost = meta_upgrade_price(id, level)
  if (meta.yani < cost) { return false }
  meta.yani -= cost
  meta.levels[id]++
  meta_save()
  return true
}

// ボス撃破の報酬で 1 段上げる。meta_buy() と違ってヤニを引かない。
// 保存は呼び出し側（run_end）が最後に 1 度だけ行う — ボス報酬もヤニも
// 同じ 1 回の meta_save() に載る
export function meta_grant(id: meta_upgrade_id_t): void {
  meta.levels[id] = Math.min(meta.levels[id] + 1, meta_max_level[id])
}

// 効果 getter はすべて段数を引数で受けられる（既定は現在の段）。死亡画面が
// 「現在値 → 次の段の値」を出すために level + 1 を渡して呼ぶ

export function meta_nicotine_max(level = meta.levels.lung): number {
  return 100 + 10 * level
}

// 減少速度に掛ける係数。全強化 0.60 と最大ゲージ 2 倍の実効 3.33 倍が新しい上限
export function meta_drain_factor(level = meta.levels.tolerance): number {
  return 1 - 0.04 * level
}

// shot_interval() に渡す火力係数。10 段で 0.50
export function meta_power_factor(level = meta.levels.power): number {
  return 1 - 0.05 * level
}

// player_speed() に渡す移動速度係数。10 段で 1.5625（速度 128 → 200）。
// Lv4（156.8）で清掃ドローンの逃走終端速度（150）を追い越す。素の足では
// 追いつけないドローン狩りを解禁する投資として意図した強化（docs/enemies.md）
export function meta_speed_factor(level = meta.levels.leg): number {
  return 1 + 0.05625 * level
}

export function meta_spare_count(level = meta.levels.spare): number {
  return level
}

// 発動しきい値（ニコチン比率）。Lv1 = 30%、Lv2 以降 = 60%。どちらもニコチン
// 段階の境界そのもの（nicotine.ts の nicotine_withdrawal_ratio /
// nicotine_edgy_ratio）で、「離脱症状になったら」「そわそわし始めたら」と
// 1 文で言える。上限を 60% に留めるのは、恒久ナビ化すると中核の問い
// （ゲージが尽きる前に喫煙所を見つけられるか）を恒久的に無効化するため
export function meta_sniff_threshold(level: number): number {
  return level >= 2 ? 0.6 : 0.3
}

// 生存系（残り香・非常口）の位置は「追い詰められたときだけ働く救済」。
// ratio は state.nicotine / state.nicotine_max。
// 収入系（meta_sniff_loot）はこの判定を通さない
export function meta_sniff_active(ratio: number): boolean {
  const level = meta.levels.sniff
  return level > 0 && ratio <= meta_sniff_threshold(level)
}

// Lv3: 残り香までの道のり（BFS タイル距離）が出る。Lv1 で位置が見えている
// ので直線距離は目測できる。この段が答えるのは「迷路を歩くと本当は何メートルか」
export function meta_sniff_distance(level = meta.levels.sniff): boolean {
  return level >= 3
}

// Lv4: 開通済みの非常口も嗅ぐ。一服後に非常口を探して歩き回りゲージが再び
// 落ちた局面では目標リストが空になり、それまで嗅覚が沈黙していた
export function meta_sniff_exit(level = meta.levels.sniff): boolean {
  return level >= 4
}

// Lv5: 清掃ドローンと押収品コンテナがミニマップに点灯する。しきい値を
// 持たないのは、追い詰められている最中に拾いに行く余裕がなく狩りの道具に
// ならないため。中核の問いを握っているのは喫煙所の在り処だけなので、常時でも触れない。
// 落ちている吸い殻そのものは対象外（docs/meta-progression.md「収入系が指すのは機会の在り処」）
export function meta_sniff_loot(level = meta.levels.sniff): boolean {
  return level >= 5
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
      yani?: unknown, best_depth?: unknown,
      levels?: Record<string, unknown>, gear?: Record<string, unknown>,
    }
    meta.yani = meta_clamp_int(data.yani)
    meta.best_depth = meta_clamp_int(data.best_depth)
    for (const id of meta_upgrade_ids) {
      meta.levels[id] = Math.min(meta_clamp_int(data.levels?.[id]), meta_max_level[id])
    }
    for (const slot of gear_slots) {
      meta.gear[slot] = Math.min(meta_clamp_int(data.gear?.[slot]), gear_max_tier)
    }
  } catch {
    // 壊れた保存データは捨てて初期値のまま始める
  }
}

export function meta_save(): void {
  try {
    localStorage.setItem(meta_storage_key, JSON.stringify({
      yani: meta.yani, best_depth: meta.best_depth,
      levels: meta.levels, gear: meta.gear,
    }))
  } catch {
    meta.persistent = false
  }
}
