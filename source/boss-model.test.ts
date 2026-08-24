import { describe, expect, it } from 'vitest'
import {
  boss_arm_angles, boss_arms, boss_arms_max, boss_fire_step, boss_hp, boss_volleys,
} from './boss-model'

describe('boss_arms', () => {
  it('5 階ごとに 1 本増え、6 本で頭打ちになる', () => {
    expect(boss_arms(5)).toBe(2)
    expect(boss_arms(10)).toBe(3)
    expect(boss_arms(15)).toBe(4)
    expect(boss_arms(20)).toBe(5)
    expect(boss_arms(25)).toBe(6)
    expect(boss_arms(100)).toBe(boss_arms_max)
  })

  it('深度に対して単調非減少である', () => {
    for (let depth = 5; depth <= 200; depth += 5) {
      expect(boss_arms(depth)).toBeGreaterThanOrEqual(boss_arms(depth - 5))
    }
  })
})

describe('boss_hp', () => {
  it('深度 5 で 60 発、以降 5 階ごとに 20 発増える', () => {
    expect(boss_hp(5)).toBe(60)
    expect(boss_hp(10)).toBe(80)
    expect(boss_hp(20)).toBe(120)
  })

  it('深度に対して狭義単調増加である', () => {
    for (let depth = 5; depth <= 200; depth += 5) {
      expect(boss_hp(depth)).toBeGreaterThan(boss_hp(depth - 5))
    }
  })
})

describe('boss_volleys', () => {
  it('しきい値をまたいだ回数だけ斉射する', () => {
    expect(boss_volleys(0, boss_fire_step * 0.9)).toBe(0)
    expect(boss_volleys(0, boss_fire_step * 1.1)).toBe(1)
    expect(boss_volleys(boss_fire_step * 0.9, boss_fire_step * 1.1)).toBe(1)
    expect(boss_volleys(0, boss_fire_step * 2.1)).toBe(2)
  })

  it('掃引を細かく刻んでも合計の斉射数は変わらない', () => {
    const total = boss_fire_step * 10
    let coarse = boss_volleys(0, total)
    let fine = 0
    for (let i = 0; i < 1000; i++) {
      fine += boss_volleys(total * i / 1000, total * (i + 1) / 1000)
    }
    expect(fine).toBe(coarse)
    expect(coarse).toBe(10)
  })
})

describe('boss_arm_angles', () => {
  it('本数ぶんの角度を等角に返す', () => {
    const angles = boss_arm_angles(0, 4)
    expect(angles.length).toBe(4)
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 2)
    }
  })

  it('第 1 砲口は掃引の角度そのものを向く', () => {
    expect(boss_arm_angles(1.23, 3)[0]).toBe(1.23)
  })
})
