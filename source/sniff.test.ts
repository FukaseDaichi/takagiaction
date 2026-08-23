import { describe, expect, it } from 'vitest'
import { sniff_find } from './sniff'
import { level_height, level_width } from './state'

function make_tiles(): Uint8Array {
  return new Uint8Array(level_width * level_height)
}

describe('嗅覚の残り香探索', () => {
  it('通路の先の目標への方角と BFS 距離を返す', () => {
    const tiles = make_tiles()
    // z=1 の横一列に床。目標タイル (10,1) は生成器と同じく壁（8）
    for (let x = 1; x <= 20; x++) { tiles[x + level_width] = 1 }
    tiles[10 + level_width] = 8

    const r = sniff_find(tiles, 1, 1, [{ x: 10, z: 1 }])!
    expect(r).not.toBeNull()
    expect(r.dist).toBe(9) // 隣接床 (9,1) まで 8 歩 + 1
    expect(r.angle).toBeCloseTo(0, 6) // 真東
    expect(r.path_angle).toBeCloseTo(0, 6) // 一直線なので angle と一致する
  })

  it('ユークリッド距離ではなく BFS 距離で最寄りを選ぶ', () => {
    const tiles = make_tiles()
    // z=1 と z=3 の平行な通路。x=20 でだけ縦につながる
    for (let x = 1; x <= 20; x++) {
      tiles[x + 1 * level_width] = 1
      tiles[x + 3 * level_width] = 1
    }
    tiles[20 + 2 * level_width] = 1
    // 目標A (2,3): 直線距離 2 だが、経路は x=20 経由の大回り
    tiles[2 + 3 * level_width] = 8
    // 目標B (15,0): 直線距離 14 だが、通路沿いですぐ（隣接床 (15,1)）
    tiles[15 + 0 * level_width] = 8

    const r = sniff_find(tiles, 1, 1, [{ x: 2, z: 3 }, { x: 15, z: 0 }])!
    expect(r.dist).toBe(15) // 目標B: (15,1) まで 14 歩 + 1
    expect(r.angle).toBeCloseTo(Math.atan2(0 - 1, 15 - 1), 6)
  })

  it('どの目標にも到達できなければ null', () => {
    const tiles = make_tiles()
    for (let x = 1; x <= 5; x++) { tiles[x + level_width] = 1 }
    // 目標 (30,30) の周囲は虚空
    const r = sniff_find(tiles, 1, 1, [{ x: 30, z: 30 }])
    expect(r).toBeNull()
  })

  // レビュー Finding 4c: 目標が x=0 にあると隣接候補の nx が -1 になる。
  // 範囲チェックが無いと添字 -1 + nz*64 が前の行の末尾（x=63）を指し、
  // まったく別の場所の距離で最寄りを決めてしまう。
  it('左端の目標では隣接候補が前の行へ回り込まない', () => {
    const tiles = make_tiles()
    // z=1 の x=1..63 が横一列の通路。自機は (63,0) にいて (63,1) で通路へ繋がる
    for (let x = 1; x < level_width; x++) { tiles[x + level_width] = 1 }
    tiles[level_width - 1] = 1 // (63,0)
    tiles[0 + level_width] = 8 // 目標 (0,1) は生成器と同じく壁
    // 目標の上下 (0,0) / (0,2) は虚空のままにして、床の隣接候補を (1,1) だけに絞る

    const r = sniff_find(tiles, level_width - 1, 0, [{ x: 0, z: 1 }])!
    // (63,0) → (63,1) → 左へ 62 歩で (1,1)。その 63 歩 + 1。
    // 回り込むと自機のタイル (63,0) の距離 0 を拾って 1 になる
    expect(r.dist).toBe(64)
  })

  // Lv3 の価値そのもの: ユークリッド角は壁を指すが、経路の第一歩は通路を指す
  it('L 字の通路では path_angle が通路の入口を指し、angle と食い違う', () => {
    const tiles = make_tiles()
    // 自機 (1,1) → 東へ (10,1) → 南へ (10,5) → 西へ (2,5) の 3 辺の通路。
    // 目標 (1,5) は直線では真南だが、経路の第一歩は真東になる
    for (let x = 1; x <= 10; x++) { tiles[x + 1 * level_width] = 1 }
    for (let z = 1; z <= 5; z++) { tiles[10 + z * level_width] = 1 }
    for (let x = 2; x <= 10; x++) { tiles[x + 5 * level_width] = 1 }
    tiles[1 + 5 * level_width] = 8 // 目標は生成器と同じく壁

    const r = sniff_find(tiles, 1, 1, [{ x: 1, z: 5 }])!
    expect(r.dist).toBe(22) // 隣接床 (2,5) まで 21 歩 + 1
    expect(r.angle).toBeCloseTo(Math.PI / 2, 6) // 真南（壁の向こう）
    expect(r.path_angle).toBeCloseTo(0, 6) // 真東（通路の入口）
  })

  // ループ境界の変異を殺す: 第 1 レグを 1 タイルだけにして、1 歩ずれると
  // 別方向のセグメントに落ちる配置にする。d > 0 なら自機タイルに乗って
  // atan2(0,0) = 0、d > 2 なら 1 歩手前で -π/4 になり、どちらも落ちる
  it('第一歩が 1 タイルで折れる通路でも path_angle が第一歩を指す', () => {
    const tiles = make_tiles()
    // 自機 (5,5) → 北へ 1 歩 (5,4) → 東へ (9,4)。目標 (10,4) は壁
    tiles[5 + 5 * level_width] = 1
    for (let x = 5; x <= 9; x++) { tiles[x + 4 * level_width] = 1 }
    tiles[10 + 4 * level_width] = 8

    const r = sniff_find(tiles, 5, 5, [{ x: 10, z: 4 }])!
    expect(r.dist).toBe(6) // 隣接床 (9,4) まで 5 歩 + 1
    expect(r.path_angle).toBeCloseTo(-Math.PI / 2, 6) // 真北（第一歩）
  })

  it('自機が目標に隣接していると path_angle は angle にフォールバックする', () => {
    const tiles = make_tiles()
    tiles[1 + level_width] = 1 // 自機 (1,1)
    tiles[2 + level_width] = 8 // 目標 (2,1)。周囲の床は自機タイルだけ

    const r = sniff_find(tiles, 1, 1, [{ x: 2, z: 1 }])!
    expect(r.dist).toBe(1)
    expect(r.angle).toBeCloseTo(0, 6)
    expect(r.path_angle).toBe(r.angle)
  })

  it('目標が空なら null', () => {
    const tiles = make_tiles()
    tiles[1 + level_width] = 1
    expect(sniff_find(tiles, 1, 1, [])).toBeNull()
  })
})
