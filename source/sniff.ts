import { bfs_distances } from './level-generator'
import { level_height, level_width } from './state'

// 嗅覚の残り香探索。自機タイルから床タイルを BFS し、最も近い目標
// （本物とダミーを区別しない。跡地にも残り香はある、という理屈）への
// 方角と距離を返す。到達不能なら null。
// BFS は毎フレーム回すには重いので、呼び出し側（minimap.ts）が
// 1 秒間隔に律速する。
//
// 目標タイルは床でも壁でもよい。距離は「目標の 4 近傍の床までの最小距離 + 1」で、
// 喫煙所のタイルは壁（生成器が 8 を書く）、非常口は開通の瞬間に entity-exit.ts が
// level_data へ 1 を書いて床になる。床の目標が BFS 距離 D にあるとき、経路上の
// 先行タイルが D − 1 を持つので最小近傍 + 1 は D に一致する。分岐は要らない。

export interface sniff_result_t {
  angle: number // 自機から目標へのユークリッド方角（ラジアン）
  // 経路の第一歩の方角。壁を指さない。嗅覚 Lv3 以上（meta_sniff_path）が使う
  path_angle: number
  dist: number // BFS タイル距離
}

const neighbor_offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// 経路の第一歩のタイル。自機起点の距離場を、目標に隣接する床タイル（entry）から
// 1 ずつ下って辿る。entry が自機タイル自身なら経路に一歩もないので null。
// 距離場では距離 > 0 のタイルが必ず距離 − 1 の近傍を持つので、d を毎周無条件に
// 1 減らす for ループで必ず終わる（無限ループの余地を構造で消している）
function sniff_first_step(
  dist: Int32Array, entry_x: number, entry_z: number,
): { x: number, z: number } | null {
  let x = entry_x
  let z = entry_z
  let d = dist[x + z * level_width]
  if (d === 0) { return null }

  for (; d > 1; d--) {
    for (const [dx, dz] of neighbor_offsets) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      if (dist[nx + nz * level_width] === d - 1) {
        x = nx
        z = nz
        break
      }
    }
  }
  return { x, z }
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
    let entry_x = -1
    let entry_z = -1
    for (const [dx, dz] of neighbor_offsets) {
      const nx = target.x + dx
      const nz = target.z + dz
      if (nx < 0 || nx >= level_width || nz < 0 || nz >= level_height) { continue }
      const n = dist[nx + nz * level_width]
      if (n === -1) { continue }
      if (d === -1 || n < d) { d = n; entry_x = nx; entry_z = nz }
    }
    if (d === -1) { continue }
    if (!best || d + 1 < best.dist) {
      const angle = Math.atan2(target.z - player_z, target.x - player_x)
      const step = sniff_first_step(dist, entry_x, entry_z)
      best = {
        angle,
        // 経路に一歩もないときはユークリッド角に落とす
        path_angle: step
          ? Math.atan2(step.z - player_z, step.x - player_x)
          : angle,
        dist: d + 1,
      }
    }
  }
  return best
}
