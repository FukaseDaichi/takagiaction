import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// game.ts のループを Node で回す。DOM / WebGL / 音を触るモジュールだけ差し替え、
// エンティティと生成器は本物を使う（死亡シーケンスの配線を実物で確かめるため）。
// performance.now と requestAnimationFrame は import より前に必要なので vi.hoisted で置く。
const harness = vi.hoisted(() => {
  const clock = { now: 1000 }
  const pending: Array<() => void> = []
  const death_screens: unknown[] = []
  const notices: string[] = []
  const boss_rewards: unknown[] = []
  const floors: number[][] = []
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
  return { clock, pending, death_screens, notices, boss_rewards, floors, fade }
})

vi.mock('./renderer', () => ({
  camera: { x: 0, y: 0, z: 0, shake: 0 },
  push_quad: () => {},
  push_sprite: () => {},
  push_block: () => {},
  push_floor: (...args: number[]) => { harness.floors.push(args) },
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
  audio_music_boss: vi.fn(),
  audio_music_normal: vi.fn(),
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
  monologue_arrival: vi.fn(),
  monologue_all_done: () => {},
  monologue_boss_arrival: vi.fn(),
  monologue_boss_kill: vi.fn(),
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
vi.mock('./boss-reward', () => ({ boss_reward_show: () => { harness.boss_rewards.push(1) } }))

import { run_start } from './game'
import { audio_music_boss, audio_music_normal } from './audio'
import { boss_centre } from './boss-model'
import { entity_t } from './entity'
import { entity_boss_plasma_t, entity_boss_t } from './entity-boss'
import { entity_container_t } from './entity-container'
import { entity_drone_t } from './entity-drone'
import { entity_exit_t, tile_exit_floor } from './entity-exit'
import { entity_health_t } from './entity-health'
import { entity_plasma_t } from './entity-plasma'
import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_yani_t } from './entity-yani'
import * as equipment from './equipment'
import { key_shoot, keys } from './input'
import { meta, meta_max_level, meta_upgrade_ids } from './meta'
import {
  monologue_arrival, monologue_boss_arrival, monologue_boss_kill,
} from './monologue'
import { level_data, level_height, level_width, state } from './state'

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
  harness.boss_rewards.length = 0
  harness.floors.length = 0
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

// 開通した非常口は壁の描画をやめるだけなので、あとは床しか残らない。緑の枠を
// 敷いた床がその 1 タイルを指す（docs/gameplay.md「非常口はどこにあるか」）
describe('非常口の床', () => {
  it('非常口のタイルだけ緑の枠の床が敷かれる', () => {
    start_run()
    const exit = state.entities.find((e) => e instanceof entity_exit_t)!
    const at_exit = harness.floors.filter((f) => f[0] === exit.x && f[1] === exit.z)
    expect(at_exit.length).toBe(1)
    expect(at_exit[0][2]).toBe(tile_exit_floor)
    // 他のタイルには漏れない（喫煙所・ダミーは素の床のまま）
    const elsewhere = harness.floors.filter(
      (f) => f[2] === tile_exit_floor && !(f[0] === exit.x && f[1] === exit.z),
    )
    expect(elsewhere.length).toBe(0)
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

// 目的の深度まで降りる。state.depth を直に書き換えず、非常口を開通させて
// 降下予約（descend_timer）を積み、game_tick に next_level() を呼ばせる。
// 一服してゲージを回復する手間なしにフロアを跨げる
function descend_to(depth: number): void {
  while (state.depth < depth) {
    state.exit_open = 1
    state.descend_timer = 0.01
    advance(0.125)
  }
}

describe('ボス', () => {
  // 幅 0 の点で判定の縁を測る。ボス以外の接触は数えない（中央のタイルには
  // 喫煙所のエンティティも重なっている）
  class boss_probe_t extends entity_t {
    hits = 0
    override _check(other: entity_t): void {
      if (other instanceof entity_boss_t) { this.hits++ }
    }
  }

  function probe_at(x: number, z: number): boss_probe_t {
    const probe = new boss_probe_t(x, 0, z, 0, 0)
    probe.w = 0
    return probe
  }

  // ボスは周回で毎フレーム動く（entity-boss.ts「ボスの周回」）ため、位置を
  // 固定したまま当たり判定だけを見たいテストは、時計を進めずに rAF
  // コールバックだけを呼ぶ。time_elapsed が 0 になり、_move() は現在地を
  // そのまま返す（速さに現在地からの移動量を掛けた値が 0 になるため）
  function step_frozen(): void {
    harness.pending.shift()!()
  }

  // 喫煙所エンティティ（本物）を見つける。ボス階では灰皿と同じタイルに
  // 立つが、当たり判定の中心はボスの補正（boss_spawn_offset）とは無関係に
  // 別々に決まるので、接触位置は喫煙所エンティティ自身の座標から作る
  function find_smoking_area(): entity_smoking_area_t {
    return state.entities.find(
      (e): e is entity_smoking_area_t => e instanceof entity_smoking_area_t && e.is_real,
    )!
  }

  // meta.levels はラン間で持ち越す恒久状態で、このファイル内ではテストを
  // 跨いで同じインスタンスを共有する。全 6 本上限を試すテストが書き換える値
  // なので、他のテストが前提にする既定値を壊さないよう毎テストの前後で
  // スナップショットを取って戻す
  let meta_levels_snapshot: typeof meta.levels

  beforeEach(() => {
    start_run()
    meta_levels_snapshot = { ...meta.levels }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.assign(meta.levels, meta_levels_snapshot)
  })

  it('ボス階でだけ湧き、耐久が深度で決まる', () => {
    descend_to(5)
    const bosses = state.entities.filter((e) => e instanceof entity_boss_t)
    expect(bosses.length).toBe(1)
    expect(bosses[0].h).toBe(60)
    expect(state.boss_alive).toBe(1)
    // 到達通知はボス階側の文言で、つぶやきもボス用に分岐していること
    expect(harness.notices[harness.notices.length - 1]).toBe(
      '深度 5 に到達___大型作業機の稼働音を検知',
    )
    expect(monologue_boss_arrival).toHaveBeenCalled()
    // BGM の切替も到達通知・つぶやきと同じ if 側の分岐。この行を削っても
    // 上のアサーションだけでは気づけない。深度 5 に着くまでの通常フロア
    // （1〜4）でも audio_music_normal は呼ばれているので、ここで固定するのは
    // 「ボス階でも呼ばれたこと」だけ。not.toHaveBeenCalled() 側は次の
    // 「通常フロアには湧かない」テストが持つ
    expect(audio_music_boss).toHaveBeenCalled()
  })

  it('通常フロアには湧かない', () => {
    descend_to(4)
    expect(state.entities.some((e) => e instanceof entity_boss_t)).toBe(false)
    expect(state.boss_alive).toBe(0)
    // if 側（ボス階）の分岐と対をなす防波堤。ここを崩すと分岐が入れ替わっても
    // 気づけない（通常フロアの到達通知・つぶやきがボス用になってしまう）
    expect(harness.notices[harness.notices.length - 1]).toBe(
      '深度 4 に到達___喫煙所の残り香を探知中...',
    )
    expect(monologue_boss_arrival).not.toHaveBeenCalled()
    // else 側（通常フロア）自身が実際に発話したことも固定する。else を丸ごと
    // 落として何も呼ばなくても、上のアサーションだけでは気づけない
    expect(monologue_arrival).toHaveBeenCalled()
    // BGM も同様。else を丸ごと落としても on/off の対で固定していないと気づけない
    expect(audio_music_boss).not.toHaveBeenCalled()
    expect(audio_music_normal).toHaveBeenCalled()
  })

  // 何発が何度から出るかは boss-model.test.ts が固定する。ここで見るのは
  // 「弾が生まれて生き残る」配線だけ — 銃口が灰皿タイルの中にあると、
  // 生まれた次のフレームで壁判定に消される
  it('掃射で弾を吐き、その弾が壁で即死しない', () => {
    descend_to(5)
    advance(1)
    expect(state.entities.some((e) => e instanceof entity_boss_plasma_t)).toBe(true)
  })

  it('被弾してもノックバックを受けない', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const { x, z } = boss
    // 速度を持つ弾から食らわせる。セントリーは from の速度の 0.1 倍で弾かれる
    // （docs/enemies.md）ので、止まっている相手から食らうとノックバックを
    // 足してもこのテストが通ってしまう
    const shot = new entity_plasma_t(boss.x + 40, 0, boss.z + 40, 1, 26, -Math.PI * 0.75)
    boss._receive_damage(shot, 1)
    // 速度も位置も即座には変わらない。vx/vz を経由しない、位置へ直接書く
    // ノックバック実装が紛れ込んでもここで検出できる
    expect(boss.vx).toBe(0)
    expect(boss.vz).toBe(0)
    expect(boss.x).toBe(x)
    expect(boss.z).toBe(z)
    // 周回で位置は動くが（entity-boss.ts「ボスの周回」）、それは vx/vz を
    // 経由しない直接移動なので、時間が経ってもノックバックの速度は乗らない
    advance(2)
    expect(boss.vx).toBe(0)
    expect(boss.vz).toBe(0)
  })

  // 判定・絵・銃口が灰皿タイルの中心を共有していること。ずれると、絵の輪郭に
  // 撃った弾がすり抜けて素の床で当たる（w を 14 に広げた目的そのもの）。
  // 中心の基準点はレベル形状から独立に求める（boss.x + boss_centre から
  // 求めると、boss_spawn_offset がずれた実装でも自分自身と一致してしまい、
  // 検出力を失う）。ボスは周回で毎フレーム動くため、判定だけを見たい
  // ところは time_elapsed = 0 の凍結フレームで走らせる
  // （時間を進めると _move() が中心を実際にずらしてしまう）
  it('当たり判定は絵と同じ中心を持つ', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    // 座席（_home_x/z）はレベル中央の灰皿タイルの中心と一致するはず。
    // フィールド初期化子で 1 度決まるだけで書き換わらないので、周回で
    // 動いたあとでも厳密な等値で見られる
    expect(boss._home_x).toBe((level_width >> 1) * 8 + 4)
    expect(boss._home_z).toBe((level_height >> 1) * 8 + 4)
    const cx = boss.x + boss_centre
    const cz = boss.z + boss_centre
    // 絵は中心 ±6（一辺 12）、判定は ±7（一辺 14）
    const edge = probe_at(cx - 6, cz - 6) // 絵の左上の角
    const bare = probe_at(cx + 8, cz + 8) // 絵の右下 2 外の素の床
    step_frozen()
    expect(edge.hits).toBe(1)
    expect(bare.hits).toBe(0)
  })

  it('自機のプラズマでダメージが入る', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const before = boss.h
    // 判定（幅 14）の中に置いて止める。この座標も灰皿タイル＝壁の上なので、
    // 弾は静止させても自分の _update() の壁判定で消える（動かしても同じ）。
    // ただしボスは弾より先に生まれていて entities の添字が小さいため、
    // ダメージはボス側の内側ループが弾の更新より前に当てている。見たいのは
    // 配線だけなので、弾の生死には左右されないよう静止させて座標を単純にする
    const shot = new entity_plasma_t(boss.x + 10, 0, boss.z, 0, 26, 0)
    shot.vx = 0
    shot.vz = 0
    step()
    expect(boss.h).toBe(before - 1)
  })

  it('ボスが生きている間は一服が始まらない', () => {
    descend_to(5)
    const player = state.entity_player!
    const smoking_area = find_smoking_area()
    // 喫煙所エンティティ（幅 9）に重なる位置。灰皿タイルの脇からボスの
    // 攻撃範囲にも入るが、見たいのは一服が始まらないことだけ
    player.x = smoking_area.x - 4
    player.z = smoking_area.z
    advance(0.5)
    expect(state.smoking).toBe(0)
    expect(state.exit_open).toBe(0)
  })

  it('ボスを倒すと一服できる', () => {
    descend_to(5)
    state.boss_alive = 0
    const player = state.entity_player!
    const smoking_area = find_smoking_area()
    player.x = smoking_area.x - 4
    player.z = smoking_area.z
    advance(0.5)
    expect(state.smoking).toBe(1)
  })

  it('撃破で残弾が消え、コンテナが必ず 1 個落ちる', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    advance(1) // 弾を出させる
    expect(state.entities.some((e) => e instanceof entity_boss_plasma_t)).toBe(true)

    boss._receive_damage(state.entity_player!, 999)
    step()
    expect(state.boss_alive).toBe(0)
    expect(state.entities.some((e) => e instanceof entity_boss_plasma_t)).toBe(false)
    expect(state.entities.filter((e) => e instanceof entity_container_t).length).toBe(1)
    // 撃破の事実はターミナルへ、感情はつぶやきへ（docs/story.md「声の使い分け」）
    expect(harness.notices[harness.notices.length - 1]).toBe(
      '灰皿撤去ユニットの応答が途絶___区画の封鎖を解除',
    )
    expect(monologue_boss_kill).toHaveBeenCalled()
  })

  // コンテナの座標は撃破した瞬間の boss.x/z + boss_centre で見る。ボスは
  // 周回で動くため、灰皿タイルの中心という固定値はもう撃破位置と一致しない
  // （そこから離れているのがこのタスクの主眼）。died 前に独立に計算しておき、
  // boss.x をそのまま使う（+boss_centre を忘れる）ような _kill() の実装でも
  // 見分けられるようにする
  it('落ちたコンテナは撃破位置に立つ', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const cx = boss.x + boss_centre
    const cz = boss.z + boss_centre
    boss._receive_damage(state.entity_player!, 999)
    step()
    const container = state.entities.find(
      (e): e is entity_container_t => e instanceof entity_container_t,
    )!
    expect(container.x).toBe(cx)
    expect(container.z).toBe(cz)
  })

  // 2 回とも同じ depth で引くので、gear_roll_tier を実装と差し替えて戻り値だけ
  // 差し替える。順序を入れ替えた 2 本で「先勝ち」「後勝ち」のどちらでもないことを見る
  it('段は 2 回引いた高いほうを採る（先の引きが高い場合）', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const roll = vi.spyOn(equipment, 'gear_roll_tier')
    roll.mockReturnValueOnce(8).mockReturnValueOnce(3)

    boss._receive_damage(state.entity_player!, 999)
    step()
    const container = state.entities.find(
      (e): e is entity_container_t => e instanceof entity_container_t,
    )!
    expect(container._tier).toBe(8)
    expect(roll).toHaveBeenCalledTimes(2)
  })

  it('段は 2 回引いた高いほうを採る（後の引きが高い場合）', () => {
    descend_to(5)
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    const roll = vi.spyOn(equipment, 'gear_roll_tier')
    roll.mockReturnValueOnce(3).mockReturnValueOnce(8)

    boss._receive_damage(state.entity_player!, 999)
    step()
    const container = state.entities.find(
      (e): e is entity_container_t => e instanceof entity_container_t,
    )!
    expect(container._tier).toBe(8)
  })

  it('選んだ段はランの終わりに meta へ入る', () => {
    const before = meta.levels.leg
    state.boss_levels = ['leg', 'leg']
    kill_player()
    advance(3.125)
    expect(meta.levels.leg).toBe(before + 2)
  })

  // reward_any_available が全 6 本上限を見落とすと、first_available() が 0
  // を返し available(0) も false になる。その状態では on_key() の Enter 分岐
  // が close() を一度も呼べず、Esc も無いこのダイアログは開いたまま固まる
  // （リロードしか逃げ道がない）。この分岐は if 側と対をなす唯一の防波堤なので、
  // if 側だけでなく else 側も実挙動で固定する
  it('6 本すべて上限ならダイアログを出さずコンテナを 2 個落とす', () => {
    descend_to(5)
    for (const id of meta_upgrade_ids) { meta.levels[id] = meta_max_level[id] }
    const boss = state.entities.find((e) => e instanceof entity_boss_t)!
    boss._receive_damage(state.entity_player!, 999)
    step()
    expect(harness.boss_rewards.length).toBe(0)
    expect(state.entities.filter((e) => e instanceof entity_container_t).length).toBe(2)
  })
})
