import { describe, expect, it } from 'vitest'
import { generate_level, level_vert_cost, enemy_budget, sentry_count } from './level-generator'
import type { level_layout_t, tile_pos_t } from './level-generator'
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

// 開始地点から p の 8 近傍で最も近い床タイルまでの BFS 距離。
// 目標地点そのものは壁なので、隣接する床までの距離で測る。
function bfs_distance_near(layout: level_layout_t, p: tile_pos_t): number {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  dist[queue[0]] = 0
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = dist[index] + 1
      queue.push(n)
    }
  }
  // 直交 4 近傍だけを見る。BFS が 4 連結なので、壁になった目標地点の直交隣接
  // タイルの距離は必ず「そこが床だったときの距離 - 1」になる。対角を混ぜると
  // -2 のタイルが紛れ込んで測定値が ±1 ぶれ、深度ごとの単調性の検証が誤検出する。
  let best = Number.MAX_SAFE_INTEGER
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = dist[tile_index(p.x + dx, p.z + dz)]
    if (d >= 0 && d < best) { best = d }
  }
  return best
}

// 床タイルそのものへの BFS 距離（bfs_distance_near は壁の目標地点用）
function bfs_distance_floor(layout: level_layout_t, p: tile_pos_t): number {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(layout.start.x, layout.start.z)]
  dist[queue[0]] = 0
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor(layout.tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = dist[index] + 1
      queue.push(n)
    }
  }
  return dist[tile_index(p.x, p.z)]
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
    // 300 シード × 約 1600 空タイル × 9 近傍を素の expect で回すと 430 万回を超え、
    // このテスト 1 本で 2 分近くかかる。走査範囲は変えず、違反を見つけたときだけ記録する。
    const violations: string[] = []
    for (let seed = 1; seed <= 300; seed++) {
      const { tiles } = generate_level(1, seed)
      for (let z = 0; z < level_height; z++) {
        for (let x = 0; x < level_width; x++) {
          if (tiles[tile_index(x, z)] !== 0) { continue }
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (is_floor(tiles, x + dx, z + dz) && violations.length < 5) {
                violations.push(
                  `seed ${seed}: 空タイル (${x},${z}) が床 (${x + dx},${z + dz}) に隣接`,
                )
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
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

describe('generate_level: 目標地点', () => {
  it('喫煙所・ダミー・非常口は互いに別のタイル', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const depth of [1, 5, 12, 30]) {
        const layout = generate_level(depth, seed)
        const all = [layout.smoking_area, layout.exit, ...layout.dummies]
          .map((p) => tile_index(p.x, p.z))
        expect(new Set(all).size).toBe(all.length)
      }
    }
  }, 60000)

  // 設計書 §5: 非常口が開始部屋と同一になると詰む
  it('非常口は開始地点と別のタイル', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const depth of [1, 5, 12, 30]) {
        const layout = generate_level(depth, seed)
        expect(tile_index(layout.exit.x, layout.exit.z))
          .not.toBe(tile_index(layout.start.x, layout.start.z))
      }
    }
  }, 60000)

  // 設計書 §2「深度から整数を得ること」: floor を忘れると部屋[3.333] が
  // undefined になり深度 1 でランが詰む
  it('深度 1 でも喫煙所が定義されている', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(1, seed)
      expect(Number.isInteger(layout.smoking_area.x)).toBe(true)
      expect(Number.isInteger(layout.smoking_area.z)).toBe(true)
    }
  }, 30000)

  it('目標地点のタイルは壁になっている（見た目はエンティティが描く）', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const layout = generate_level(8, seed)
      for (const p of [layout.smoking_area, layout.exit, ...layout.dummies]) {
        expect(layout.tiles[tile_index(p.x, p.z)]).toBeGreaterThan(7)
      }
    }
  }, 30000)

  it('目標地点はすべて開始地点から到達できる', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const layout = generate_level(8, seed)
      for (const p of [layout.smoking_area, layout.exit, ...layout.dummies]) {
        expect(bfs_distance_near(layout, p)).toBeLessThan(Number.MAX_SAFE_INTEGER)
      }
    }
  }, 60000)

  // レビュー B-8: 空き部屋数でクランプしないと深度 12 以降で足りなくなる
  it('ダミー数は min(1 + floor(深度/4), 3) を上限とし、空き部屋数でも抑えられる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 4, 8, 12, 40]) {
        const layout = generate_level(depth, seed)
        const want = Math.min(1 + Math.floor(depth / 4), 3)
        const available = layout.rooms.length - 3 // 開始・喫煙所・非常口を除く
        expect(layout.dummies.length).toBe(Math.max(0, Math.min(want, available)))
      }
    }
  }, 60000)

  it('同一シード内では深度が上がるほど喫煙所が遠くなる（単調非減少）', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let last = -1
      for (const depth of [1, 3, 6, 9, 12, 15, 30]) {
        const layout = generate_level(depth, seed)
        const d = bfs_distance_near(layout, layout.smoking_area)
        expect(d).toBeGreaterThanOrEqual(last)
        last = d
      }
    }
  }, 60000)
})

describe('敵の総数', () => {
  // レビュー A-3: 既存の式は深度 8 で当選率 100%、深度 9 以降で非単調になる
  it('深度が上がると単調非減少で、上限で頭打ちになる', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(enemy_budget(depth + 1)).toBeGreaterThanOrEqual(enemy_budget(depth))
      expect(sentry_count(depth + 1)).toBeGreaterThanOrEqual(sentry_count(depth))
    }
    expect(enemy_budget(1000)).toBe(100)
    expect(sentry_count(1000)).toBe(10)
  })

  it('深度 1 は敵 34 体、うちセントリー 1 体', () => {
    expect(enemy_budget(1)).toBe(34)
    expect(sentry_count(1)).toBe(1)
  })
})

describe('generate_level: 配置', () => {
  it('敵とアイテムは床タイルの上にあり、互いに重ならない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      const all = [...layout.spiders, ...layout.sentries, ...layout.health]
      for (const p of all) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
      }
      const indices = all.map((p) => tile_index(p.x, p.z))
      expect(new Set(indices).size).toBe(indices.length)
    }
  }, 60000)

  // 既存の「開始位置周辺 64px 以内は除外」を BFS 距離 8 タイルに置き換えたもの
  it('敵とアイテムは開始地点から 8 タイル以上離れている', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      for (const p of [...layout.spiders, ...layout.sentries, ...layout.health]) {
        expect(bfs_distance_floor(layout, p)).toBeGreaterThanOrEqual(8)
      }
    }
  }, 60000)

  it('敵の総数は予算を超えない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 10, 30]) {
        const layout = generate_level(depth, seed)
        expect(layout.spiders.length + layout.sentries.length)
          .toBeLessThanOrEqual(enemy_budget(depth))
        expect(layout.sentries.length).toBeLessThanOrEqual(sentry_count(depth))
      }
    }
  }, 60000)

  it('体力回復アイテムは 2〜4 個', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(3, seed)
      expect(layout.health.length).toBeGreaterThanOrEqual(2)
      expect(layout.health.length).toBeLessThanOrEqual(4)
    }
  }, 30000)
})
