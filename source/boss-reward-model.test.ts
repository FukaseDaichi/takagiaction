import { describe, expect, it } from 'vitest'
import { reward_any_available, reward_available, reward_level } from './boss-reward-model'
import { meta_max_level } from './meta'
import type { meta_upgrade_id_t } from './meta'

const levels = (): Record<meta_upgrade_id_t, number> =>
  ({ lung: 0, tolerance: 0, sniff: 0, leg: 0, power: 0, spare: 0 })

describe('reward_level', () => {
  it('meta の段にこのランで選んだ回数を足す', () => {
    expect(reward_level('lung', 3, [])).toBe(3)
    expect(reward_level('lung', 3, ['lung'])).toBe(4)
    expect(reward_level('lung', 3, ['lung', 'leg', 'lung'])).toBe(5)
    expect(reward_level('lung', 3, ['leg'])).toBe(3)
  })

  it('上限を超えない', () => {
    expect(reward_level('sniff', 5, ['sniff'])).toBe(meta_max_level.sniff)
  })
})

describe('reward_available', () => {
  it('実効段が上限に達したら選べない', () => {
    expect(reward_available('sniff', 4, [])).toBe(true)
    expect(reward_available('sniff', 4, ['sniff'])).toBe(false)
    expect(reward_available('sniff', 5, [])).toBe(false)
  })
})

describe('reward_any_available', () => {
  it('1 本でも余地があれば true', () => {
    expect(reward_any_available(levels(), [])).toBe(true)
  })

  it('6 本すべてが上限なら false', () => {
    const maxed = { ...levels() }
    for (const id of Object.keys(maxed) as meta_upgrade_id_t[]) {
      maxed[id] = meta_max_level[id]
    }
    expect(reward_any_available(maxed, [])).toBe(false)
  })
})
