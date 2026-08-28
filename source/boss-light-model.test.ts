import { describe, expect, it } from 'vitest'

import {
  boss_light_duration, boss_light_progress, light_ambient, light_fog_far,
} from './boss-light-model'
import { arena_side } from './level-generator'

describe('boss_light_progress: 明転の進捗', () => {
  it('到達直後は 0 で、暗いフロアの見え方から始まる', () => {
    expect(boss_light_progress(0)).toBe(0)
  })

  it('負の経過でも 0 を下回らない', () => {
    expect(boss_light_progress(-1)).toBe(0)
  })

  it('明転が終わる 3 秒で 1 に達する', () => {
    expect(boss_light_duration).toBe(3)
    expect(boss_light_progress(boss_light_duration)).toBe(1)
  })

  it('3 秒を過ぎても 1 を超えない', () => {
    expect(boss_light_progress(10)).toBe(1)
  })

  it('明転中は単調に増える', () => {
    let previous = boss_light_progress(0)
    for (let elapsed = 0.1; elapsed <= boss_light_duration; elapsed += 0.1) {
      const current = boss_light_progress(elapsed)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })

  it('中間は半分まで進む（両端が滑らかに繋がる）', () => {
    expect(boss_light_progress(boss_light_duration / 2)).toBeCloseTo(0.5, 5)
  })
})

describe('light_ambient: 環境光', () => {
  it('進捗 0 は通常フロアの環境光と一致する', () => {
    expect(light_ambient(0)).toEqual([0.3, 0.3, 0.6])
  })

  it('進捗 1 は全成分が通常フロアより明るい', () => {
    const dark = light_ambient(0)
    const bright = light_ambient(1)
    for (let i = 0; i < 3; i++) {
      expect(bright[i]).toBeGreaterThan(dark[i])
    }
  })

  it('全成分が単調に明るくなる', () => {
    let previous = light_ambient(0)
    for (let t = 0.1; t <= 1; t += 0.1) {
      const current = light_ambient(t)
      for (let i = 0; i < 3; i++) {
        expect(current[i]).toBeGreaterThan(previous[i])
      }
      previous = current
    }
  })

  it('白飛びしないよう 1 を超えない', () => {
    for (const c of light_ambient(1)) {
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  // 非常口の緑タイルは「環境光の青が緑の 2 倍」を前提に焼いてある
  // （docs/gameplay.md「非常口」）。明側だけ比が動くと同じタイルが
  // ボス階でだけ別の色に見える
  it('どの進捗でも青は緑の 2 倍のまま', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [, g, b] = light_ambient(t)
      expect(b).toBeCloseTo(g * 2, 10)
    }
  })
})

describe('light_fog_far: 霧の遠距離', () => {
  it('進捗 0 は通常フロアの霧と一致する', () => {
    expect(light_fog_far(0)).toBe(112)
  })

  it('進捗 1 の霧は闘技場を端から端まで覆える', () => {
    // 闘技場は arena_side タイル四方。タイル 1 辺は 8 単位（push_floor）
    expect(light_fog_far(1)).toBeGreaterThan(arena_side * 8)
  })

  it('単調に伸びる', () => {
    let previous = light_fog_far(0)
    for (let t = 0.1; t <= 1; t += 0.1) {
      const current = light_fog_far(t)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })
})
