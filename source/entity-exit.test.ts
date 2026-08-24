import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_block / push_sprite と terminal_show_notice の呼び出しを記録する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({
  blocks: [] as number[][],
  sprites: [] as number[][],
  notices: [] as string[],
}))

vi.mock('./renderer', () => ({
  push_sprite: (...args: number[]) => { mocks.sprites.push(args) },
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
// entity-player が死亡シーケンスで monologue（→ dom）に到達するため差し替える
vi.mock('./monologue', () => ({ monologue_death: () => {} }))
vi.mock('./screen-slash', () => ({ screen_slash: () => {} }))

import { entity_exit_t } from './entity-exit'
import { entity_player_t } from './entity-player'
import { descend_duration, level_data, level_width, state } from './state'

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
    state.descend_timer = 0
    mocks.blocks.length = 0
    mocks.sprites.length = 0
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

  // 開通した非常口は床に戻るだけで、ブロックも他の絵も出なくなる。
  // 「どのタイルが非常口か」が読めないと乗れないので、標識を頭上に浮かべる
  it('開通すると標識が自機の頭上の高さに描かれる', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._render()
    expect(mocks.sprites.length).toBe(0) // 閉じている間は壁なので出さない

    state.exit_open = 1
    exit._render()
    expect(mocks.sprites.length).toBe(1)
    // y = 6 は自機のビルボード（0〜6）の真上。乗っている間も標識が隠れない
    expect(mocks.sprites[0].slice(0, 3)).toEqual([81, 6, 81])
  })

  it('開通前に触れても次のフロアへ進まない', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    exit._check(player)
    expect(mocks.notices.length).toBe(0)
    expect(state.descend_timer).toBe(0)
  })

  it('開通後に触れると遷移は一度だけ予約される', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    exit._check(player)
    exit._check(player)
    exit._check(player)
    expect(mocks.notices.length).toBe(1)
  })

  // レビュー Finding 1: 降下の予約は terminal の完了コールバックではなく
  // state に積む。コールバックに載せていたときは、通過演出の約 5 秒のあいだに
  // 別の通知が 1 つ出るだけで terminal_cancel() に予約ごと消され、深度が
  // 進まないままフロアが詰んだ。予約が state 側にあることをここで固定する。
  //
  // 秒数はターミナルの通知の長さではなく descend_duration。通知の文面を足した
  // だけで降下が延びると、「乗ったのに何も起きない」時間がそのぶん伸びる。
  it('降下は descend_duration ぶん state.descend_timer に予約される', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    exit._check(player)
    expect(state.descend_timer).toBe(descend_duration)
  })

  // レビュー Finding 1: ラン終了と同じフレームで通知を出すと、run_end() が
  // death_screen_show() で止めたターミナルを再び動かしてしまう。run_end() は
  // death_screen_show() を呼ぶ前に game_running を落とすので、ここでその値を
  // 見れば判定できる。
  it('ラン終了後（state.game_running が 0）は開通していても遷移を予約しない', () => {
    const exit = new entity_exit_t(80, 0, 80, 0, 18)
    state.exit_open = 1
    state.game_running = 0
    exit._check(player)
    expect(mocks.notices.length).toBe(0)
    expect(state.descend_timer).toBe(0)
  })
})
