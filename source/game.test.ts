import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { run_start } from './game'
import { entity_health_t } from './entity-health'
import { entity_yani_t } from './entity-yani'
import { state } from './state'

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
