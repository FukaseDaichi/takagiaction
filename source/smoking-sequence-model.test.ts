import { describe, expect, it } from 'vitest'
import {
  complete_beats, ignite_flash_duration, smoke_puffs,
} from './smoking-sequence-model'

describe('吸引中の煙（smoke_puffs）', () => {
  it('0.6 秒刻みの湧き時刻を (before, after] で数える', () => {
    expect(smoke_puffs(0, 0.5)).toBe(0)
    expect(smoke_puffs(0.5, 1.0)).toBe(1) // 0.6
    expect(smoke_puffs(0, 2.5)).toBe(4) // 0.6 / 1.2 / 1.8 / 2.4
  })

  it('フレームが粗くても取りこぼさない', () => {
    expect(smoke_puffs(0.5, 1.9)).toBe(3) // 0.6 / 1.2 / 1.8
  })

  it('境界ちょうどは after 側にだけ含める（同じ時刻を 2 度数えない）', () => {
    expect(smoke_puffs(0, 0.6)).toBe(1)
    expect(smoke_puffs(0.6, 1.2)).toBe(1) // 1.2 のみ。0.6 は前のフレームで消費済み
  })
})

describe('完了後の因果タイムライン（complete_beats）', () => {
  it('感知器 0.8 秒・防災扉 1.5 秒を、跨いだフレームで発火する', () => {
    expect(complete_beats(0, 0.5)).toEqual({ detector: false, door: false })
    expect(complete_beats(0.5, 1.0)).toEqual({ detector: true, door: false })
    expect(complete_beats(1.0, 1.5)).toEqual({ detector: false, door: true })
  })

  it('1 フレームで両方跨げば両方発火する', () => {
    expect(complete_beats(0, 2)).toEqual({ detector: true, door: true })
  })
})

describe('着火フラッシュ', () => {
  it('長さは 0.3 秒', () => {
    expect(ignite_flash_duration).toBe(0.3)
  })
})
