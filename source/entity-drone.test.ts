import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('./terminal', () => ({ terminal_show_notice: vi.fn() }))
// monologue も dom.ts に触る（entity-player の死亡シーケンスも到達する）
vi.mock('./monologue', () => ({ monologue_death: vi.fn(), monologue_drone_kill: vi.fn() }))

import { entity_drone_t } from './entity-drone'
import { entity_explosion_t } from './entity-explosion'
import { entity_plasma_t } from './entity-plasma'
import { entity_player_t } from './entity-player'
import { entity_smoke_t } from './entity-smoke'
import { entity_yani_t } from './entity-yani'
import { monologue_drone_kill } from './monologue'
import { camera } from './renderer'
import { level_data, state } from './state'
import { terminal_show_notice } from './terminal'

function live_yani(): entity_yani_t[] {
  return state.entities.filter(
    (e): e is entity_yani_t => e instanceof entity_yani_t && !e._dead,
  )
}

function yani_count(): number {
  return live_yani().length
}

// 実体の数ではなく、拾ったときに増えるヤニの合計
function yani_value(): number {
  return live_yani().reduce((sum, y) => sum + y._value, 0)
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
    state.depth = 1
    camera.shake = 0
    vi.clearAllMocks()
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  afterEach(() => { vi.restoreAllMocks() })

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

  it('倒すと深度 × 30 のヤニをまき散らす', () => {
    state.depth = 4
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(drone._dead).toBe(true)
    expect(state.kills).toBe(1)
    expect(yani_value()).toBe(120)
  })

  // 深度で増やすのは 1 個あたりの価値だけ。実体を増やすと拾得音が連射になり、
  // 回収に払う時間（＝ニコチンの減少）が報酬に見合わなくなる
  it('ばら撒く実体の数は深度によらず 30 個', () => {
    state.depth = 10
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(yani_count()).toBe(30)
  })

  it('回収した分は価値 1 のまま上乗せして返る', () => {
    state.depth = 4
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    for (let i = 0; i < 3; i++) {
      const yani = new entity_yani_t(80, 0, 64, 5, 26)
      yani._check(drone)
    }
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(yani_count()).toBe(30 + 3)
    expect(yani_value()).toBe(120 + 3)
  })

  it('自機のプラズマが当たる（HP 10）', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    plasma._check(drone)
    expect(drone.h).toBe(9)
    expect(plasma._dead).toBe(true)
  })

  // 角度を完全な乱数にすると 30 個では偏って団子になり、「弾けた」形にならない
  it('ばら撒くヤニは等角に散る', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    const directions = new Set(
      live_yani().map((y) => Math.round(Math.atan2(y.vz, y.vx) * 1000)),
    )
    expect(directions.size).toBe(30)
  })

  // 蜘蛛 1 / セントリー 3 / 自機の死 5 に対して、ゲームで最も大きく揺らす
  it('撃破でカメラが最も大きく揺れる', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(camera.shake).toBe(6)
  })

  it('撃破で爆発が機体の周囲に 3 発起きる', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    const blasts = state.entities.filter((e) => e instanceof entity_explosion_t)
    expect(blasts.length).toBe(3)
    // 1 点に重ねると光が固まって「割れた」感が出ない
    expect(new Set(blasts.map((b) => b.x + ',' + b.z)).size).toBe(3)
  })

  it('撃破で残骸から煙が立つ', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(state.entities.filter((e) => e instanceof entity_smoke_t).length).toBe(2)
  })

  // 同じ座標に出すと横揺れ（y から決まる）まで一致して 1 つにしか見えない
  it('残骸の煙は重ならない位置に出る', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    const smoke = state.entities.filter((e) => e instanceof entity_smoke_t)
    expect(new Set(smoke.map((e) => e.x)).size).toBe(2)
  })

  // HUD はヤニを常設表示しない（docs/gameplay.md「HUD は安全なときに黙る」）ので、
  // 深度で報酬が伸びたことがラン中に分かるのはこの通知だけ
  it('ターミナルが飛散したヤニの総額を通知する', () => {
    state.depth = 4
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    for (let i = 0; i < 3; i++) {
      const yani = new entity_yani_t(80, 0, 64, 5, 26)
      yani._check(drone)
    }
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(terminal_show_notice).toHaveBeenCalledWith(expect.stringContaining('ヤニ 123'))
  })

  it('撃破で高木がつぶやく', () => {
    const drone = new entity_drone_t(80, 0, 64, 5, 39)
    const plasma = new entity_plasma_t(80, 0, 64, 1, 26, 0)
    drone._receive_damage(plasma, 10)
    expect(monologue_drone_kill).toHaveBeenCalled()
  })

  it('プレイヤーに接触してもダメージを与えない', () => {
    const drone = new entity_drone_t(64, 0, 64, 5, 39)
    const hp = player.h
    drone._check(player)
    player._check(drone)
    expect(player.h).toBe(hp)
  })
})
