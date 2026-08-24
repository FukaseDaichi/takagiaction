import { describe, expect, it } from 'vitest'
import {
  descend_seconds, hp_reveal_hold, hp_reveal_idle, hp_reveal_step,
  hud_percent_visible, hud_spare_urgent, hud_weapon_visible,
} from './hud-model'
import {
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_normal,
  nicotine_stage_withdrawal,
} from './nicotine'

describe('百分率の表示条件', () => {
  it('通常帯では出さない（静かなことが「安全」の合図になる）', () => {
    expect(hud_percent_visible(nicotine_stage_normal, 0)).toBe(false)
  })

  it('そわそわ帯（60% 以下）から出る', () => {
    expect(hud_percent_visible(nicotine_stage_edgy, 0)).toBe(true)
    expect(hud_percent_visible(nicotine_stage_withdrawal, 0)).toBe(true)
    expect(hud_percent_visible(nicotine_stage_limit, 0)).toBe(true)
  })

  it('一服中は通常帯でも出す（回復が数字で駆け上がる）', () => {
    expect(hud_percent_visible(nicotine_stage_normal, 1)).toBe(true)
  })
})

describe('HP の表示条件', () => {
  const step = (
    prev: ReturnType<typeof hp_reveal_idle>, hp: number, stage: number, dt = 0.016,
  ) => hp_reveal_step(prev, hp, 5, stage, dt)

  it('満タン・通常帯では出さない', () => {
    expect(step(hp_reveal_idle(), 5, nicotine_stage_normal).visible).toBe(false)
  })

  it('削られたら出る', () => {
    expect(step(hp_reveal_idle(), 4, nicotine_stage_normal).visible).toBe(true)
  })

  it('限界帯は満タンでも出す（次に食われるのが HP だから）', () => {
    expect(step(hp_reveal_idle(), 5, nicotine_stage_limit).visible).toBe(true)
  })

  it('満タンに戻ってから hp_reveal_hold 秒だけ残り、そのあと消える', () => {
    let r = step(hp_reveal_idle(), 3, nicotine_stage_normal)
    expect(r.hold).toBe(hp_reveal_hold)

    // 満タンに戻した直後はまだ見えている
    r = step(r, 5, nicotine_stage_normal, hp_reveal_hold - 0.1)
    expect(r.visible).toBe(true)

    r = step(r, 5, nicotine_stage_normal, 0.2)
    expect(r.visible).toBe(false)
    expect(r.hold).toBe(0)
  })

  it('消えたあとは満タンのまま何フレーム進めても出てこない', () => {
    let r = hp_reveal_idle()
    for (let i = 0; i < 10; i++) { r = step(r, 5, nicotine_stage_normal) }
    expect(r.visible).toBe(false)
  })
})

describe('予備の一本の使いどき', () => {
  it('離脱症状帯（30% 以下）で点灯する', () => {
    expect(hud_spare_urgent(nicotine_stage_normal)).toBe(false)
    expect(hud_spare_urgent(nicotine_stage_edgy)).toBe(false)
    expect(hud_spare_urgent(nicotine_stage_withdrawal)).toBe(true)
    expect(hud_spare_urgent(nicotine_stage_limit)).toBe(true)
  })
})

describe('武器スロット', () => {
  // 刃物を持っていない間は持ち替える先が無い。表示されていること自体が
  // 「持ち替えられる」の合図になるので、ラベルを持たせずに済む
  it('刃物を持っていない間は出さない', () => {
    expect(hud_weapon_visible(0)).toBe(false)
    expect(hud_weapon_visible(1)).toBe(true)
  })
})

describe('非常口の通過カウントダウン', () => {
  // 切り捨てだと予約した瞬間（残り 3.0）に「2」から始まり、最後の 1 秒が
  // 「0」になる。切り上げれば 3 → 2 → 1 が 1 秒ずつ均等に出る
  it('予約した瞬間は descend_duration がそのまま出る', () => {
    expect(descend_seconds(3)).toBe(3)
  })

  it('1 秒ごとに 1 つ減り、各段が 1 秒ぶん出る', () => {
    expect(descend_seconds(2.99)).toBe(3)
    expect(descend_seconds(2.01)).toBe(3)
    expect(descend_seconds(2)).toBe(2)
    expect(descend_seconds(1.01)).toBe(2)
    expect(descend_seconds(1)).toBe(1)
  })

  it('残り 0 に着くまで 0 は出さない', () => {
    expect(descend_seconds(0.5)).toBe(1)
    expect(descend_seconds(0.001)).toBe(1)
    expect(descend_seconds(0)).toBe(1)
  })
})
