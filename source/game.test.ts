import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// game.ts のループを Node で回す。DOM / WebGL / 音を触るモジュールだけ差し替え、
// エンティティと生成器は本物を使う（死亡シーケンスの配線を実物で確かめるため）。
// performance.now と requestAnimationFrame は import より前に必要なので vi.hoisted で置く。
const harness = vi.hoisted(() => {
  const clock = { now: 1000 }
  const pending: Array<() => void> = []
  const death_screens: unknown[] = []
  const notices: string[] = []
  const fade = {
    style: { opacity: '0' },
    classes: new Set<string>(),
    classList: {
      add(c: string) { fade.classes.add(c) },
      remove(c: string) { fade.classes.delete(c) },
    },
  }
  const globals = globalThis as Record<string, unknown>
  globals.performance = { now: () => clock.now }
  globals.requestAnimationFrame = (cb: () => void) => { pending.push(cb); return 1 }
  return { clock, pending, death_screens, notices, fade }
})

vi.mock('./renderer', () => ({
  camera: { x: 0, y: 0, z: 0, shake: 0 },
  push_quad: () => {},
  push_sprite: () => {},
  push_block: () => {},
  push_floor: () => {},
  push_light: () => {},
  renderer_end_frame: () => {},
  renderer_freeze_level_geometry: () => {},
  renderer_prepare_frame: () => {},
  renderer_reset_level_geometry: () => {},
}))
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_music_death: () => {},
  audio_music_restore: () => {},
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
  audio_sfx_lighter: undefined,
  audio_sfx_exhale: undefined,
  audio_sfx_door: undefined,
}))
vi.mock('./hud', () => ({ hud_hide: () => {}, hud_show: () => {}, hud_update: () => {} }))
vi.mock('./minimap', () => ({ minimap_reset: () => {}, minimap_update: () => {} }))
vi.mock('./monologue', () => ({
  monologue_arrival: () => {},
  monologue_all_done: () => {},
  monologue_complete: () => {},
  monologue_death: () => {},
  monologue_drone_kill: () => {},
  monologue_dummy: () => {},
  monologue_interrupt: () => {},
  monologue_notify_stage: () => {},
  monologue_reset: () => {},
  monologue_update: () => {},
}))
vi.mock('./terminal', () => ({
  terminal_show_notice: (text: string) => { harness.notices.push(text) },
}))
vi.mock('./death-screen', () => ({
  death_screen_show: (result: unknown) => { harness.death_screens.push(result) },
}))
vi.mock('./dom', () => ({ fade_el: harness.fade }))
vi.mock('./equip-screen', () => ({ equip_screen_show: () => {} }))

import { run_start } from './game'
import { entity_t } from './entity'
import { entity_boss_plasma_t, entity_boss_t } from './entity-boss'
import { entity_drone_t } from './entity-drone'
import { entity_health_t } from './entity-health'
import { entity_plasma_t } from './entity-plasma'
import { entity_yani_t } from './entity-yani'
import { key_shoot, keys } from './input'
import { level_data, state } from './state'

// フレーム間隔は 1/16 秒。二進で正確に表せるので、何フレーム進めても
// state.death_elapsed に丸め誤差が溜まらず、ビートの境界をまたぐ位置が動かない
// （0.1 秒刻みだと 30 フレームで 2.9999999999999996 になり、判定が 1 フレームずれる）。
// game_tick の time_elapsed 上限 0.1 秒にも収まる
const frame_ms = 62.5
const frame_seconds = frame_ms / 1000

// 1 フレーム進める。時計を動かしてから、積まれている rAF コールバックを 1 つ呼ぶ。
// game_tick は末尾で次のコールバックを積むので、ループは自走し続ける
function step(): void {
  harness.clock.now += frame_ms
  harness.pending.shift()!()
}

function advance(seconds: number): void {
  for (let i = 0; i < Math.round(seconds / frame_seconds); i++) { step() }
}

function start_run(): void {
  harness.death_screens.length = 0
  harness.notices.length = 0
  // pending は空にしない。run_start() が game_tick を直接呼ぶのは初回だけで
  // （game.ts の game_started）、捨ててしまうと 2 本目以降のテストで
  // ループを回す手段が無くなる
  run_start()
  step() // 1 フレーム回して初期化直後の状態を安定させる
}

// 自機を即死させる（ニコチン切れ経路。被弾無敵を通らないので確実に落ちる）
function kill_player(): void {
  const player = state.entity_player!
  player.h = 1
  player._receive_withdrawal_damage()
}

