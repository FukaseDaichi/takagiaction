import { describe, expect, it } from 'vitest'
import {
  body_height, body_parts, body_stow_position, body_stow_ratio, body_width,
  gear_anchors, organ_svg,
} from './body-figure'
import { meta_upgrade_ids } from './meta'
import { gear_slots } from './equipment'

// body.webp（256×512）の線の bbox。tools で実測した値で、アンカーが身体から
// 外れていないことの基準になる
const bbox = { x0: 48, x1: 208, y0: 14, y1: 491 }

describe('人体模型のジオメトリ', () => {
  it('6 部位が強化 6 種と 1:1 で対応する', () => {
    expect(body_parts.length).toBe(meta_upgrade_ids.length)
    expect([...body_parts.map((p) => p.id)].sort())
      .toEqual([...meta_upgrade_ids].sort())
  })

  it('アンカーは body.webp の線の内側にある', () => {
    for (const p of body_parts) {
      expect(p.ax, p.label).toBeGreaterThanOrEqual(bbox.x0)
      expect(p.ax, p.label).toBeLessThanOrEqual(bbox.x1)
      expect(p.ay, p.label).toBeGreaterThanOrEqual(bbox.y0)
      expect(p.ay, p.label).toBeLessThanOrEqual(bbox.y1)
    }
  })

  it('解剖順（脳 → 鼻 → 肺 → 手 → 腰 → 脚）で巡回する', () => {
    expect(body_parts.map((p) => p.id))
      .toEqual(['tolerance', 'sniff', 'lung', 'power', 'spare', 'leg'])
  })

  // 手（ay 262）は腰（ay 248）より下に垂れるので、解剖順は y の単調増加には
  // ならない。順序そのものは上の 1 本が固定するので、ここは両端だけを見る
  it('先頭が最も上、末尾が最も下にある', () => {
    const ys = body_parts.map((p) => p.ay)
    expect(Math.min(...ys)).toBe(body_parts[0].ay)
    expect(Math.max(...ys)).toBe(body_parts[body_parts.length - 1].ay)
  })

  it('アイコンは身体の外に出る', () => {
    for (const p of body_parts) {
      const outside = p.ix < bbox.x0 || p.ix > bbox.x1
      expect(outside, p.label).toBe(true)
    }
  })

  it('左右それぞれ 3 個ずつに分かれる', () => {
    const left = body_parts.filter((p) => p.ix < 0)
    const right = body_parts.filter((p) => p.ix > body_width)
    expect(left.length).toBe(3)
    expect(right.length).toBe(3)
  })

  // 同じ側で近すぎると、アイコンとその発光が重なって別々の項目に見えない
  it('同じ側のアイコンは縦に 60 以上離れる', () => {
    for (const left of [true, false]) {
      const ys = body_parts
        .filter((p) => (left ? p.ix < 0 : p.ix > body_width))
        .map((p) => p.iy)
        .sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('収納位置はアンカーとアイコンの間にあり、アンカー寄りである', () => {
    for (const p of body_parts) {
      const s = body_stow_position(p)
      // アンカーとアイコンを結ぶ線分の内分点
      expect(s.x, p.label).toBeCloseTo(p.ax + (p.ix - p.ax) * body_stow_ratio, 6)
      expect(s.y, p.label).toBeCloseTo(p.ay + (p.iy - p.ay) * body_stow_ratio, 6)
      // 半分より手前（＝身体の脇に寄っている）
      expect(Math.abs(s.x - p.ax), p.label).toBeLessThan(Math.abs(p.ix - p.ax) / 2)
    }
  })

  it('装備アンカー 3 点は身体の線の内側にある', () => {
    for (const slot of gear_slots) {
      const a = gear_anchors[slot]
      expect(a.x, slot).toBeGreaterThanOrEqual(bbox.x0)
      expect(a.x, slot).toBeLessThanOrEqual(bbox.x1)
      expect(a.y, slot).toBeGreaterThanOrEqual(bbox.y0)
      expect(a.y, slot).toBeLessThanOrEqual(bbox.y1)
    }
  })

  it('器官のマークアップが 6 種すべてにある', () => {
    for (const id of meta_upgrade_ids) {
      expect(organ_svg[id], id).toBeTruthy()
    }
  })

  it('下地の寸法は body.webp そのもの', () => {
    expect(body_width).toBe(256)
    expect(body_height).toBe(512)
  })
})
