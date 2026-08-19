import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer / audio / terminal / game はモジュール初期化時に canvas・AudioContext・
// document へ触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_toggle: () => {},
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
}))
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
vi.mock('./game', () => ({ next_level: () => {}, reload_level: () => {} }))

import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_player_t } from './entity-player'
import { level_data, state } from './state'

// 1 フレーム進める。game_tick は衝突ループ（_check）を一巡させてから
// _render を呼ぶので、テストも同じ順で叩く。
function tick(area: entity_smoking_area_t, player: entity_player_t, dt: number): void {
  state.time_elapsed = dt
  area._check(player)
  area._render()
}

function idle(area: entity_smoking_area_t, dt: number): void {
  state.time_elapsed = dt
  area._render()
}

describe('喫煙所', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
    state.nicotine = 0
    state.nicotine_max = 100
    state.smoking = 0
    state.exit_open = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('本物は 2.5 秒で一服が完了し、非常口が開いて HP が 1 回復する', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 3

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(0)
    expect(state.nicotine).toBeCloseTo(80, 5) // 40/秒 × 2.0 秒

    tick(area, player, 0.5) // 累計 2.5 秒
    expect(state.exit_open).toBe(1)
    expect(state.nicotine).toBe(100)
    expect(player.h).toBe(4)
  })

  it('一服中は移動と射撃がロックされ、完了フレームで解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.smoking).toBe(0)
  })

  it('触れるのをやめるとロックが解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    idle(area, 0.5)
    expect(state.smoking).toBe(0)
  })

  // レビュー A-5: 中断で喫煙所を消費すると非常口が永久に開かず詰む
  it('被弾で中断すると進捗は 0 に戻るが、吸い直せる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5)
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(40, 5)

    player.h = 4 // 被弾
    tick(area, player, 0.5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)
    expect(state.nicotine).toBeCloseTo(40, 5) // 中断フレームでは回復しない

    // 吸い直せる: ここから 2.5 秒でちゃんと完了する
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(1)
  })

  it('中断されるまでに吸えた時間ぶんはゲージに残る', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    for (let i = 0; i < 3; i++) { tick(area, player, 0.5) } // 1.5 秒
    player.h = 4
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(60, 5) // 設計書 §1 の「1.5秒吸えたら60%回復」
  })

  it('ダミーは 5% だけ回復して以後は反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = false

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
  })

  it('完了した喫煙所は二度と反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }

    state.nicotine = 10
    state.exit_open = 0
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.nicotine).toBe(10)
    expect(state.exit_open).toBe(0)
  })
})
