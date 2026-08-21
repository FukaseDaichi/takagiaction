import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  meta, meta_buy, meta_drain_factor, meta_load, meta_max_level,
  meta_nicotine_max, meta_power_factor, meta_save, meta_sniff_active,
  meta_sniff_distance, meta_sniff_threshold, meta_spare_count,
  meta_upgrade_cost, meta_upgrade_ids,
} from './meta'

// meta はモジュールレベルの可変オブジェクトなので、テストごとに手で初期化する
function meta_reset(): void {
  meta.yani = 0
  meta.best_depth = 0
  meta.persistent = true
  for (const id of meta_upgrade_ids) { meta.levels[id] = 0 }
}

// Node には localStorage が無い。保存・読込のテストではスタブを差す
function stub_storage(): Record<string, string> {
  const store: Record<string, string> = {}
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return store
}

describe('強化テーブル', () => {
  beforeEach(meta_reset)

  it('コストは 15 + 10lv + 5lv²', () => {
    expect([0, 1, 2, 9].map(meta_upgrade_cost)).toEqual([15, 30, 55, 510])
  })

  it('購入で残高が減りレベルが上がる', () => {
    meta.yani = 20
    expect(meta_buy('lung')).toBe(true)
    expect(meta.yani).toBe(5)
    expect(meta.levels.lung).toBe(1)
  })

  it('残高不足なら購入できない', () => {
    meta.yani = 14
    expect(meta_buy('lung')).toBe(false)
    expect(meta.yani).toBe(14)
    expect(meta.levels.lung).toBe(0)
  })

  it('最大レベルでは購入できない', () => {
    meta.yani = 9999
    meta.levels.sniff = meta_max_level.sniff
    expect(meta_buy('sniff')).toBe(false)
    expect(meta.yani).toBe(9999)
  })

  it('全解放の合計コストは 8425', () => {
    let total = 0
    for (const id of meta_upgrade_ids) {
      for (let level = 0; level < meta_max_level[id]; level++) {
        total += meta_upgrade_cost(level)
      }
    }
    expect(total).toBe(8425)
  })
})

describe('強化の効果値', () => {
  beforeEach(meta_reset)

  it('肺活量: 最大ゲージは 100 + 10/段、全強化で 200', () => {
    expect(meta_nicotine_max()).toBe(100)
    meta.levels.lung = 10
    expect(meta_nicotine_max()).toBe(200)
  })

  it('耐性: 減少係数は 1 − 0.04/段、全強化で 0.60', () => {
    expect(meta_drain_factor()).toBeCloseTo(1, 6)
    meta.levels.tolerance = 10
    expect(meta_drain_factor()).toBeCloseTo(0.6, 6)
  })

  it('火力: 射撃間隔係数は 1 − 0.05/段、全強化で 0.50', () => {
    expect(meta_power_factor()).toBeCloseTo(1, 6)
    meta.levels.power = 10
    expect(meta_power_factor()).toBeCloseTo(0.5, 6)
  })

  it('予備の一本: 使用可能回数はレベルと同数', () => {
    expect(meta_spare_count()).toBe(0)
    meta.levels.spare = 5
    expect(meta_spare_count()).toBe(5)
  })
})

describe('嗅覚の発動条件', () => {
  beforeEach(meta_reset)

  it('未購入では発動しない', () => {
    expect(meta_sniff_active(0)).toBe(false)
  })

  it('1 段はゲージ 30% 以下で発動する', () => {
    meta.levels.sniff = 1
    expect(meta_sniff_active(0.31)).toBe(false)
    expect(meta_sniff_active(0.3)).toBe(true)
    expect(meta_sniff_active(0)).toBe(true)
  })

  it('しきい値は等間隔で上がり、10 段で 60% になる', () => {
    expect(meta_sniff_threshold(1)).toBeCloseTo(0.3, 6)
    expect(meta_sniff_threshold(10)).toBeCloseTo(0.6, 6)
    meta.levels.sniff = 10
    expect(meta_sniff_active(0.6)).toBe(true)
    expect(meta_sniff_active(0.61)).toBe(false)
  })

  it('距離表示は 10 段のみ', () => {
    meta.levels.sniff = 9
    expect(meta_sniff_distance()).toBe(false)
    meta.levels.sniff = 10
    expect(meta_sniff_distance()).toBe(true)
  })
})

describe('保存と読み込み', () => {
  beforeEach(meta_reset)
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('localStorage が無い環境では persistent が false になり初期値のまま', () => {
    meta_load()
    expect(meta.persistent).toBe(false)
    expect(meta.yani).toBe(0)
  })

  it('保存して読み込むと復元される', () => {
    stub_storage()
    meta.yani = 123
    meta.best_depth = 9
    meta.levels.lung = 3
    meta_save()
    meta_reset()
    meta_load()
    expect(meta.persistent).toBe(true)
    expect(meta.yani).toBe(123)
    expect(meta.best_depth).toBe(9)
    expect(meta.levels.lung).toBe(3)
  })

  it('壊れた保存データは捨てて初期値で始める', () => {
    const store = stub_storage()
    store['takagi_meta'] = '{壊れたJSON'
    meta_load()
    expect(meta.persistent).toBe(true)
    expect(meta.yani).toBe(0)
  })

  it('範囲外の値は最大レベルに丸める', () => {
    const store = stub_storage()
    store['takagi_meta'] = JSON.stringify({
      yani: -5, best_depth: 3.7, levels: { lung: 99, sniff: 2 },
    })
    meta_load()
    expect(meta.yani).toBe(0)
    expect(meta.best_depth).toBe(3)
    expect(meta.levels.lung).toBe(meta_max_level.lung)
    expect(meta.levels.sniff).toBe(2)
    expect(meta.levels.power).toBe(0)
  })
})
