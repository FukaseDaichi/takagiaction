import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  meta, meta_buy, meta_drain_factor, meta_load, meta_max_level,
  meta_nicotine_max, meta_power_factor, meta_save, meta_sniff_active,
  meta_spare_count, meta_upgrade_cost, meta_upgrade_ids,
} from './meta'
import {
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_normal,
  nicotine_stage_withdrawal,
} from './nicotine'

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

  it('コストは 20/40/80/160/320 の倍々', () => {
    expect([0, 1, 2, 3, 4].map(meta_upgrade_cost)).toEqual([20, 40, 80, 160, 320])
  })

  it('購入で残高が減りレベルが上がる', () => {
    meta.yani = 25
    expect(meta_buy('lung')).toBe(true)
    expect(meta.yani).toBe(5)
    expect(meta.levels.lung).toBe(1)
  })

  it('残高不足なら購入できない', () => {
    meta.yani = 19
    expect(meta_buy('lung')).toBe(false)
    expect(meta.yani).toBe(19)
    expect(meta.levels.lung).toBe(0)
  })

  it('最大レベルでは購入できない', () => {
    meta.yani = 9999
    meta.levels.sniff = meta_max_level.sniff
    expect(meta_buy('sniff')).toBe(false)
    expect(meta.yani).toBe(9999)
  })

  it('全解放の合計コストは 1660', () => {
    let total = 0
    for (const id of meta_upgrade_ids) {
      for (let level = 0; level < meta_max_level[id]; level++) {
        total += meta_upgrade_cost(level)
      }
    }
    expect(total).toBe(1660)
  })
})

describe('強化の効果値', () => {
  beforeEach(meta_reset)

  it('肺活量: 最大ゲージは 100 + 10/段、全強化で 150', () => {
    expect(meta_nicotine_max()).toBe(100)
    meta.levels.lung = 5
    expect(meta_nicotine_max()).toBe(150)
  })

  it('耐性: 減少係数は 1 − 0.06/段、全強化で 0.70', () => {
    expect(meta_drain_factor()).toBeCloseTo(1, 6)
    meta.levels.tolerance = 5
    expect(meta_drain_factor()).toBeCloseTo(0.7, 6)
  })

  it('火力: 射撃間隔係数は 1 − 0.12/段、全強化で 0.64', () => {
    expect(meta_power_factor()).toBeCloseTo(1, 6)
    meta.levels.power = 3
    expect(meta_power_factor()).toBeCloseTo(0.64, 6)
  })

  it('予備の一本: 使用可能回数はレベルと同数', () => {
    expect(meta_spare_count()).toBe(0)
    meta.levels.spare = 2
    expect(meta_spare_count()).toBe(2)
  })
})

describe('嗅覚の発動条件', () => {
  beforeEach(meta_reset)

  it('未購入では発動しない', () => {
    expect(meta_sniff_active(nicotine_stage_limit)).toBe(false)
  })

  it('1 段は離脱症状帯（30% 以下）のみ', () => {
    meta.levels.sniff = 1
    expect(meta_sniff_active(nicotine_stage_normal)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_withdrawal)).toBe(true)
    expect(meta_sniff_active(nicotine_stage_limit)).toBe(true)
  })

  it('2 段以上はそわそわ帯（60% 以下）に緩和される', () => {
    meta.levels.sniff = 2
    expect(meta_sniff_active(nicotine_stage_normal)).toBe(false)
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(true)
    meta.levels.sniff = 3
    expect(meta_sniff_active(nicotine_stage_edgy)).toBe(true)
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
