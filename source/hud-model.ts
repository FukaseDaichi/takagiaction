import { meta_max_level, meta_upgrade_cost, meta_upgrade_ids } from './meta'
import type { meta_upgrade_id_t } from './meta'

// HUD の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（death-screen-model.ts と同じ扱い）。

export interface objective_t {
  title: string
  note: string
}

// 「次にやること」。事実と指示だけを書く（感情は monologue が担う、docs/story.md）。
// 引数は state.smoking / state.exit_open と同じ 0 / 1。
export function hud_objective(smoking: number, exit_open: number): objective_t {
  if (smoking) {
    return { title: 'そのまま 吸い続ける', note: '離れると中断する' }
  }
  if (!exit_open) {
    return { title: '喫煙所を探して 一服する', note: '一服すると非常口が開きます' }
  }
  return { title: '非常口から 次の階へ', note: 'ミニマップの緑印が出口です' }
}

export interface yani_progress_t {
  cost: number // 次に買える最安の強化コスト。0 = 全項目 MAX（目標なし）
  remain: number // 目標まで足りないヤニ。届いていれば 0
  ratio: number // ゲージの塗り 0..1
}

// 「次の強化まで」の目標額。最安の強化を目標に置くのは、闇サイトで実際に
// 次の一手として選べる金額がそれだからで、深度を伸ばす動機に直結する。
// levels は meta.levels（呼び出し側から渡してこのモジュールを純粋に保つ）。
export function hud_yani_progress(
  yani: number, levels: Record<meta_upgrade_id_t, number>,
): yani_progress_t {
  let cost = 0
  for (const id of meta_upgrade_ids) {
    const level = levels[id]
    if (level >= meta_max_level[id]) { continue }
    const c = meta_upgrade_cost(level)
    if (cost === 0 || c < cost) { cost = c }
  }
  if (cost === 0) { return { cost: 0, remain: 0, ratio: 1 } }
  return {
    cost,
    remain: Math.max(0, cost - yani),
    ratio: Math.min(1, yani / cost),
  }
}
