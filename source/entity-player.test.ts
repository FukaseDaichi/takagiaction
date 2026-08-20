import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_light の引数を覗くため、モックの外に配列を用意する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({ light_calls: [] as number[][] }))

vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_block: () => {},
  push_light: (...args: number[]) => { mocks.light_calls.push(args) },
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
vi.mock('./game', () => ({ run_end: () => {}, next_level: () => {} }))

import { entity_player_t } from './entity-player'
import { entity_plasma_t } from './entity-plasma'
import { key_right, key_shoot, key_spare, keys } from './input'
import { meta } from './meta'
import { level_data, state } from './state'

function plasma_count(): number {
  return state.entities.filter((e) => e instanceof entity_plasma_t).length
}

describe('自機とニコチン段階', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 100
    state.nicotine_max = 100
    state.smoking = 0
    meta.levels.power = 0
    mocks.light_calls.length = 0
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('通常時の移動加速度は 128', () => {
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(128)
  })

  it('離脱症状（30% 以下）では 96 に落ちる', () => {
    state.nicotine = 20
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(96)
  })

  it('そわそわ（60% 以下）では移動速度は落ちない', () => {
    state.nicotine = 50
    keys[key_right] = 1
    player._update()
    expect(player.ax).toBe(128)
  })

  it('一服中は移動も射撃もできない', () => {
    state.smoking = 1
    keys[key_right] = 1
    keys[key_shoot] = 1
    player._update()
    expect(player.ax).toBe(0)
    expect(player.az).toBe(0)
    expect(plasma_count()).toBe(0)
  })

  // 加速度を切るだけだと、走り込んだ勢いで摩擦が抜けるまで約 4.7px 滑る。
  // 重なり判定は 9px なので、滑って接触が外れると一服が勝手に中断する。
  it('一服中は慣性でも動かない', () => {
    state.smoking = 1
    player.vx = 25.6 // 終端速度
    player.vz = 25.6
    const x = player.x
    const z = player.z
    for (let i = 0; i < 30; i++) { player._update() }
    expect(player.x).toBe(x)
    expect(player.z).toBe(z)
  })

  it('通常時は射撃間隔 0.1 秒で撃てる', () => {
    keys[key_shoot] = 1
    player._update()
    expect(plasma_count()).toBe(1)

    // 0.1 秒経つまでは次が出ない
    state.time_elapsed = 0.05
    player._update()
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.06
    player._update()
    expect(plasma_count()).toBe(2)
  })

  it('離脱症状では射撃間隔が 1.8 倍になる', () => {
    state.nicotine = 20
    keys[key_shoot] = 1
    player._update()
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.15
    player._update()
    expect(plasma_count()).toBe(1) // 0.18 秒に届かない

    state.time_elapsed = 0.04
    player._update()
    expect(plasma_count()).toBe(2)
  })

  it('火力強化で射撃間隔が縮む（3 段で 0.064 秒）', () => {
    meta.levels.power = 3
    keys[key_shoot] = 1
    player._update() // 1 発目
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.05
    player._update()
    expect(plasma_count()).toBe(1) // 0.064 秒に届かない

    state.time_elapsed = 0.02
    player._update()
    expect(plasma_count()).toBe(2)
  })

  // レビュー B-4: RGB ではなく falloff（第 7 引数）で半径を縮める
  it('ライトの falloff が段階に応じて上がる', () => {
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.04)

    mocks.light_calls.length = 0
    state.nicotine = 50
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.07)

    mocks.light_calls.length = 0
    state.nicotine = 10
    player._render()
    expect(mocks.light_calls[0][6]).toBe(0.1)
  })
})

describe('ニコチン切れの継続ダメージ', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 0
    state.nicotine_max = 100
    state.smoking = 0
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('被弾の無敵時間を無視して HP を減らす', () => {
    // 実ゲームでは game_tick が _update() を先に回してから衝突判定に入るので、
    // _receive_damage が呼ばれる時点で _last_damage は必ず 0 未満になっている。
    // 生成直後は 0 なので、その順序をテストでも再現する。
    player._update()

    player._receive_damage(player, 1) // ここで 2 秒の無敵が張られる
    expect(player.h).toBe(4)

    player._receive_withdrawal_damage()
    expect(player.h).toBe(3)
    player._receive_withdrawal_damage()
    expect(player.h).toBe(2)
  })

  it('HP が 0 になるとランが終わる', () => {
    player.h = 1
    player._receive_withdrawal_damage()
    expect(player.h).toBe(0)
    expect(player._dead).toBe(true)
  })
})

describe('予備の一本', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 20
    state.nicotine_max = 100
    state.smoking = 0
    state.game_running = 1
    state.spares_left = 2
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('E キーで 50% 回復し、残数が減り、キーは消費される', () => {
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(70)
    expect(state.spares_left).toBe(1)
    expect(keys[key_spare]).toBe(0)
  })

  it('回復は最大値で頭打ちになる', () => {
    state.nicotine = 80
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(100)
  })

  it('残数 0 では何も起きない', () => {
    state.spares_left = 0
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(keys[key_spare]).toBe(0)
  })

  it('一服中は使えず、残数も減らない', () => {
    state.smoking = 1
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(state.spares_left).toBe(2)
  })

  // リザルト表示中に terminal_show_notice を呼ぶと、表示チェーンが壊れて
  // クリック復帰できなくなる（既存レビュー Finding 1 と同じ構図）
  it('ラン終了後は使えない', () => {
    state.game_running = 0
    keys[key_spare] = 1
    player._update()
    expect(state.nicotine).toBe(20)
    expect(state.spares_left).toBe(2)
  })
})