describe('死亡シーケンスの進行', () => {
  beforeEach(() => {
    start_run()
  })

  it('3 秒後に死亡画面へ移り、それまでは移らない', () => {
    kill_player()
    advance(2.875)
    expect(harness.death_screens.length).toBe(0)
    expect(state.game_running).toBe(1)

    advance(0.125) // 3.0 秒
    expect(harness.death_screens.length).toBe(1)
    expect(state.game_running).toBe(0)
    expect(state.dying).toBe(0)
  })

  it('1.2 秒で救護ドローンの通知を出す', () => {
    kill_player()
    harness.notices.length = 0
    advance(1.125)
    expect(harness.notices.length).toBe(0)

    advance(0.125) // 1.25 秒（1.2 をまたぐ）
    expect(harness.notices).toEqual(['倒れた侵入者を検出___救護ドローンを派遣'])
  })

  // 湧く時刻そのものは death-sequence-model.test.ts が持つ。ここで見るのは
  // ループが実際に煙エンティティを生んでいること（煙の寿命は 2 秒なので、
  // 生存数で数えられるのは湧き終わる 1.8 秒より手前だけ）
  it('魂の煙が立ちのぼる', () => {
    const smoke_count = (): number =>
      state.entities.filter((e) => e.s === 38 && !e._dead).length
    const before = smoke_count()
    kill_player()
    advance(1.0625) // 0.2 / 0.6 / 1.0 の 3 発
    expect(smoke_count() - before).toBe(3)
  })

  it('生存時間は死んだ瞬間で止まる', () => {
    advance(0.5)
    kill_player()
    const frozen = state.run_time
    advance(1)
    expect(state.run_time).toBe(frozen)
  })

  it('シーケンス中はニコチンが減らない', () => {
    kill_player()
    const frozen = state.nicotine
    advance(1)
    expect(state.nicotine).toBe(frozen)
  })

  it('白フェードは持ち上げ（1.8 秒）から掛かり、死亡画面が出ると明けはじめる', () => {
    kill_player()
    advance(1.75)
    expect(Number(harness.fade.style.opacity)).toBe(0)

    advance(0.625) // 2.375 秒: フェードの途中
    const mid = Number(harness.fade.style.opacity)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)

    advance(0.625) // 3.0 秒: run_end → 真っ白から明けはじめる
    expect(harness.fade.style.opacity).toBe('0')
    expect(harness.fade.classes.has('f')).toBe(true)
  })
})

// 死体は 3 秒間エンティティとして残るため、放っておくと回復パックやヤニに
// 反応してしまう。死亡画面は HP と獲得ヤニをそのまま出すので、死後に動くと
// 「HP 1 で死亡」「死んでから稼いだヤニ」が表示される
describe('死亡シーケンス中の死体は何にも触れない', () => {
  beforeEach(() => {
    start_run()
  })

  it('回復パックを拾わない', () => {
    const player = state.entity_player!
    kill_player()
    expect(player.h).toBe(0)
    new entity_health_t(player.x, 0, player.z, 5, 31)

    advance(0.5)
    expect(player.h).toBe(0)
  })

  it('ヤニを拾わない', () => {
    const player = state.entity_player!
    kill_player()
    // 清掃ドローンを撃破するとヤニは速度を持って飛ぶので、死体の上にも来うる
    new entity_yani_t(player.x, 0, player.z, 5, 26)
    const frozen = state.yani_run

    advance(0.5)
    expect(state.yani_run).toBe(frozen)
  })
})

// 死体は load_level が entities を作り直すまで消えないので、リザルト表示中も
// 敵と一緒に画面に残り続ける（canvas は不透明度 0.3 で見えている）
describe('リザルト表示中の死体', () => {
  beforeEach(() => {
    start_run()
    kill_player()
    advance(3)
  })

  it('敵に触れても死亡シーケンスが再開しない', () => {
    const player = state.entity_player!
    harness.notices.length = 0

    player._receive_damage(player, 1)
    advance(1.5)

    expect(state.dying).toBe(0)
    expect(harness.notices).toEqual([]) // 表示中のリザルトを壊す通知を出さない
    expect(harness.death_screens.length).toBe(1)
  })

  it('回復パックを拾わない', () => {
    const player = state.entity_player!
    new entity_health_t(player.x, 0, player.z, 5, 31)

    advance(0.5)
    expect(player.h).toBe(0)
  })
})

