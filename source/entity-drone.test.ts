import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer は dom.ts 経由で document と canvas に触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
// audio は AudioContext をモジュール初期化時に生成するため同様
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
// terminal も dom.ts に触る
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
// entity-player が死亡シーケンスで monologue（→ dom）に到達するため差し替える
vi.mock('./monologue', () => ({ monologue_death: () => {} }))

import { entity_drone_t } from './entity-drone'
import { entity_plasma_t } from './entity-plasma'
import { entity_player_t } from './entity-player'
import { entity_yani_t } from './entity-yani'
import { level_data, state } from './state'

function yani_count(): number {
  return state.entities.filter((e) => e instanceof entity_yani_t && !e._dead).length
}

describe('清掃ドローン', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    state.kills = 0
    state.yani_run = 0
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('プレイヤーが視界に入ると離れる方向へ加速する', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    drone._update()
    expect(drone.ax).toBeGreaterThan(0) // プレイヤーは -x 側にいる
    expect(Math.abs(drone.az)).toBeLessThan(1)
  })

  it('視界の外では最寄りの吸い殻へ向かう', () => {
    player.x = 300
    player.z = 300
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    new entity_yani_t(120, 0, 64, 5, 26)
    drone._update()
    expect(drone.ax).toBeGreaterThan(0)
  })

  it('被弾すると視界の外でも逃走する', () => {
    player.x = 300
    player.z = 64
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 1)
    drone._update()
    expect(drone.ax).toBeLessThan(0) // プレイヤー（+x 側）と逆へ
  })

  it('吸い殻に触れると回収し、プレイヤーのヤニは増えない', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const yani = new entity_yani_t(80, 0, 64, 5, 26)
    yani._check(drone)
    expect(yani._dead).toBe(true)
    expect(state.yani_run).toBe(0)
  })

  it('倒すとヤニを 5〜10 個まき散らす', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(drone._dead).toBe(true)
    expect(state.kills).toBe(1)
    expect(yani_count()).toBeGreaterThanOrEqual(5)
    expect(yani_count()).toBeLessThanOrEqual(10)
  })

  it('回収した分は撃破時のばら撒きに上乗せされる', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    for (let i = 0; i < 3; i++) {
      const yani = new entity_yani_t(80, 0, 64, 5, 26)
      yani._check(drone)
    }
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(yani_count()).toBeGreaterThanOrEqual(5 + 3)
    expect(yani_count()).toBeLessThanOrEqual(10 + 3)
  })

  it('自機のプラズマが当たる（HP 10）', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    plasma._check(drone)
    expect(drone.h).toBe(9)
    expect(plasma._dead).toBe(true)
  })

  it('プレイヤーに接触してもダメージを与えない', () => {
    const drone = new entity_drone_t(64, 0, 64, 5, 39)
    const hp = player.h
    drone._check(player)
    player._check(drone)
    expect(player.h).toBe(hp)
  })
})
