import { bfs_distances } from './level-generator'
import { level_height, level_width } from './state'

// 嗅覚の残り香探索。自機タイルから床タイルを BFS し、最も近い目標
// （本物とダミーを区別しない。跡地にも残り香はある、という理屈）への
// 方角と距離を返す。目標タイル自体は壁（生成器が 8 を書く）なので、
// 目標の 4 近傍の床までの距離 + 1 で比較する。到達不能なら null。
// BFS は毎フレーム回すには重いので、呼び出し側（minimap.ts）が
// 1 秒間隔に律速する。

export interface sniff_result_t {
  angle: number // 自機から目標へのユークリッド方角（ラジアン）
  dist: number // BFS タイル距離
}

export function sniff_find(
  tiles: Uint8Array,
  player_x: number,
  player_z: number,
  targets: { x: number, z: number }[],
): sniff_result_t | null {
  const dist = bfs_distances(tiles, { x: player_x, z: player_z })

  let best: sniff_result_t | null = null
  for (const target of targets) {
    let d = -1
    for (const [nx, nz] of [
      [target.x + 1, target.z], [target.x - 1, target.z],
      [target.x, target.z + 1], [target.x, target.z - 1],
    ]) {
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      const n = dist[nx + nz * level_width]
      if (n === -1) { continue }
      if (d === -1 || n < d) { d = n }
    }
    if (d === -1) { continue }
    if (!best || d + 1 < best.dist) {
      best = {
        angle: Math.atan2(target.z - player_z, target.x - player_x),
        dist: d + 1,
      }
    }
  }
  return best
}
