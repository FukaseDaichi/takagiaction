import { describe, expect, it } from 'vitest'
import { generate_level, level_vert_cost } from './level-generator'
import type { level_layout_t } from './level-generator'
import { level_height, level_width } from './state'

function tile_index(x: number, z: number): number {
  return x + z * level_width
}

function is_floor(tiles: Uint8Array, x: number, z: number): boolean {
  if (x < 0 || x >= level_width || z < 0 || z >= level_height) { return false }
  const t = tiles[tile_index(x, z)]
  return t > 0 && t < 8
}

// 生成器の内部 BFS とは独立に書く。同じバグを二重に持たないため。
function reachable_from(layout: level_layout_t): Uint8Array {
  const seen = new Uint8Array(level_width * level_height)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  seen[queue[0]] = 1
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (seen[n]) { continue }
      seen[n] = 1
      queue.push(n)
    }
  }
  return seen
}

describe('generate_level: 決定性', () => {
  it('同じ深度とシードからは同じ間取りが出る', () => {
    const a = generate_level(5, 12345)
    const b = generate_level(5, 12345)
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles))
    expect(b.rooms).toEqual(a.rooms)
    expect(b.start).toEqual(a.start)
  })

  it('シードが違えば間取りが変わる', () => {
    const a = generate_level(5, 1)
    const b = generate_level(5, 2)
    expect(Array.from(b.tiles)).not.toEqual(Array.from(a.tiles))
  })
})

describe('generate_level: 部屋', () => {
  it('部屋は互いに 1 タイル以上空いている', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { rooms } = generate_level(1, seed)
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i]
          const b = rooms[j]
          const separated =
            a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x ||
            a.z + a.h + 1 <= b.z || b.z + b.h + 1 <= a.z
          expect(separated).toBe(true)
        }
      }
    }
  }, 30000)

  it('部屋は必ず 3 つ以上ある', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(generate_level(1, seed).rooms.length).toBeGreaterThanOrEqual(3)
    }
  }, 30000)

  it('部屋は外周 1 タイルを空けて収まる', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const room of generate_level(1, seed).rooms) {
        expect(room.x).toBeGreaterThanOrEqual(1)
        expect(room.z).toBeGreaterThanOrEqual(1)
        expect(room.x + room.w).toBeLessThanOrEqual(level_width - 1)
        expect(room.z + room.h).toBeLessThanOrEqual(level_height - 1)
      }
    }
  }, 30000)
})

describe('generate_level: 連結性', () => {
  it('1000 シードすべてで全床タイルが開始地点から到達可能', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const layout = generate_level(1, seed)
      const seen = reachable_from(layout)
      for (let i = 0; i < layout.tiles.length; i++) {
        const t = layout.tiles[i]
        if (t > 0 && t < 8) {
          expect(seen[i]).toBe(1)
        }
      }
    }
  }, 60000)
})

describe('generate_level: 壁', () => {
  // レビュー A-1: タイル 0（空）は _collides() が通行可能とみなす。
  // 床に隣接する空タイルが 1 つでも残ると自機がマップ外へ歩いて出る。
  it('床に 8 近傍で隣接する非床タイルはすべて壁になっている', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { tiles } = generate_level(1, seed)
      for (let z = 0; z < level_height; z++) {
        for (let x = 0; x < level_width; x++) {
          if (tiles[tile_index(x, z)] !== 0) { continue }
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              expect(is_floor(tiles, x + dx, z + dz)).toBe(false)
            }
          }
        }
      }
    }
  }, 30000)

  // レビュー A-2: 非床を全部壁で埋めると 2800〜3400 タイルになり
  // buffer_data.set() が RangeError を投げる（壁だけなら 2730 タイルが上限）
  it('頂点コストが renderer の予算を超えない', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(level_vert_cost(generate_level(1, seed).tiles)).toBeLessThanOrEqual(60000)
    }
  }, 60000)

  it('level_vert_cost は床 6 / 壁 24 で数える', () => {
    const tiles = new Uint8Array(level_width * level_height)
    tiles[0] = 1 // 床
    tiles[1] = 7 // 床
    tiles[2] = 8 // 壁
    tiles[3] = 17 // 壁
    expect(level_vert_cost(tiles)).toBe(6 * 2 + 24 * 2)
  })
})

describe('generate_level: 開始地点', () => {
  it('開始地点は床タイルの上にある', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(1, seed)
      expect(is_floor(layout.tiles, layout.start.x, layout.start.z)).toBe(true)
    }
  }, 30000)
})
