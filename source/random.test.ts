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

  // 上の 5 件はどれも自己整合性しか見ていないため、LCG の定数やシフト量を
  // 別の「それらしい」値に変えても通ってしまう。レベル生成の再現性が壊れるので、
  // 旧 source/random.js から抽出した実際の出力列そのものを固定する。
  it('旧実装と同一の列を返す（レベル生成の再現性）', () => {
    // load_level が使うシード
    random_seed(0xbadc0de1)
    expect(Array.from({ length: 10 }, () => random_int(0, 99)))
      .toEqual([0, 7, 55, 68, 94, 70, 15, 30, 28, 59])

    random_seed(1)
    expect(Array.from({ length: 5 }, () => random_int(0, 999)))
      .toEqual([286, 4, 725, 316, 367])

    // 引数なし = 既定シード 0xBADC0FFE。seed が undefined のときの
    // `seed || 0xbadc0ffe` と `seed ?? 0` の両方の経路を固定する
    random_seed()
    expect(Array.from({ length: 5 }, () => random_int(0, 99)))
      .toEqual([34, 79, 37, 13, 16])
  })
})
