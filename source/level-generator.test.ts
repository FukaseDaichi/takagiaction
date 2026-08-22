import { describe, expect, it } from 'vitest'
import {
  enemy_count, generate_level, level_bounds_side, level_vert_cost,
  reference_floor_tiles, room_count_range, sentry_count,
} from './level-generator'
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

describe('フロアの広さ', () => {
  it('生成範囲は深度 1 で 32、深度 10 で満寸の 62 になる', () => {
    expect(level_bounds_side(1)).toBe(32)
    expect(level_bounds_side(5)).toBe(45)
    expect(level_bounds_side(10)).toBe(62)
    expect(level_bounds_side(30)).toBe(62)
  })

  it('部屋数の範囲は深度 1 で 5〜6、深度 10 で 8〜12 になる', () => {
    expect(room_count_range(1)).toEqual({ min: 5, max: 6 })
    expect(room_count_range(5)).toEqual({ min: 6, max: 9 })
    expect(room_count_range(10)).toEqual({ min: 8, max: 12 })
    expect(room_count_range(30)).toEqual({ min: 8, max: 12 })
  })

  it('範囲も部屋数も深度に対して単調非減少で、min <= max を保つ', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(level_bounds_side(depth + 1))
        .toBeGreaterThanOrEqual(level_bounds_side(depth))
      expect(room_count_range(depth + 1).min)
        .toBeGreaterThanOrEqual(room_count_range(depth).min)
      expect(room_count_range(depth + 1).max)
        .toBeGreaterThanOrEqual(room_count_range(depth).max)
      expect(room_count_range(depth).min)
        .toBeLessThanOrEqual(room_count_range(depth).max)
    }
  })

  it('床タイルは生成範囲の内側に収まる', () => {
    for (const depth of [1, 5, 10, 20]) {
      const side = level_bounds_side(depth)
      for (let seed = 1; seed <= 200; seed++) {
        const { tiles } = generate_level(depth, seed)
        let min_x = level_width, max_x = -1
        let min_z = level_height, max_z = -1
        for (let i = 0; i < tiles.length; i++) {
          const x = i % level_width
          const z = (i / level_width) | 0
          if (!is_floor(tiles, x, z)) { continue }
          if (x < min_x) { min_x = x }
          if (x > max_x) { max_x = x }
          if (z < min_z) { min_z = z }
          if (z > max_z) { max_z = z }
        }
        expect(max_x - min_x + 1).toBeLessThanOrEqual(side)
        expect(max_z - min_z + 1).toBeLessThanOrEqual(side)
      }
    }
  }, 60000)

  it('浅い層のフロアは満寸のフロアより明らかに狭い', () => {
    // 1 シードでは間取りのばらつきに埋もれるので 100 シードの平均で見る
    const mean_floor_tiles = (depth: number): number => {
      let total = 0
      for (let seed = 1; seed <= 100; seed++) {
        for (const t of generate_level(depth, seed).tiles) {
          if (t > 0 && t < 8) { total++ }
        }
      }
      return total / 100
    }
    const shallow = mean_floor_tiles(1) // 実測 400
    const full = mean_floor_tiles(10) // 実測 1066
    expect(shallow).toBeLessThan(full * 0.5)
    expect(full).toBeGreaterThan(1000)
  }, 60000)
})

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
    for (const depth of [1, 5, 10, 30]) {
      for (let seed = 1; seed <= 200; seed++) {
        expect(generate_level(depth, seed).rooms.length).toBeGreaterThanOrEqual(3)
      }
    }
  }, 60000)

  it('部屋は外周 1 タイルを空けて収まる', () => {
    for (const depth of [1, 5, 10, 30]) {
      for (let seed = 1; seed <= 200; seed++) {
        for (const room of generate_level(depth, seed).rooms) {
          expect(room.x).toBeGreaterThanOrEqual(1)
          expect(room.z).toBeGreaterThanOrEqual(1)
          expect(room.x + room.w).toBeLessThanOrEqual(level_width - 1)
          expect(room.z + room.h).toBeLessThanOrEqual(level_height - 1)
        }
      }
    }
  }, 60000)
})

