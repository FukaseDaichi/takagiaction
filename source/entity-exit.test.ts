import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_block と terminal_show_notice の呼び出しを記録する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({ blocks: [] as number[][], notices: [] as string[] }))

vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: (...args: number[]) => { mocks.blocks.push(args) },
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
vi.mock('./terminal', () => ({
  terminal_show_notice: (notice: string) => { mocks.notices.push(notice) },
}))
vi.mock('./game', () => ({ next_level: () => {}, run_end: () => {} }))

import { entity_exit_t } from './entity-exit'
import { entity_player_t } from './entity-player'
import { level_data, level_width, state } from './state'

const exit_index = (80 >> 3) + (80 >> 3) * level_width

describe('非常口', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.exit_open = 0
    state.game_running = 1
    mocks.blocks.length = 0
    mocks.notices.length = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('閉じている間は毎フレーム壁として描かれる', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._render()
    exit._render()
    expect(mocks.blocks.length).toBe(2)
    expect(mocks.blocks[0].slice(0, 2)).toEqual([80, 80])
  })

  // レビュー A-4: renderer_freeze_level_geometry() がレベル形状を焼くので、
  // level_data だけ書き換えても見た目は壁のまま残る
  it('開通すると当たり判定が床に戻り、壁として描かれなくなる', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    level_data[exit_index] = 8

    exit._render()
    expect(level_data[exit_index]).toBe(8) // 未開通なら壁のまま

    state.exit_open = 1
    mocks.blocks.length = 0
    exit._render()
    expect(level_data[exit_index]).toBeGreaterThan(0)
    expect(level_data[exit_index]).toBeLessThan(8) // 床になっている
    expect(mocks.blocks.length).toBe(0) // もう壁として描かない
  })

  it('開通前に触れても次のフロアへ進まない', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._check(player)
    expect(mocks.notices.length).toBe(0)
  })

  it('開通後に触れると遷移は一度だけ予約される', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    exit._check(player)
    exit._check(player)
    exit._check(player)
    expect(mocks.notices.length).toBe(1)
  })

  // レビュー Finding 1: ラン終了と同じフレームで通知を出すと terminal_show_result() の
  // 表示チェーンを terminal_cancel() が壊しうる。run_end() は terminal_show_result() を
  // 呼ぶ前に game_running を落とすので、ここでその値を見れば判定できる。
  it('ラン終了後（state.game_running が 0）は開通していても遷移を予約しない', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    state.game_running = 0
    exit._check(player)
    expect(mocks.notices.length).toBe(0)
  })
})
