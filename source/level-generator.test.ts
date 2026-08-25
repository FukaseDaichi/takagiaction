import { describe, expect, it } from 'vitest'
import { boss_hitbox } from './boss-model'
import {
  arena_side, enemy_count, generate_level, is_boss_depth, level_bounds_side,
  level_vert_cost, reference_floor_tiles, room_count_range, sentry_count,
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

// 深度が 5 の倍数のフロアはボス階（1 部屋の闘技場）になるため、通常フロアの
// 性質を検査する it は 5 の倍数を避けた深度で回す。深度 10 以上は広さ・部屋数・
// ダミー数がすべて頭打ちで、間取りは深度ではなくシードだけで決まるため、
// 通常フロアとして生成する限り 10 と 11 の tiles は同一で、読み替えても
// 同じ検査が保てる（読み替えたあとの深度 10 自体は闘技場になる）。
// 闘技場そのものの性質は末尾の「ボス階の闘技場」で検査する。

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
    for (const depth of [1, 6, 11, 21]) {
      const side = level_bounds_side(depth)
      // 範囲は盤面中央に寄せる（place_rooms() の x0 / z0 と同じ式）。
      // サイズだけでなく位置も見ないと、中央寄せを落とす回帰
      // （例: x0 を無条件に 1 にする）を素通しさせてしまう。
      const x0 = 1 + ((level_width - 2 - side) >> 1)
      const z0 = 1 + ((level_height - 2 - side) >> 1)
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
        expect(min_x).toBeGreaterThanOrEqual(x0)
        expect(max_x).toBeLessThanOrEqual(x0 + side - 1)
        expect(min_z).toBeGreaterThanOrEqual(z0)
        expect(max_z).toBeLessThanOrEqual(z0 + side - 1)
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
    const shallow = mean_floor_tiles(1) // 実測 400.93
    const full = mean_floor_tiles(11) // 実測 1067.18
    expect(shallow).toBeLessThan(full * 0.5)
    expect(full).toBeGreaterThan(1000)
  }, 60000)
})

// tiles 用の簡易チェックサム（FNV-1a, 32bit）。tsconfig.json は "types": []
// で node の型を読み込んでおらず @types/node も入っていないため、
// node:crypto は使わない。変化を検出できれば十分で暗号学的な強度は要らない。
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// 深度 15 以上は、範囲導入（level_bounds_side）とダミー喫煙所の目標数
// （min(floor(深度/5), 3)）がどちらも旧実装と一致する深度で、docs/gameplay.md
// 「フロアの広さは深度で開く」はここを「間取りは変えない」と明記している。
// この不変条件は移行時に base リビジョンと 600 レイアウトを手で比較して
// 確認されたが、その指紋がリポジトリに残っていなかった。ここで固定し、
// 今後の変更が深度 15 以上の間取りを意図せず変えたら検出できるようにする。
//
// 深度 10〜14 は対象にしない。ダミーの目標数が旧実装（1 + floor(深度/4)、
// 深度 8 で 3 に到達）と現行（floor(深度/5)、深度 15 で 3 に到達）で
// 一致しない区間があり、ダミーは床タイルを壁（タイル値 8）へ変えるため、
// tiles にダミーセルぶんの差が出る。これは意図した変更なので、
// golden にすると意図した差を回帰として検出してしまう。
//
// 5 の倍数はボス階（闘技場）なので避け、1 つ深い深度で見る。深度 15 以上は
// 広さ・部屋数・ダミー数がすべて頭打ちで間取りがシードだけで決まるため、
// 深度 16 / 21 / 31 / 51 / 101 の tiles は、通常フロアだった頃の
// 15 / 20 / 30 / 50 / 100 とバイト単位で同一 — 指紋の値は動いていない。
describe('generate_level: 深度 15 以上の間取りの指紋', () => {
  it('固定した (depth, seed) の tiles のチェックサムが変わらない', () => {
    // 値は現行コードから生成したもの（値そのものに意味はない）。
    // source/random.test.ts が旧 random.js の出力列を固定するのと同じ作法。
    const golden: [number, number, string][] = [
      [16, 1, '60b2f848'],
      [16, 7, '800d1652'],
      [21, 3, '6396da19'],
      [31, 2, 'b1980a04'],
      [51, 42, '25499d0e'],
      [101, 999, '99c18502'],
    ]
    for (const [depth, seed, expected] of golden) {
      const { tiles } = generate_level(depth, seed)
      expect(fnv1a(tiles)).toBe(expected)
    }
  })
})