describe('generate_level: 連結性', () => {
  it('浅い層と満寸の両方で、全床タイルが開始地点から到達可能', () => {
    // 深度 1 は生成範囲が狭く、深度 10 は満寸。連結性は範囲に依存しないはずだが、
    // 一本鎖でつなぐ構築が範囲の端で崩れないことを両側で押さえる。
    for (const depth of [1, 10]) {
      for (let seed = 1; seed <= 500; seed++) {
        const layout = generate_level(depth, seed)
        const seen = reachable_from(layout)
        for (let i = 0; i < layout.tiles.length; i++) {
          const t = layout.tiles[i]
          if (t > 0 && t < 8) {
            expect(seen[i]).toBe(1)
          }
        }
      }
    }
  }, 60000)
})

describe('generate_level: 壁', () => {
  // レビュー A-1: タイル 0（空）は _collides() が通行可能とみなす。
  // 床に隣接する空タイルが 1 つでも残ると自機がマップ外へ歩いて出る。
  it('床に 8 近傍で隣接する非床タイルはすべて壁になっている', () => {
    // 素の expect で回すと数百万回に達し、このテスト 1 本で 2 分近くかかる。
    // 走査範囲は変えず、違反を見つけたときだけ記録する。
    // 深度 1 は床が狭いぶん空タイルが多いので、走査量は深度 10 より大きい。
    const violations: string[] = []
    for (const depth of [1, 10]) {
      for (let seed = 1; seed <= 150; seed++) {
        const { tiles } = generate_level(depth, seed)
        for (let z = 0; z < level_height; z++) {
          for (let x = 0; x < level_width; x++) {
            if (tiles[tile_index(x, z)] !== 0) { continue }
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (is_floor(tiles, x + dx, z + dz) && violations.length < 5) {
                  violations.push(
                    `深度 ${depth} seed ${seed}: 空タイル (${x},${z}) が床 (${x + dx},${z + dz}) に隣接`,
                  )
                }
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
  }, 60000)

  // レビュー A-2: 非床を全部壁で埋めると 2800〜3400 タイルになり
  // buffer_data.set() が RangeError を投げる（壁だけなら 2730 タイルが上限）。
  // 最悪ケースは満寸のフロアなので深度 10 で見る。
  it('頂点コストが renderer の予算を超えない', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(level_vert_cost(generate_level(10, seed).tiles)).toBeLessThanOrEqual(60000)
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

  // 浅い層でダミーを出すと、明滅するオレンジが複数あって片方はハズレという
  // 状態になり、フロアを狭めても探索の空振りだけが残る。深度 1〜4 は
  // 明滅するオレンジが 1 点だけ = 本物になる。
  // レビュー B-8: 空き部屋数でクランプしないと部屋数の少ないシードで足りなくなる
  it('ダミーは深度 5 から出る。数は min(floor(深度/5), 3) を上限とし、空き部屋数でも抑えられる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 4, 5, 9, 10, 14, 15, 40]) {
        const layout = generate_level(depth, seed)
        const want = Math.min(Math.floor(depth / 5), 3)
        const available = layout.rooms.length - 3 // 開始・喫煙所・非常口を除く
        expect(layout.dummies.length).toBe(Math.max(0, Math.min(want, available)))
      }
    }
  }, 60000)

  it('深度 1〜4 にダミーは 1 つも出ない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 2, 3, 4]) {
        expect(generate_level(depth, seed).dummies.length).toBe(0)
      }
    }
  }, 60000)

  // 深度で生成範囲そのものが変わるため、同一シードの深度間比較は成立しない
  // （同じ seed でも間取りが別物になる）。「潜るほど喫煙所が遠い」は
  // 100 シード平均の性質として検証する。
  it('深度が上がるほど喫煙所が遠くなる（100 シード平均で単調非減少）', () => {
    let last = -1
    for (const depth of [1, 3, 6, 9, 12, 15, 30]) {
      let total = 0
      for (let seed = 1; seed <= 100; seed++) {
        const layout = generate_level(depth, seed)
        total += bfs_distance_near(layout, layout.smoking_area)
      }
      const mean = total / 100
      expect(mean).toBeGreaterThanOrEqual(last)
      last = mean
    }
  }, 60000)
})

