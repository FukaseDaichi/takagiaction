import { describe, expect, it } from 'vitest'
import { array_rand, random_int, random_seed } from './random'

describe('random', () => {
  it('同じシードからは同じ列が出る', () => {
    random_seed(0xbadc0de1)
    const first = [random_int(0, 99), random_int(0, 99), random_int(0, 99)]

    random_seed(0xbadc0de1)
    const second = [random_int(0, 99), random_int(0, 99), random_int(0, 99)]

    expect(second).toEqual(first)
  })

  it('異なるシードでは列が変わる', () => {
    random_seed(1)
    const a = [random_int(0, 999), random_int(0, 999), random_int(0, 999)]

    random_seed(2)
    const b = [random_int(0, 999), random_int(0, 999), random_int(0, 999)]

    expect(b).not.toEqual(a)
  })

  it('min 以上 max 以下の整数を返す', () => {
    random_seed(42)
    for (let i = 0; i < 500; i++) {
      const n = random_int(3, 7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
    }
  })

  it('min と max が同じなら常にその値を返す', () => {
    random_seed(42)
    expect(random_int(5, 5)).toBe(5)
    expect(random_int(5, 5)).toBe(5)
  })

  it('array_rand は配列の要素を返す', () => {
    random_seed(7)
    const source = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) {
      expect(source).toContain(array_rand(source))
    }
  })
})