describe('generate_level: 決定性', () => {
  it('同じ深度とシードからは同じ間取りが出る', () => {
    const a = generate_level(6, 12345)
    const b = generate_level(6, 12345)
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles))
    expect(b.rooms).toEqual(a.rooms)
    expect(b.start).toEqual(a.start)
  })

  it('シードが違えば間取りが変わる', () => {
    const a = generate_level(6, 1)
    const b = generate_level(6, 2)
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
    for (const depth of [1, 6, 11, 31]) {
      for (let seed = 1; seed <= 200; seed++) {
        expect(generate_level(depth, seed).rooms.length).toBeGreaterThanOrEqual(3)
      }
    }
  }, 60000)

  it('部屋は外周 1 タイルを空けて収まる', () => {
    for (const depth of [1, 6, 11, 31]) {
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
    // 深度 1 は生成範囲が狭く、深度 11 は満寸。連結性は範囲に依存しないはずだが、
    // 一本鎖でつなぐ構築が範囲の端で崩れないことを両側で押さえる。
    for (const depth of [1, 11]) {
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
    // 深度 1 は床が狭いぶん空タイルが多いので、走査量は深度 11 より大きい。
    // 深度 5 の闘技場も同じ build_walls を通るので、ここで一緒に押さえる。
    const violations: string[] = []
    for (const depth of [1, 5, 11]) {
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
  // 最悪ケースは満寸のフロアなので深度 11 で見る。
  it('頂点コストが renderer の予算を超えない', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(level_vert_cost(generate_level(11, seed).tiles)).toBeLessThanOrEqual(60000)
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
      for (const depth of [1, 6, 12, 31]) {
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
      for (const depth of [1, 6, 12, 31]) {
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
  it('通常フロアのダミーは深度 6 から出る。数は min(floor(深度/5), 3) を上限とし、空き部屋数でも抑えられる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      // 5 の倍数ちょうどはボス階でダミーを置かないので、閾値は 4 と 6 で見る
      for (const depth of [1, 4, 6, 9, 11, 14, 16, 41]) {
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
    for (const depth of [1, 3, 6, 9, 12, 16, 31]) {
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
      const layout = generate_level(11, seed)
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
      const layout = generate_level(11, seed)
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
      for (const depth of [1, 11, 31]) {
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
    for (const depth of [1, 6, 11]) {
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

describe('ボス階の闘技場', () => {
  it('5 の倍数だけがボス階である', () => {
    expect(is_boss_depth(5)).toBe(true)
    expect(is_boss_depth(10)).toBe(true)
    expect(is_boss_depth(4)).toBe(false)
    expect(is_boss_depth(6)).toBe(false)
  })

  it('ボスと本物の喫煙所が盤面中央の同じタイルに立つ', () => {
    const layout = generate_level(5, 12345)
    expect(layout.boss).toEqual({ x: level_width >> 1, z: level_height >> 1 })
    expect(layout.smoking_area).toEqual(layout.boss)
  })

  it('通常フロアには boss が無い', () => {
    const layout = generate_level(6, 12345)
    expect(layout.boss).toBe(null)
    expect(layout.boss_spin).toBe(0)
  })

  it('雑魚・ダミー・床のヤニ・ドローンを置かない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(5, seed)
      expect(layout.spiders.length).toBe(0)
      expect(layout.sentries.length).toBe(0)
      expect(layout.dummies.length).toBe(0)
      expect(layout.yani.length).toBe(0)
      expect(layout.drones.length).toBe(0)
      expect(layout.health.length).toBeGreaterThanOrEqual(2)
      expect(layout.health.length).toBeLessThanOrEqual(4)
    }
  }, 30000)

  // ヘルスパックは通常フロアと同じ spawn_min_distance を流用する。開始の隅から
  // すぐ届く位置に湧くと、掃射の合間に取りに動くかという判断が消える
  it('ヘルスパックは開始地点から 8 タイル以上離れた床の上にある', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(5, seed)
      for (const p of layout.health) {
        expect(is_floor(layout.tiles, p.x, p.z)).toBe(true)
        expect(bfs_distance_floor(layout, p)).toBeGreaterThanOrEqual(8)
      }
    }
  }, 30000)

  // 隅を 1 つに固定する回帰は対角の検査を素通りする（対角の関係は固定された
  // 隅でも成り立つ）。4 通りすべてが出ることをここで押さえる
  it('開始地点は 4 隅のいずれかで、シードによって 4 通りすべてが出る', () => {
    const cx = level_width >> 1
    const cz = level_height >> 1
    const half = arena_side >> 1
    const corners = new Set([
      `${cx - half + 2},${cz - half + 2}`,
      `${cx + half - 2},${cz - half + 2}`,
      `${cx + half - 2},${cz + half - 2}`,
      `${cx - half + 2},${cz + half - 2}`,
    ])
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      const { start } = generate_level(5, seed)
      const key = `${start.x},${start.z}`
      expect(corners.has(key)).toBe(true)
      seen.add(key)
    }
    expect(seen.size).toBe(4)
  }, 30000)

  it('開始地点と非常口が対角の隅にある', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(10, seed)
      expect(Math.abs(layout.start.x - layout.exit.x)).toBe(arena_side - 5)
      expect(Math.abs(layout.start.z - layout.exit.z)).toBe(arena_side - 5)
    }
  }, 30000)

  it('回転の向きは ±1 で、シードによって両方が出る', () => {
    const spins = new Set<number>()
    for (let seed = 1; seed <= 200; seed++) {
      spins.add(generate_level(5, seed).boss_spin)
    }
    expect([...spins].sort()).toEqual([-1, 1])
  }, 30000)

  it('1000 シードで全床タイルが開始地点から到達できる', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const layout = generate_level(5, seed)
      const seen = reachable_from(layout)
      for (let i = 0; i < layout.tiles.length; i++) {
        const x = i % level_width
        const z = (i / level_width) | 0
        if (is_floor(layout.tiles, x, z)) { expect(seen[i]).toBe(1) }
      }
    }
  }, 60000)

  // 柱の座標そのものは仕様ではない（2×2 は偶数辺なので中心タイルに対する
  // 厳密な鏡像が取れない）。仕様は不変条件のほうで、灰皿と柱の間で潰されない・
  // 柱の裏へ回り込めるの 2 点をここで、連結性を上の 1000 シードで見る
  it('柱は中央の灰皿にも外周の輪郭壁にも接しない', () => {
    const cx = level_width >> 1
    const cz = level_height >> 1
    const half = arena_side >> 1
    for (let seed = 1; seed <= 200; seed++) {
      const layout = generate_level(5, seed)
      let pillar_tiles = 0
      for (let z = cz - half; z <= cz + half; z++) {
        for (let x = cx - half; x <= cx + half; x++) {
          // 闘技場の内側で床でないのは、中央の灰皿・隅の非常口・柱だけ。
          // 前の 2 つを除いた残りが柱である
          if (is_floor(layout.tiles, x, z)) { continue }
          if (x === cx && z === cz) { continue }
          if (x === layout.exit.x && z === layout.exit.z) { continue }
          pillar_tiles++
          // 柱のタイル: 中央からも外周からも 1 タイル以上離れていること
          expect(Math.max(Math.abs(x - cx), Math.abs(z - cz))).toBeGreaterThan(1)
          expect(Math.abs(x - cx)).toBeLessThan(half - 1)
          expect(Math.abs(z - cz)).toBeLessThan(half - 1)
        }
      }
      // 8 本 × 2×2 = 32 タイル。柱が重なる・盤外へ出ると減る
      expect(pillar_tiles).toBe(32)
    }
  }, 30000)

  it('頂点コストが上限に収まる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(level_vert_cost(generate_level(5, seed).tiles)).toBeLessThan(60000)
    }
  }, 30000)
})

// 4 つ目の不変条件。ボスは闘技場を動き回るので、判定 14×14 が隣接する柱の
// 隙間を通れなければリングの内側に閉じ込められる。柱の本数・半径・大きさを
// 触った人がこれを壊せるので、座標ではなく「通れること」で固定する。
// 座席（中央の灰皿）は壁タイルだがボスは通過できる（entity-boss.ts の免除）
describe('闘技場: ボスがリングの内外を行き来できる', () => {
  // 1px 刻みの占有格子をスタックで探索する（深さ優先。走査順は結果に
  // 影響しないので幅優先である必要はない）。生成位置から出発し、灰皿の
  // 中心から 70px（目標半径の上限）より遠い位置に到達できることを見る
  function boss_can_reach(radius: number): boolean {
    const layout = generate_level(5, 12345)
    const tiles = layout.tiles
    const home_tx = layout.boss!.x
    const home_tz = layout.boss!.z
    const home_x = home_tx * 8 + 4
    const home_z = home_tz * 8 + 4

    // 回転しながら連続軌道で抜ける実機は、隙間を狙って一直線に通すことが
    // できない。判定そのものと同じ幅の余白があって初めて、狙わなくても
    // 通れる太さになる（片側半分ずつの余白で判定 1 個ぶん）ので、実効幅は
    // 判定の 2 倍にする。半径 6 の最大通過幅は実測 23px、半径 8 は実測 39px
    // で、判定の 2 倍（28px）はその間を余裕を持って弁別する
    const clearance = boss_hitbox * 2

    const free = (x: number, z: number): boolean => {
      const x1 = (x + clearance) >> 3
      const z1 = (z + clearance) >> 3
      for (let tz = z >> 3; tz <= z1; tz++) {
        for (let tx = x >> 3; tx <= x1; tx++) {
          if (tx === home_tx && tz === home_tz) { continue }
          if (tiles[tx + tz * level_width] > 7) { return false }
        }
      }
      return true
    }

    const start_x = home_tx * 8 - 3
    const start_z = home_tz * 8 - 3
    const half = arena_side >> 1
    const min_x = (home_tx - half) * 8
    const min_z = (home_tz - half) * 8
    const span = arena_side * 8
    const seen = new Uint8Array(span * span)
    const key = (x: number, z: number) => (x - min_x) + (z - min_z) * span
    const queue: Array<[number, number]> = [[start_x, start_z]]
    seen[key(start_x, start_z)] = 1

    while (queue.length) {
      const [x, z] = queue.pop()!
      const dx = x + boss_hitbox / 2 - home_x
      const dz = z + boss_hitbox / 2 - home_z
      if (Math.sqrt(dx * dx + dz * dz) > radius) { return true }
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < min_x || nz < min_z || nx >= min_x + span || nz >= min_z + span) {
          continue
        }
        const k = key(nx, nz)
        if (seen[k]) { continue }
        seen[k] = 1
        if (free(nx, nz)) { queue.push([nx, nz]) }
      }
    }
    return false
  }

  it('生成位置から灰皿中心 70px 超の位置まで到達できる', () => {
    expect(boss_can_reach(70)).toBe(true)
  })
})
