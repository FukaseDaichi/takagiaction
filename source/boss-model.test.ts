import { describe, expect, it } from 'vitest'
import {
  boss_arm_angles, boss_arms, boss_arms_max, boss_bullet_speed, boss_fire_step,
  boss_hp, boss_phase, boss_phase_rage, boss_spin_rate, boss_volleys,
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
  const step = boss_fire_step(1)

  it('しきい値をまたいだ回数だけ斉射する', () => {
    expect(boss_volleys(0, step * 0.9, step)).toBe(0)
    expect(boss_volleys(0, step * 1.1, step)).toBe(1)
    expect(boss_volleys(step * 0.9, step * 1.1, step)).toBe(1)
    expect(boss_volleys(0, step * 2.1, step)).toBe(2)
  })

  it('掃引を細かく刻んでも合計の斉射数は変わらない', () => {
    const total = step * 10
    const coarse = boss_volleys(0, total, step)
    let fine = 0
    for (let i = 0; i < 1000; i++) {
      fine += boss_volleys(total * i / 1000, total * (i + 1) / 1000, step)
    }
    expect(fine).toBe(coarse)
    expect(coarse).toBe(10)
  })

  it('刻みを変えても同じ規則で数える', () => {
    expect(boss_volleys(0, 1.5, 1.4)).toBe(1)
    expect(boss_volleys(0, 2.9, 1.4)).toBe(2)
    expect(boss_volleys(1.5, 2.9, 1.4)).toBe(1)
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

describe('boss_phase', () => {
  it('HP がちょうど半分で激昂に入る', () => {
    expect(boss_phase(60, 60)).toBe(1)
    expect(boss_phase(31, 60)).toBe(1)
    expect(boss_phase(30, 60)).toBe(boss_phase_rage)
    expect(boss_phase(1, 60)).toBe(boss_phase_rage)
  })
})

describe('フェーズで変わる摘み', () => {
  it('激昂ですべて強くなる（発射の刻みだけは小さくなる方向）', () => {
    expect(boss_spin_rate(boss_phase_rage)).toBeGreaterThan(boss_spin_rate(1))
    expect(boss_bullet_speed(boss_phase_rage)).toBeGreaterThan(boss_bullet_speed(1))
    expect(boss_fire_step(boss_phase_rage)).toBeLessThan(boss_fire_step(1))
  })

  it('斉射の頻度（回転 ÷ 刻み）が激昂で上がる', () => {
    const rate = (p: number) => boss_spin_rate(p) / boss_fire_step(p)
    expect(rate(boss_phase_rage)).toBeGreaterThan(rate(1))
  })
})