describe('装備の入れ替え中はゲームが止まる', () => {
  beforeEach(() => {
    start_run()
    state.paused = 0
  })

  // assert が例外を投げるとテスト末尾の後片付けは実行されない。afterEach なら
  // 成否によらず必ず戻るので、次のテストへ keys[key_shoot] が漏れない
  afterEach(() => {
    keys[key_shoot] = 0
  })

  it('ニコチンも生存時間も進まない', () => {
    const nicotine = state.nicotine
    const run_time = state.run_time
    state.paused = 1
    advance(2)
    expect(state.nicotine).toBe(nicotine)
    expect(state.run_time).toBe(run_time)
    state.paused = 0
    advance(2)
    expect(state.nicotine).toBeLessThan(nicotine)
  })

  it('エンティティが動かない', () => {
    const player = state.entity_player!
    player.vx = 100
    const x = player.x
    state.paused = 1
    advance(1)
    expect(player.x).toBe(x)
  })

  // time_elapsed = 0 だけでは足りない。_last_shot -= 0 は負のままなので、
  // 押しっぱなしのスペースで毎フレーム弾が生成される
  it('止まっている間に弾が積み上がらない', () => {
    keys[key_shoot] = 1
    state.paused = 1
    const before = state.entities.length
    advance(1)
    expect(state.entities.length).toBe(before)
  })

  it('降下予約が消化されない', () => {
    state.descend_timer = 0.5
    state.paused = 1
    advance(2)
    expect(state.descend_timer).toBe(0.5)
  })
})

// 撃破ドロップはループの衝突判定を通ってはじめて成立する。エンティティ単体の
// テスト（entity-drone.test.ts）は _receive_damage を直に呼ぶので、死体が
// 同一フレームに残ることで起きる取り合いを捕まえられない
describe('清掃ドローンの撃破ドロップ', () => {
  function live_yani(): entity_yani_t[] {
    return state.entities.filter(
      (e): e is entity_yani_t => e instanceof entity_yani_t && !e._dead,
    )
  }

  beforeEach(() => {
    start_run()
    level_data.fill(1) // 壁でプラズマが自壊しないよう全面を床にする
  })

  it('ばら撒いたヤニが撃破したドローンの死体に回収されない', () => {
    const player = state.entity_player!
    state.depth = 4 // 1 個あたりの価値 = 深度。合計が数と別の数字になる
    // 自機から遠くで撃破する（近いと自機が拾って症状が隠れる）
    const x = player.x + 200
    const z = player.z + 200
    const drone = new entity_drone_t(x, 0, z, 5, 39)
    drone.h = 1
    new entity_plasma_t(x, 0, z, 1, 26, 0)
    const before = live_yani()

    step()

    expect(drone._dead).toBe(true)
    const dropped = live_yani().filter((y) => before.indexOf(y) === -1)
    expect(dropped.length).toBe(30)
    expect(dropped.reduce((sum, y) => sum + y._value, 0)).toBe(120)
  })
})

describe('衝突判定の幅', () => {
  class probe_t extends entity_t {
    hits = 0
    override _check(_other: entity_t): void { this.hits++ }
  }

  beforeEach(() => { start_run() })

  // フロアの外の虚空（タイル値 0）に置く。壁ではないので _collides に
  // 引っかからず、他のエンティティとも重ならない
  it('既定の幅 9 では 9 離れると当たらない', () => {
    const a = new probe_t(490, 0, 490, 0, 0)
    new probe_t(499, 0, 490, 0, 0)
    step()
    expect(a.hits).toBe(0)
  })

  it('幅を広げた側は広げた分だけ当たる', () => {
    const a = new probe_t(490, 0, 490, 0, 0)
    a.w = 14
    const b = new probe_t(499, 0, 490, 0, 0)
    step()
    expect(a.hits).toBe(1)
    expect(b.hits).toBe(1)
  })
})

// 深度 5 まで降りる。非常口の開通を待たずに次のフロアへ行けるよう、
// 降下は state を直接触らずに game.ts の予約経路を使う
function descend_to(depth: number): void {
  while (state.depth < depth) {
    state.exit_open = 1
    state.descend_timer = 0.01
    advance(0.125)
  }
}

describe('ボス', () => {
  beforeEach(() => { start_run() })

  it('ボス階でだけ湧き、耐久が深度で決まる', () => {
    descend_to(5)
    const bosses = state.entities.filter((e) => e instanceof entity_boss_t)
    expect(bosses.length).toBe(1)
    expect(bosses[0].h).toBe(60)
    expect(state.boss_alive).toBe(1)
  })

  it('通常フロアには湧かない', () => {
    descend_to(4)
    expect(state.entities.some((e) => e instanceof entity_boss_t)).toBe(false)
    expect(state.boss_alive).toBe(0)
  })

  // 何発が何度から出るかは boss-model.test.ts が固定する。ここで見るのは
  // 「弾が生まれて生き残る」配線だけ — 銃口が灰皿タイルの中にあると、
  // 生まれた次のフレームで壁判定に消される
  it('掃射で弾を吐き、その弾が壁で即死しない', () => {
    descend_to(5)
    advance(1)
    expect(state.entities.some((e) => e instanceof entity_boss_plasma_t)).toBe(true)
  })

  it('動かない', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const { x, z } = boss
    advance(2)
    expect(boss.x).toBe(x)
    expect(boss.z).toBe(z)
  })
})
