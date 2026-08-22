import { describe, expect, it } from 'vitest'
import { hud_objective, hud_yani_progress } from './hud-model'
import { meta_max_level, meta_upgrade_cost } from './meta'
import type { meta_upgrade_id_t } from './meta'

const levels_at = (
  overrides: Partial<Record<meta_upgrade_id_t, number>> = {},
): Record<meta_upgrade_id_t, number> => ({
  lung: 0, tolerance: 0, sniff: 0, power: 0, spare: 0, ...overrides,
})

describe('次にやること', () => {
  it('一服中は吸い続けることを指示する', () => {
    const o = hud_objective(1, 0)
    expect(o.title).toContain('吸い続け')
  })

  it('一服中は非常口が開いていても吸うほうを優先する', () => {
    expect(hud_objective(1, 1).title).toBe(hud_objective(1, 0).title)
  })

  it('非常口が未開通なら喫煙所を探させる', () => {
    const o = hud_objective(0, 0)
    expect(o.title).toContain('喫煙所')
    expect(o.note).toContain('非常口')
  })

  it('非常口が開通したら非常口へ向かわせる', () => {
    const o = hud_objective(0, 1)
    expect(o.title).toContain('非常口')
  })
})

describe('次の強化までのヤニ', () => {
  it('未強化なら最安の 1 段目（15）が目標になる', () => {
    const p = hud_yani_progress(0, levels_at())
    expect(p.cost).toBe(meta_upgrade_cost(0))
    expect(p.remain).toBe(meta_upgrade_cost(0))
    expect(p.ratio).toBe(0)
  })

  it('目標額に届いていれば残り 0・ゲージ満タンになる', () => {
    const p = hud_yani_progress(999, levels_at())
    expect(p.remain).toBe(0)
    expect(p.ratio).toBe(1)
  })

  it('最安は「まだ上げられる項目の中で一番レベルが低いもの」で決まる', () => {
    // 予備だけ Lv0 のままなら、他が何段でも目標は Lv0 のコスト
    const p = hud_yani_progress(0, levels_at({
      lung: 4, tolerance: 4, sniff: 4, power: 4,
    }))
    expect(p.cost).toBe(meta_upgrade_cost(0))
  })

  it('MAX の項目は目標に数えない', () => {
    // 予備は 5 段で MAX。残りは全部 Lv2 なので目標は Lv2 のコスト
    const p = hud_yani_progress(10, levels_at({
      lung: 2, tolerance: 2, sniff: 2, power: 2, spare: meta_max_level.spare,
    }))
    expect(p.cost).toBe(meta_upgrade_cost(2))
    expect(p.remain).toBe(meta_upgrade_cost(2) - 10)
  })

  it('全項目 MAX なら cost 0 で「目標なし」を表す', () => {
    const p = hud_yani_progress(9999, { ...meta_max_level })
    expect(p.cost).toBe(0)
  })
})
