import { describe, expect, it } from 'vitest'

import {
  death_beats, death_body_y, death_drone_y, death_duration,
} from './death-sequence-model'

describe('death_beats: ビート発火', () => {
  it('救護ドローンの通知は 1.2 秒を跨いだフレームで一度だけ出る', () => {
    expect(death_beats(1.0, 1.1).notice).toBe(false)
    expect(death_beats(1.1, 1.2).notice).toBe(true)
    expect(death_beats(1.2, 1.3).notice).toBe(false)
  })

  it('シーケンスは 3 秒を跨いだフレームで終わる', () => {
    expect(death_beats(2.8, 2.9).done).toBe(false)
    expect(death_beats(2.9, 3.0).done).toBe(true)
  })

  it('魂の煙は 0.2 秒から 0.4 秒間隔で出る', () => {
    expect(death_beats(0, 0.1).smoke).toBe(0)
    expect(death_beats(0.1, 0.3).smoke).toBe(1) // 0.2
    expect(death_beats(0.3, 0.5).smoke).toBe(0)
    expect(death_beats(0.5, 1.1).smoke).toBe(2) // 0.6 と 1.0
  })

  it('煙は持ち上げ開始（1.8 秒）以降は出ない', () => {
    expect(death_beats(1.7, 1.9).smoke).toBe(1) // 1.8 が最後の一puff
    expect(death_beats(1.9, 3.0).smoke).toBe(0)
  })

  it('フレームが粗くてもビートを取りこぼさない', () => {
    const beats = death_beats(1.1, 1.5)
    expect(beats.notice).toBe(true)
    expect(beats.smoke).toBe(1) // 1.4
  })

  // 0.2 + 0.4n を割り算で求めると、0.6 と 1.4 が二進で表せず 1 フレーム遅れる
  it('各回の煙はちょうどその時刻に出る', () => {
    expect(death_beats(0.15, 0.2).smoke).toBe(1)
    expect(death_beats(0.55, 0.6).smoke).toBe(1)
    expect(death_beats(0.95, 1.0).smoke).toBe(1)
    expect(death_beats(1.35, 1.4).smoke).toBe(1)
    expect(death_beats(1.75, 1.8).smoke).toBe(1)
  })

  it('煙は全部で 5 回', () => {
    expect(death_beats(0, death_duration).smoke).toBe(5)
  })
})

describe('death_body_y: 死体の高さ', () => {
  it('持ち上げ開始までは倒れた姿勢の高さ 10 のまま', () => {
    expect(death_body_y(0)).toBe(10)
    expect(death_body_y(1.8)).toBe(10)
  })

  it('1.8 秒から終了までに 10 から 60 まで直線で上がる', () => {
    expect(death_body_y(2.4)).toBeCloseTo(35)
    expect(death_body_y(death_duration)).toBe(60)
  })

  it('終了時刻を超えても 60 で止まる', () => {
    expect(death_body_y(3.5)).toBe(60)
  })
})

describe('death_drone_y: ドローンの光', () => {
  it('持ち上げ開始までは現れない', () => {
    expect(death_drone_y(0)).toBe(null)
    expect(death_drone_y(1.7)).toBe(null)
  })

  it('1.8 秒から 0.4 秒かけて 120 から 40 へ降りる', () => {
    expect(death_drone_y(1.8)).toBe(120)
    expect(death_drone_y(2.0)).toBeCloseTo(80)
    expect(death_drone_y(2.2)).toBe(40)
  })

  it('降り切ったら 40 に留まる', () => {
    expect(death_drone_y(3.0)).toBe(40)
  })
})
