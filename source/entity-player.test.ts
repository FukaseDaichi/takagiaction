import { beforeEach, describe, expect, it, vi } from 'vitest'

// push_light の引数を覗くため、モックの外に配列を用意する。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({
  light_calls: [] as number[][],
  audio_calls: [] as string[],
  screen_slash_calls: [] as string[],
  sprite_calls: 0,
  camera: { x: 0, y: 0, z: 0, shake: 0 },
  music_death_calls: 0,
  monologue_death_calls: [] as number[],
}))

vi.mock('./renderer', () => ({
  push_sprite: () => { mocks.sprite_calls++ },
  push_block: () => {},
  push_quad: () => {},
  push_light: (...args: number[]) => { mocks.light_calls.push(args) },
  camera: mocks.camera,
}))
// dom.ts を経由して document を触るため、Node 環境のテストでは差し替える
vi.mock('./screen-slash', () => ({
  screen_slash: (color: string) => { mocks.screen_slash_calls.push(color) },
}))
vi.mock('./screen-flash', () => ({ screen_flash: () => {} }))
// どの音が鳴ったかを見分けるため、バッファの代わりに名前を入れておく。
// audio_play() は受け取った値をそのまま記録する
vi.mock('./audio', () => ({
  audio_play: (buffer: unknown) => { mocks.audio_calls.push(buffer as string) },
  audio_toggle: () => {},
  audio_music_death: () => { mocks.music_death_calls++ },
  audio_sfx_shoot: 'shoot',
  audio_sfx_hit: 'hit',
  audio_sfx_hurt: 'hurt',
  audio_sfx_beep: 'beep',
  audio_sfx_pickup: 'pickup',
  audio_sfx_explode: 'explode',
  audio_sfx_swing: 'swing',
}))
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
vi.mock('./monologue', () => ({
  monologue_death: (cause: number) => { mocks.monologue_death_calls.push(cause) },
}))

