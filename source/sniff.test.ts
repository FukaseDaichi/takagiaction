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

  it('目標が空なら null', () => {
    const tiles = make_tiles()
    tiles[1 + level_width] = 1
    expect(sniff_find(tiles, 1, 1, [])).toBeNull()
  })
})
