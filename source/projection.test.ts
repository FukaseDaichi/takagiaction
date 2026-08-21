import { describe, expect, it } from 'vitest'
import { project } from './projection'

// カメラが自機に追従しきった定常状態は camera = (-px, 0, -pz)（game.ts の減衰追従の不動点）。
// 自機頭上の点 (px+3, 8, pz) は、自機がどこにいても同じスクリーン位置に来るはず。
describe('project', () => {
  it('定常状態の自機頭上は画面中央のやや右下に投影される', () => {
    const p = project(3, 8, 0, 0, 0, 0, 320, 180)!
    expect(p.x).toBeCloseTo(170.36, 1)
    expect(p.y).toBeCloseTo(97.34, 1)
  })

  it('自機の位置によらず定常状態では同じスクリーン位置になる', () => {
    const a = project(3, 8, 0, 0, 0, 0, 320, 180)!
    const b = project(103, 8, 200, -100, 0, -200, 320, 180)!
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)
  })

  it('ワールドで +x に動くとスクリーンでも右に動く', () => {
    const left = project(0, 8, 0, 0, 0, 0, 320, 180)!
    const right = project(10, 8, 0, 0, 0, 0, 320, 180)!
    expect(right.x).toBeGreaterThan(left.x)
  })

  it('カメラ背後の点は null を返す', () => {
    expect(project(0, 0, 100, 0, 0, 0, 320, 180)).toBeNull()
  })

  it('表示サイズに比例してスケールする', () => {
    const small = project(3, 8, 0, 0, 0, 0, 320, 180)!
    const large = project(3, 8, 0, 0, 0, 0, 640, 360)!
    expect(large.x).toBeCloseTo(small.x * 2, 6)
    expect(large.y).toBeCloseTo(small.y * 2, 6)
  })
})
