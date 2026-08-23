import { bfs_distances } from './level-generator'
import { level_height, level_width } from './state'

// 嗅覚の残り香探索。自機タイルから床タイルを BFS し、最も近い目標
// （本物とダミーを区別しない。跡地にも残り香はある、という理屈）の
// タイルと距離を返す。到達不能なら null。
// BFS は毎フレーム回すには重いので、呼び出し側（minimap.ts）が
// 1 秒間隔に律速する。
//
// 目標タイルは床でも壁でもよい。距離は「目標の 4 近傍の床までの最小距離 + 1」で、
// 喫煙所のタイルは壁（生成器が 8 を書く）、非常口は開通の瞬間に entity-exit.ts が
// level_data へ 1 を書いて床になる。床の目標が BFS 距離 D にあるとき、経路上の
// 先行タイルが D − 1 を持つので最小近傍 + 1 は D に一致する。分岐は要らない。
//
// 自機が目標タイルの上に乗っている場合（開通後の非常口だけが該当）、最小近傍が
// 距離 1 になるので距離は 2 と出る。降下の直前にしか起きないので直さない。

export interface sniff_result_t {
  // 目標タイル。ミニマップはこのタイルを倍速で明滅させる。エンティティの
  // ミニマップ座標（x >> 3, z >> 3）そのものなので、minimap.ts は添字の一致
  // だけで「いま嗅いでいるのはどれか」を判定できる
  x: number
  z: number
  dist: number // BFS タイル距離
}

const neighbor_offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// 範囲外か。level_width で割った添字は範囲チェックを外すと前後の行へ回り込む
// （x = -1 が前の行の x = 63 を指す）。過去にこれで最寄り判定が壊れている
function out_of_bounds(x: number, z: number): boolean {
  return x < 0 || x >= level_width || z < 0 || z >= level_height
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
    for (const [dx, dz] of neighbor_offsets) {
      const nx = target.x + dx
      const nz = target.z + dz
      if (out_of_bounds(nx, nz)) { continue }
      const n = dist[nx + nz * level_width]
      if (n === -1) { continue }
      if (d === -1 || n < d) { d = n }
    }
    if (d === -1) { continue }
    if (!best || d + 1 < best.dist) {
      best = { x: target.x, z: target.z, dist: d + 1 }
    }
  }
  return best
}