describe('敵の総数', () => {
  // レビュー A-3: 既存の式は深度 8 で当選率 100%、深度 9 以降で非単調になる
  it('深度が上がると単調非減少で、上限で頭打ちになる', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(enemy_count(depth + 1, reference_floor_tiles))
        .toBeGreaterThanOrEqual(enemy_count(depth, reference_floor_tiles))
      expect(sentry_count(depth + 1)).toBeGreaterThanOrEqual(sentry_count(depth))
    }
    expect(enemy_count(1000, reference_floor_tiles)).toBe(100)
    expect(sentry_count(1000)).toBe(10)
  })

  it('満寸のフロアでは深度 1 が 34 体、うちセントリー 1 体', () => {
    expect(enemy_count(1, reference_floor_tiles)).toBe(34)
    expect(sentry_count(1)).toBe(1)
  })

  it('床タイル数に比例する', () => {
    expect(enemy_count(1, reference_floor_tiles / 2)).toBe(17)
    expect(enemy_count(10, reference_floor_tiles / 2)).toBe(35)
  })

  // 上限は按分のあとに掛ける。先に掛けると、床タイル数が基準を上回るフロアで
  // 按分が上限を押し上げ、100 を超えうる。上限は O(n²) の衝突判定を守る要件。
  it('床タイル数が基準を上回っても上限 100 を超えない', () => {
    expect(enemy_count(30, reference_floor_tiles * 2)).toBe(100)
    expect(enemy_count(200, reference_floor_tiles * 10)).toBe(100)
  })
})

describe('generate_level: 配置', () => {
  it('敵とアイテムは床タイルの上にあり、互いに重ならない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      const all = [
        ...layout.spiders, ...layout.sentries, ...layout.health,
        ...layout.yani, ...layout.drones,
      ]
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
      for (const p of [
        ...layout.spiders, ...layout.sentries, ...layout.health,
        ...layout.yani, ...layout.drones,
      ]) {
        expect(bfs_distance_floor(layout, p)).toBeGreaterThanOrEqual(8)
      }
    }
  }, 60000)

  it('敵の総数は床タイル数から決まる予算を超えない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 10, 30]) {
        const layout = generate_level(depth, seed)
        let floor_tiles = 0
        for (const t of layout.tiles) { if (t > 0 && t < 8) { floor_tiles++ } }
        expect(layout.spiders.length + layout.sentries.length)
          .toBeLessThanOrEqual(enemy_count(depth, floor_tiles))
        expect(layout.sentries.length).toBeLessThanOrEqual(sentry_count(depth))
      }
    }
  }, 60000)

  // フロアを狭めたぶん体数を減らさないと、浅い層ほど敵密度が上がって
  // 難易度緩和にならない（狭くする前の深度 1 は 1090 タイルに 34 体 = 1/32）
  it('敵の密度は狭くする前と変わらない', () => {
    for (const depth of [1, 5, 10]) {
      let enemies = 0
      let floors = 0
      for (let seed = 1; seed <= 100; seed++) {
        const layout = generate_level(depth, seed)
        enemies += layout.spiders.length + layout.sentries.length
        for (const t of layout.tiles) { if (t > 0 && t < 8) { floors++ } }
      }
      const before = enemy_count(depth, reference_floor_tiles) / reference_floor_tiles
      expect(enemies / floors).toBeGreaterThan(before * 0.95)
      expect(enemies / floors).toBeLessThan(before * 1.05)
    }
  }, 60000)

  it('体力回復アイテムは 2〜4 個', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(3, seed)
      expect(layout.health.length).toBeGreaterThanOrEqual(2)
      expect(layout.health.length).toBeLessThanOrEqual(4)
    }
  }, 30000)

  it('ヤニは 1〜3 個で床タイルの上にある', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(3, seed)
      expect(layout.yani.length).toBeGreaterThanOrEqual(1)
      expect(layout.yani.length).toBeLessThanOrEqual(3)
      for (const p of layout.yani) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
      }
    }
  }, 30000)

  it('清掃ドローンは 0〜1 体で、まれに（おおよそ 1/4 のフロアに）出る', () => {
    let floors_with_drone = 0
    for (let seed = 1; seed <= 400; seed++) {
      const layout = generate_level(3, seed)
      expect(layout.drones.length).toBeLessThanOrEqual(1)
      for (const p of layout.drones) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
      }
      floors_with_drone += layout.drones.length
    }
    expect(floors_with_drone).toBeGreaterThanOrEqual(400 * 0.15)
    expect(floors_with_drone).toBeLessThanOrEqual(400 * 0.35)
  }, 60000)
})
