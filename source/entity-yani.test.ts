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
// entity-player が死亡シーケンスで monologue（→ dom）に到達するため差し替える
vi.mock('./monologue', () => ({ monologue_death: () => {} }))

import { entity_player_t } from './entity-player'
import { entity_spider_t } from './entity-spider'
import { entity_yani_t } from './entity-yani'
import { level_data, state } from './state'

describe('ヤニ', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    state.yani_run = 0
    state.game_running = 1
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('拾うとラン内のヤニが 1 増えて消える', () => {
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    yani._check(player)
    expect(state.yani_run).toBe(1)
    expect(yani._dead).toBe(true)
  })

  it('価値を持たせたヤニは、その分だけまとめて増える', () => {
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    yani._value = 7
    yani._check(player)
    expect(state.yani_run).toBe(7)
  })

  // レビュー Finding 4d: run_end() は state.yani_run を meta へ合算・保存してから
  // 抜ける。そのあとに拾わせても加算は保存に乗らず、静かに 1 本消える
  it('ラン終了後は拾えない', () => {
    state.game_running = 0
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    yani._check(player)
    expect(state.yani_run).toBe(0)
    expect(yani._dead).toBe(false)
  })

  it('自機以外には反応しない', () => {
    const yani = new entity_yani_t(64, 0, 64, 5, 26)
    const spider = new entity_spider_t(64, 0, 64, 5, 27)
    yani._check(spider)
    expect(state.yani_run).toBe(0)
    expect(yani._dead).toBe(false)
  })

  it('蜘蛛は 50% の抽選に当たるとヤニを落とす', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4) // < 0.5 で当選
    const spider = new entity_spider_t(16, 0, 16, 5, 27)
    spider._receive_damage(player, 999)
    expect(state.entities.some((e) => e instanceof entity_yani_t)).toBe(true)
  })

  it('抽選に外れるとヤニを落とさない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    const spider = new entity_spider_t(16, 0, 16, 5, 27)
    spider._receive_damage(player, 999)
    expect(state.entities.some((e) => e instanceof entity_yani_t)).toBe(false)
  })
})