import { entity_player_t } from './entity-player'
import { entity_boss_t } from './entity-boss'
import { entity_plasma_t } from './entity-plasma'
import { entity_sentry_t } from './entity-sentry'
import { entity_slash_t } from './entity-slash'
import { entity_spider_t } from './entity-spider'
import { key_right, key_shoot, key_spare, key_swap, keys } from './input'
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
    state.game_running = 1 // 死体は入力を受け付けない。ラン中であることが前提
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

  it('火力強化で射撃間隔が縮む（3 段で 0.085 秒）', () => {
    meta.levels.power = 3
    keys[key_shoot] = 1
    player._update() // 1 発目
    expect(plasma_count()).toBe(1)

    state.time_elapsed = 0.07
    player._update()
    expect(plasma_count()).toBe(1) // 0.085 秒に届かない

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
    state.dying = 0
    state.death_elapsed = 0
    state.game_running = 1 // 死体は傷つかない。ラン中であることが被弾の前提
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

  it('HP が 0 になると死亡シーケンスが始まる', () => {
    player.h = 1
    player._receive_withdrawal_damage()
    expect(player.h).toBe(0)
    expect(state.dying).toBe(1)
    expect(state.death_elapsed).toBe(0)
    // 死体を描き続けるため、エンティティとしては殺さない
    expect(player._dead).toBe(false)
    expect(state.entities_to_kill.length).toBe(0)
  })

  // レビュー Finding 4e: 継続ダメージは _receive_damage の 2 秒の無敵を通さないので、
  // 同じフレームに敵と接触すると _kill() が 2 度走りうる。ヤニの二重加算は
  // run_end() 側の game_running が止めるが、死体の姿勢だけがもう一段ずれる
  it('_kill が二度走っても死体の姿勢は変わらない', () => {
    player.h = 1
    const z_alive = player.z
    player._receive_withdrawal_damage()
    expect(state.dying).toBe(1)
    expect(player.z).toBe(z_alive + 5)
    expect(player.y).toBe(10)

    player._receive_withdrawal_damage() // 同フレームの追い打ち
    expect(player.z).toBe(z_alive + 5)
    expect(player.y).toBe(10)
  })

  it('ニコチン切れの継続ダメージで死ぬと death_cause が立つ', () => {
    state.death_cause = 0
    player.h = 1
    player._receive_withdrawal_damage()
    expect(state.death_cause).toBe(1)
  })

  it('死なない離脱ダメージでは death_cause は立たない', () => {
    state.death_cause = 0
    player.h = 3
    player._receive_withdrawal_damage()
    expect(state.death_cause).toBe(0)
    expect(player.h).toBe(2)
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
    state.smoke_count = 0
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
    expect(state.smoke_count).toBe(1)
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

describe('死亡シーケンス', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.nicotine = 50
    state.nicotine_max = 100
    state.smoking = 0
    state.game_running = 1
    state.dying = 0
    state.death_elapsed = 0
    state.death_cause = 0
    mocks.camera.shake = 0
    mocks.music_death_calls = 0
    mocks.monologue_death_calls.length = 0
    for (const code of Object.keys(keys)) { keys[Number(code)] = 0 }
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('死ぬと BGM のテープストップと最期のひとことが始まる', () => {
    player._update()
    player.h = 1
    state.death_cause = 1
    player._receive_damage(player, 1)
    expect(mocks.music_death_calls).toBe(1)
    expect(mocks.monologue_death_calls).toEqual([1])
    expect(mocks.camera.shake).toBeGreaterThan(0)
  })

  it('シーケンス中は移動も射撃も効かない', () => {
    player._update()
    player.h = 1
    player._receive_damage(player, 1)
    expect(state.dying).toBe(1)

    keys[key_right] = 1
    keys[key_shoot] = 1
    const y = player.y
    for (let i = 0; i < 30; i++) { player._update() }
    expect(player.ax).toBe(0)
    expect(player.vx).toBe(0)
    expect(plasma_count()).toBe(0)
    expect(player.y).toBe(y) // 死体は bobbing しない
  })

  it('シーケンス中の追い打ちはダメージにならない', () => {
    player._update()
    player.h = 1
    player._receive_damage(player, 1)
    expect(player.h).toBe(0)

    // 無敵時間を抜けた後の攻撃でも、死体はもう傷つかない
    state.time_elapsed = 3
    player._update()
    player._receive_damage(player, 1)
    expect(player.h).toBe(0)
    expect(state.dying).toBe(1)
  })

  it('シーケンス中は死体を点滅させない', () => {
    player._update()
    player.h = 1
    player._receive_damage(player, 1) // _last_damage = 2 の点滅が張られる

    // 被弾の点滅は 6 フレーム中 2 フレームのスプライトを抜くが、死体は全フレーム描く
    mocks.sprite_calls = 0
    for (let i = 0; i < 12; i++) { player._render() }
    expect(mocks.sprite_calls).toBe(12)
  })

  it('リザルト表示中も死体を点滅させない', () => {
    player._update()
    player.h = 1
    player._receive_damage(player, 1) // _last_damage = 2 の点滅が張られる

    // game_tick が dying を落として run_end() を呼んだ後の状態。_update() は
    // 死体のゲートで止まるので _last_damage は 2 のまま減らず、点滅の条件が
    // 消えないまま残る（時間を進めても解けない）
    state.dying = 0
    state.game_running = 0
    state.time_elapsed = 3
    for (let i = 0; i < 12; i++) { player._update() }

    mocks.sprite_calls = 0
    for (let i = 0; i < 12; i++) { player._render() }
    expect(mocks.sprite_calls).toBe(12)
  })
})

describe('近接攻撃と持ち替え', () => {
  let player: entity_player_t

  beforeEach(() => {
    // 直前の「死亡シーケンス」describe の最終テストが state.dying = 1 のまま
    // 抜けるため、他の describe と同じ一式（entities・time_elapsed・dying・
    // player の再生成）をここでも揃える。dying を戻さないと _update() が
    // 冒頭の早期 return で持ち替え・薙ぎの分岐に到達しない
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.dying = 0
    mocks.audio_calls.length = 0
    mocks.screen_slash_calls.length = 0
    meta.gear.blade = 0
    state.melee_active = 0
    state.game_running = 1
    keys[key_swap] = 0
    keys[key_shoot] = 0
    player = new entity_player_t(64, 0, 64, 5, 18)
    state.entity_player = player
  })

  it('刃物を持っていないと Tab を押しても持ち替わらない', () => {
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  it('刃物を持っていれば Tab で持ち替わる', () => {
    meta.gear.blade = 1
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(1)
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  // リザルト表示中もエンティティのループは回り続ける。死亡画面は Tab を
  // 「地下へ戻る」に使うので、そちらへ横取りされないようにする
  it('リザルト表示中は持ち替えない', () => {
    meta.gear.blade = 5
    state.game_running = 0
    keys[key_swap] = 1
    player._update()
    expect(state.melee_active).toBe(0)
  })

  it('刃物を構えているとスペースで弾が出ない', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    keys[key_shoot] = 1
    const before = state.entities.filter((e) => e instanceof entity_plasma_t).length
    player._update()
    expect(state.entities.filter((e) => e instanceof entity_plasma_t).length).toBe(before)
  })

  it('射程内の正面にいる蜘蛛は、最低段の刃物でも一撃で落ちる', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0 // +x 方向
    const spider = new entity_spider_t(player.x + 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(true)
  })

  it('射程の外の蜘蛛には届かない', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0
    const spider = new entity_spider_t(player.x + 40, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(false)
  })

  it('半角の外にいる蜘蛛には届かない', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    player._angle = 0 // +x を向いているのに、相手は -x 側
    const spider = new entity_spider_t(player.x - 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(spider._dead).toBe(false)
  })

  // 全段を一撃必殺にするとレア度に載せる軸が残らないので、対象を段で広げる
  it('Lv8 の刃はセントリーを一撃では落とさず、段ぶんのダメージを与える', () => {
    meta.gear.blade = 8
    state.melee_active = 1
    player._angle = 0
    const sentry = new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(sentry._dead).toBe(false)
    expect(sentry.h).toBe(12) // 20 - 8
  })

  it('Lv9 の刃はセントリーも一撃で落とす', () => {
    meta.gear.blade = 9
    state.melee_active = 1
    player._angle = 0
    const sentry = new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(sentry._dead).toBe(true)
  })

  it('薙ぎでボスにダメージが入る', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    player._angle = 0
    const boss = new entity_boss_t(player.x + 8, 0, player.z, 0, 45)
    const before = boss.h
    keys[key_shoot] = 1
    player._update()
    expect(boss.h).toBe(before - 5) // blade_damage(5) = tier
  })

  // ボス（幅 14）は他 3 種（幅 9）と違って中心が entity.x/z からずれる。dx/dz を
  // 原点の差のまま測ると、近づく向きによって中心間の実際の距離を過大／過小
  // 評価してしまい、片側からは届いても反対側からは届かないという非対称が
  // 出る（entity-player.ts の dx/dz のコメント参照）。最低段（reach 9.6）で
  // 中心間距離を reach ぎりぎり内側（9）に固定したまま四方から振らせ、
  // どの向きでも等しく届くことを固定する
  it('最低段の刃でも、ボスには四方どこから近づいても届く', () => {
    meta.gear.blade = 1
    state.melee_active = 1
    const boss_half = 7 // entity-boss.ts の boss_hitbox(14) / 2
    // [dx の符号, dz の符号, その向きから振るための自機の向き]
    const approaches: Array<[number, number, number]> = [
      [1, 0, 0], // ボスは自機の +x 側
      [-1, 0, Math.PI], // ボスは自機の -x 側（原点基準では届かなかった側）
      [0, 1, Math.PI / 2], // ボスは自機の +z 側
      [0, -1, -Math.PI / 2], // ボスは自機の -z 側（同上）
    ]
    for (const [dx_sign, dz_sign, angle] of approaches) {
      const p = new entity_player_t(64, 0, 64, 5, 18)
      state.entity_player = p
      p._angle = angle
      const player_cx = p.x + p.w / 2
      const player_cz = p.z + p.w / 2
      const boss = new entity_boss_t(
        player_cx + dx_sign * 9 - boss_half, 0,
        player_cz + dz_sign * 9 - boss_half, 0, 45,
      )
      const before = boss.h
      keys[key_shoot] = 1
      p._update()
      expect(boss.h).toBe(before - 1) // blade_damage(1) = tier
    }
  })

  // ボスは kills のどの項にも現れない。Lv9 以上の一撃必殺（全段対象）が
  // 通ると耐久で作った戦いが丸ごと消えるため、ここが最も壊れやすい —
  // kills にボスを足すと即座に 999 ダメージが入り、このテストが失敗する
  it('Lv9 以上の刃でもボスは一撃で落ちない', () => {
    meta.gear.blade = 9
    state.melee_active = 1
    player._angle = 0
    const boss = new entity_boss_t(player.x + 8, 0, player.z, 0, 45)
    const before = boss.h
    keys[key_shoot] = 1
    player._update()
    expect(boss._dead).toBe(false)
    expect(boss.h).toBe(before - 9) // 一撃必殺ではなく blade_damage(9) が通る
  })

  // 音が空振りと当たりを区別しないと、耳では常に「当たった」と言われ続ける。
  // 刃物で唯一重要な情報が当たったかどうかなので、ここを分ける
  it('空振りは風切り音だけで、当たり音は鳴らない', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    keys[key_shoot] = 1
    player._update()
    expect(mocks.audio_calls).toContain('swing')
    expect(mocks.audio_calls).not.toContain('hit')
  })

  it('当たると風切り音に当たり音が重なる', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    player._angle = 0
    new entity_spider_t(player.x + 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(mocks.audio_calls).toContain('swing')
    expect(mocks.audio_calls).toContain('hit')
  })

  // 振っても体が動かないと、判定と絵だけが出たように見える。踏み込みは
  // 姿勢の表現と、敵のノックバック（下のテスト）の両方を兼ねる
  it('振ると自機が向いている方向へ踏み込む', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    player._angle = 0 // +x
    keys[key_shoot] = 1
    player._update()
    expect(player.vx).toBeGreaterThan(10)
  })

  // 向きが毎回同じだと、連打がまったく同じ絵の繰り返しになる
  it('振るたびに掃引の向きが反転する', () => {
    meta.gear.blade = 5
    state.nicotine = state.nicotine_max // 離脱症状の 1.8 倍を挟まない
    state.melee_active = 1
    keys[key_shoot] = 1
    // 振り間隔（Lv5 で 0.65 秒）を挟んで 3 回振らせる
    for (let i = 0; i < 130; i++) { player._update() }
    const dirs = state.entities
      .filter((e): e is entity_slash_t => e instanceof entity_slash_t)
      .map((e) => e._dir)
    expect(dirs.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < dirs.length; i++) {
      expect(dirs[i]).toBe(-dirs[i - 1])
    }
  })

  // 全段が蜘蛛を一撃で落とすので、蜘蛛で光らせると出っぱなしになる
  it('蜘蛛の一撃では画面の閃光を出さない', () => {
    meta.gear.blade = 5
    state.melee_active = 1
    player._angle = 0
    new entity_spider_t(player.x + 8, 0, player.z, 5, 27)
    keys[key_shoot] = 1
    player._update()
    expect(mocks.screen_slash_calls).toHaveLength(0)
  })

  it('セントリーを一撃で落としたときは等級色で画面の閃光を出す', () => {
    meta.gear.blade = 9
    state.melee_active = 1
    player._angle = 0
    new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(mocks.screen_slash_calls).toEqual(['#f0c93a']) // 銘品
  })

  // 敵は from.vx をノックバックに使う（entity-spider.ts ほか）。立ち止まって
  // 振ると速度 0 が入り、斬った相手がその場で固定されていた
  it('当たった敵は斬った方向へ押される', () => {
    meta.gear.blade = 1 // セントリーは一撃にならないので押された結果が残る
    state.melee_active = 1
    player._angle = 0
    const sentry = new entity_sentry_t(player.x + 8, 0, player.z, 5, 24)
    keys[key_shoot] = 1
    player._update()
    expect(sentry.vx).toBeGreaterThan(0)
  })
})
