import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('./monologue', () => ({ monologue_death: () => {} }))
// 開封ダイアログは DOM と 30 枚の画像を持つ。ここでは「呼ばれたか」だけ見る
const opened: Array<[string, number]> = []
vi.mock('./equip-screen', () => ({
  equip_screen_show: (slot: string, tier: number) => { opened.push([slot, tier]) },
}))
vi.mock('./screen-slash', () => ({ screen_slash: () => {} }))

import { entity_container_t } from './entity-container'
import { entity_player_t } from './entity-player'
import { level_data, state } from './state'

describe('押収品コンテナ', () => {
  let player: entity_player_t

  beforeEach(() => {
    opened.length = 0
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    state.paused = 0
    state.dying = 0
    state.game_running = 1
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  afterEach(() => { vi.restoreAllMocks() })

  function drop(slot: 'blade' | 'sole' | 'patch', tier: number): entity_container_t {
    const c = new entity_container_t(64, 0, 64, 5, 42)
    c._slot = slot
    c._tier = tier
    return c
  }

  it('触れると開封ダイアログが開いて、箱は消える', () => {
    const c = drop('blade', 7)
    c._check(player)
    expect(opened).toEqual([['blade', 7]])
    expect(c._dead).toBe(true)
  })

  // コンテナは撃破位置に落ちるので、喫煙所やダミーの上に重なりうる
  it('一服中は開かない', () => {
    state.smoking = 1
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
    expect(c._dead).toBe(false)
  })

  it('リザルト表示中は開かない', () => {
    state.game_running = 0
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
  })

  it('開封中に二重で開かない', () => {
    state.paused = 1
    const c = drop('sole', 3)
    c._check(player)
    expect(opened.length).toBe(0)
  })

  it('自機以外が触れても開かない', () => {
    const other = drop('patch', 2)
    const c = drop('blade', 1)
    c._check(other)
    expect(opened.length).toBe(0)
  })
})
