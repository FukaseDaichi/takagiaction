import { describe, expect, it } from 'vitest'
import {
  slash_duration, slash_head_angle, slash_head_time, slash_quads, slash_segments,
  slash_tile_core, slash_tile_glow,
} from './slash-model'

// 弧の中心を +x 方向、半角 1 rad、射程 20px に固定して性質を見る。
// 3D ビューの見た目は自動では確認できないので（Browser ペインで rAF が
// 止まる）、形が壊れていないことは数値の性質で押さえる
const angle = 0
const arc = 1
const reach = 20

function radius(x: number, z: number): number {
  return Math.sqrt(x * x + z * z)
}

describe('薙ぎの弧', () => {
  it('振り終わったら板を返さない', () => {
    expect(slash_quads(angle, arc, reach, 1, slash_duration + 0.001)).toHaveLength(0)
  })

  it('振っている間は帯を分割した板を返す', () => {
    expect(slash_quads(angle, arc, reach, 1, slash_head_time)).toHaveLength(slash_segments)
  })

  // 外周は刃先が通る円そのもの。ここが円でないと「弧を薙いだ」に見えない
  it('外周の 2 隅は射程の円上にある', () => {
    for (const q of slash_quads(angle, arc, reach, 1, 0.03)) {
      expect(radius(q.ax, q.az)).toBeCloseTo(reach)
      expect(radius(q.bx, q.bz)).toBeCloseTo(reach)
    }
  })

  // 内周は外周をえぐった三日月の内側。原点を越えると自機を貫いて見える
  it('内周の 2 隅は外周より内側で、原点より手前には来ない', () => {
    for (const q of slash_quads(angle, arc, reach, 1, 0.03)) {
      expect(radius(q.cx, q.cz)).toBeLessThan(reach)
      expect(radius(q.dx, q.dz)).toBeLessThan(reach)
      expect(radius(q.cx, q.cz)).toBeGreaterThan(0)
      expect(radius(q.dx, q.dz)).toBeGreaterThan(0)
    }
  })

  // 絵が判定より広いと、当たらない位置で当たったように見える
  it('板は判定の半角の外へ出ない', () => {
    for (let age = 0; age < slash_duration; age += 0.01) {
      for (const q of slash_quads(angle, arc, reach, 1, age)) {
        for (const [x, z] of [[q.ax, q.az], [q.bx, q.bz], [q.cx, q.cz], [q.dx, q.dz]]) {
          expect(Math.abs(Math.atan2(z, x) - angle)).toBeLessThanOrEqual(arc + 1e-9)
        }
      }
    }
  })

  it('刃先は弧の端から出て、slash_head_time で反対の端に届く', () => {
    expect(slash_head_angle(angle, arc, 1, 0)).toBeCloseTo(angle - arc)
    expect(slash_head_angle(angle, arc, 1, slash_head_time)).toBeCloseTo(angle + arc)
  })

  it('刃先は時間とともに一方向へ進む', () => {
    let last = slash_head_angle(angle, arc, 1, 0)
    for (let age = 0.005; age <= slash_head_time; age += 0.005) {
      const now = slash_head_angle(angle, arc, 1, age)
      expect(now).toBeGreaterThan(last)
      last = now
    }
  })

  // 1 振りごとに向きが反転する。連打が「同じ判子を押し続ける」ではなく
  // 「振り続けている」に見えるのはこの反転による
  it('向きを反転させると弧の鏡像になる', () => {
    const right = slash_quads(angle, arc, reach, 1, 0.03)
    const left = slash_quads(angle, arc, reach, -1, 0.03)
    expect(left).toHaveLength(right.length)
    for (let i = 0; i < right.length; i++) {
      expect(left[i].az).toBeCloseTo(-right[i].az)
      expect(left[i].ax).toBeCloseTo(right[i].ax)
    }
  })

  // 刃先が渡っている間だけ明るいコアを出し、渡り切ったら残光だけにする。
  // シェーダが a<0.8 を discard するのでアルファでは減衰させられない
  it('刃先が渡っている間は先頭がコア、渡り切ったら全部が残光になる', () => {
    const swinging = slash_quads(angle, arc, reach, 1, slash_head_time * 0.5)
    expect(swinging[swinging.length - 1].tile).toBe(slash_tile_core)
    expect(swinging[0].tile).toBe(slash_tile_glow)

    const trailing = slash_quads(angle, arc, reach, 1, slash_head_time + 0.02)
    for (const q of trailing) {
      expect(q.tile).toBe(slash_tile_glow)
    }
  })

  // 帯が刃先で最も太いと棍棒に見える。三日月は中ほどが太く、刃先が尖り、
  // 後端は細い尾になる
  it('帯は中ほどが最も太く、刃先は後端よりさらに細い', () => {
    const qs = slash_quads(angle, arc, reach, 1, slash_head_time)
    const tail_w = reach - radius(qs[0].cx, qs[0].cz)
    const mid_w = reach - radius(qs[3].cx, qs[3].cz)
    const head_w = reach - radius(qs[qs.length - 1].dx, qs[qs.length - 1].dz)
    expect(mid_w).toBeGreaterThan(tail_w)
    expect(mid_w).toBeGreaterThan(head_w)
    expect(head_w).toBeLessThan(tail_w)
  })

  // 刃先が端に着いたあとは後端が追いついて帯が縮む。縮みが減衰の代わり
  it('刃先が着いたあとは帯が短くなっていく', () => {
    const span = (age: number): number => {
      const qs = slash_quads(angle, arc, reach, 1, age)
      return Math.atan2(qs[qs.length - 1].bz, qs[qs.length - 1].bx) -
        Math.atan2(qs[0].az, qs[0].ax)
    }
    expect(span(slash_head_time + 0.02)).toBeGreaterThan(span(slash_head_time + 0.06))
  })
})
