import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer / audio / terminal / game はモジュール初期化時に canvas・AudioContext・
// document へ触るため Node 環境では評価できない。
// terminal_show_notice の呼び出しを記録する（entity-exit.test.ts と同じパターン）。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => ({
  notices: [] as string[],
  monologue: [] as string[],
  blocks: [] as number[][],
  sprites: [] as number[][],
  lights: [] as number[][],
}))

vi.mock('./renderer', () => ({
  push_sprite: (...args: number[]) => { mocks.sprites.push(args) },
  push_light: (...args: number[]) => { mocks.lights.push(args) },
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
vi.mock('./game', () => ({ run_end: () => {} }))
vi.mock('./monologue', () => ({
  monologue_all_done: () => { mocks.monologue.push('all_done') },
  monologue_complete: () => { mocks.monologue.push('complete') },
  monologue_dummy: () => { mocks.monologue.push('dummy') },
  monologue_interrupt: () => { mocks.monologue.push('interrupt') },
}))

import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_smoke_t } from './entity-smoke'
import { entity_player_t } from './entity-player'
import { level_data, state } from './state'

// 1 フレーム進める。game_tick は衝突ループ（_check）を一巡させてから
// _render を呼ぶので、テストも同じ順で叩く。
function tick(area: entity_smoking_area_t, player: entity_player_t, dt: number): void {
  state.time_elapsed = dt
  area._check(player)
  area._render()
}

function idle(area: entity_smoking_area_t, dt: number): void {
  state.time_elapsed = dt
  area._render()
}

describe('喫煙所', () => {
  let player: entity_player_t

  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
    state.nicotine = 0
    state.nicotine_max = 100
    state.smoking = 0
    state.exit_open = 0
    state.game_running = 1
    mocks.notices.length = 0
    mocks.monologue.length = 0
    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0
    player = new entity_player_t(0, 0, 0, 5, 18)
    state.entity_player = player
  })

  it('本物は 2.5 秒で一服が完了し、非常口が開いて HP が 1 回復する', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 3

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(0)
    expect(state.nicotine).toBeCloseTo(80, 5) // 40/秒 × 2.0 秒

    tick(area, player, 0.5) // 累計 2.5 秒
    expect(state.exit_open).toBe(1)
    expect(state.nicotine).toBe(100)
    expect(player.h).toBe(4)
  })

  it('一服中は移動と射撃がロックされ、完了フレームで解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    for (let i = 0; i < 4; i++) { tick(area, player, 0.5) }
    expect(state.smoking).toBe(0)
  })

  it('触れるのをやめるとロックが解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)

    idle(area, 0.5)
    expect(state.smoking).toBe(0)
  })

  // レビュー A-5: 中断で喫煙所を消費すると非常口が永久に開かず詰む
  it('被弾で中断すると進捗は 0 に戻るが、吸い直せる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5)
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(40, 5)

    player.h = 4 // 被弾
    tick(area, player, 0.5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)
    expect(state.nicotine).toBeCloseTo(40, 5) // 中断フレームでは回復しない

    // 吸い直すには一度接触を切る必要がある（レビュー Finding 2。触れたままだと
    // 再武装しない仕様なので、これをしないと以下の 2.5 秒が永遠に完了しない）
    idle(area, 0.5)

    // 吸い直せる: 触れ直してから 2.5 秒でちゃんと完了する
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.exit_open).toBe(1)
  })

  it('中断されるまでに吸えた時間ぶんはゲージに残る', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    for (let i = 0; i < 3; i++) { tick(area, player, 0.5) } // 1.5 秒
    player.h = 4
    tick(area, player, 0.5)
    expect(state.nicotine).toBeCloseTo(60, 5) // 設計書 §1 の「1.5秒吸えたら60%回復」
  })

  it('ダミーは 5% だけ回復して以後は反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = false

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0)

    tick(area, player, 0.5)
    expect(state.nicotine).toBe(5)
  })

  it('完了した喫煙所は二度と反応しない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }

    state.nicotine = 10
    state.exit_open = 0
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) }
    expect(state.nicotine).toBe(10)
    expect(state.exit_open).toBe(0)
  })

  // レビュー Finding 1: 自機の被弾死と同じフレームで通知を出すと、
  // terminal_show_result() が組んだ表示チェーンを terminal_cancel() が壊し、
  // クリック復帰ハンドラが登録されないままソフトロックする。
  // run_end() は terminal_show_result() を呼ぶ前に game_running を落とすので、
  // ここでその値を見れば同じフレームの死亡かどうかを判定できる。
  it('ラン終了後（state.game_running が 0）は接触していても一服が進行せず、ロックは解放される', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true

    tick(area, player, 0.5) // 一服開始
    expect(state.smoking).toBe(1)
    expect(state.nicotine).toBeCloseTo(20, 5)

    state.game_running = 0
    tick(area, player, 0.5)

    expect(state.nicotine).toBeCloseTo(20, 5) // 進捗していない = 接触処理をしていない
    expect(state.exit_open).toBe(0)
    expect(state.smoking).toBe(0) // 自分が持っていたロックは解放し、プレイヤーを固まらせない
  })

  it('自機の死亡と同じフレームでは中断の通知を出さない', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5) // 一服開始、_hp_mark = 5
    mocks.notices.length = 0

    player.h = 0 // 致死ダメージ。run_end() が game_running を落とすのと同じフレーム
    state.game_running = 0
    tick(area, player, 0.5)

    expect(mocks.notices.length).toBe(0)
    expect(mocks.monologue.length).toBe(0)
  })

  // レビュー Finding 2: 一服中は自機の速度が強制的にゼロなので、中断した次の
  // フレームでその場のまま再武装すると、動けないまま押さえ込まれ続けて詰む
  it('中断された一服は接触が続く限り再武装せず、離れて戻ると再武装する', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5) // 一服開始
    expect(state.smoking).toBe(1)

    player.h = 4 // 被弾で中断
    tick(area, player, 0.5)
    expect(state.smoking).toBe(0)
    const nicotine_after_interrupt = state.nicotine

    // 接触したままの次のフレーム: 再武装してはいけない
    tick(area, player, 0.5)
    expect(state.smoking).toBe(0)
    expect(state.nicotine).toBe(nicotine_after_interrupt)

    // 接触が切れると再武装の待ちが解除される
    idle(area, 0.5)

    // 再び触れると、今度は正常に一服が始まる
    tick(area, player, 0.5)
    expect(state.smoking).toBe(1)
  })

  it('触れる前は本物とダミーが同一の見た目で描かれる', () => {
    const real = new entity_smoking_area_t(64, 0, 64, 0, 18)
    real.is_real = true
    const dummy = new entity_smoking_area_t(128, 0, 128, 0, 18)

    idle(real, 0.5)
    const real_block = mocks.blocks[0].slice(2) // タイル引数のみ比較
    const real_sprite_tile = mocks.sprites[0][3]
    // push_light(x, y, z, r, g, b, falloff): x/z は設置座標に由来し
    // real（64,64）と dummy（128,128）で意図的に異なるので比較対象から外し、
    // 色と減衰（r, g, b, falloff）だけを一致させる。
    const real_light_rgb_falloff = mocks.lights[0].slice(3)
    const real_blocks = mocks.blocks.length
    const real_sprites = mocks.sprites.length
    const real_lights = mocks.lights.length

    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0

    idle(dummy, 0.5)
    expect(mocks.blocks[0].slice(2)).toEqual(real_block)
    expect(mocks.sprites[0][3]).toBe(real_sprite_tile)
    expect(mocks.lights[0].slice(3)).toEqual(real_light_rgb_falloff)
    expect(mocks.blocks.length).toBe(real_blocks)
    expect(mocks.sprites.length).toBe(real_sprites)
    expect(mocks.lights.length).toBe(real_lights)
  })

  it('灰皿は低いブロック（側面タイルが 8/9/17 以外）で描かれる', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    idle(area, 0.5)
    const side_tile = mocks.blocks[0][3]
    expect([8, 9, 17]).not.toContain(side_tile)
  })

  it('ダミーを踏むと撤去跡タイルに差し替わり、ライトが消え、revealed_dummy が立つ', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = false
    expect(area.revealed_dummy).toBe(false)

    tick(area, player, 0.5) // 踏む
    mocks.blocks.length = 0
    mocks.sprites.length = 0
    mocks.lights.length = 0

    idle(area, 0.5)
    expect(area.revealed_dummy).toBe(true)
    expect(mocks.blocks[0][2]).toBe(35) // 天面 = ボルト跡
    expect(mocks.blocks[0][3]).toBe(36) // 側面 = 貼り紙
    expect(mocks.sprites[0][3]).toBe(36) // 標識も貼り紙に
    expect(mocks.lights.length).toBe(0) // 消灯
  })

  it('本物は完了しても revealed_dummy は立たず、灰皿タイルのまま', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 一服完了

    mocks.blocks.length = 0
    idle(area, 0.5)
    expect(area.revealed_dummy).toBe(false)
    expect(mocks.blocks[0][2]).toBe(33)
    expect(mocks.blocks[0][3]).toBe(34)
  })

  it('完了した本物は 0.5 秒ごとに煙を 1 個ずつ出す', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    for (let i = 0; i < 5; i++) { tick(area, player, 0.5) } // 一服完了

    const count = (): number =>
      state.entities.filter((e) => e instanceof entity_smoke_t).length

    const before = count()
    idle(area, 0.5)
    idle(area, 0.5)
    expect(count()).toBe(before + 2)
  })

  it('ダミーと未完了の本物は煙を出さない', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5) // 踏んで開示
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true

    idle(dummy, 0.5)
    idle(real, 0.5)
    expect(state.entities.some((e) => e instanceof entity_smoke_t)).toBe(false)
  })

  // 通知の移管（docs/story.md「声の使い分け」）: 高木の体験は吹き出し、
  // 事実と指示はターミナル
  it('ダミーを踏むと高木がぼやく（他に未回収の喫煙所が残っている場合）', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true

    tick(dummy, player, 0.5)
    expect(mocks.monologue).toEqual(['dummy'])
  })

  it('最後の 1 箇所がダミーなら「もう喫煙所はない」になる', () => {
    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true
    for (let i = 0; i < 5; i++) { tick(real, player, 0.5) } // 一服完了
    mocks.monologue.length = 0

    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5)
    expect(mocks.monologue).toEqual(['all_done'])
  })

  it('本物が最後の 1 箇所でも完了のセリフを出す（誘導はターミナルのロック解除通知が担う）', () => {
    const dummy = new entity_smoking_area_t(64, 0, 64, 0, 18)
    tick(dummy, player, 0.5) // 開示
    mocks.monologue.length = 0

    const real = new entity_smoking_area_t(128, 0, 128, 0, 18)
    real.is_real = true
    for (let i = 0; i < 5; i++) { tick(real, player, 0.5) }
    expect(mocks.monologue).toEqual(['complete'])
    expect(mocks.notices.some((n) => n.includes('非常口'))).toBe(true)
  })

  it('被弾で中断すると高木が咳き込む（吹き出し側）', () => {
    const area = new entity_smoking_area_t(64, 0, 64, 0, 18)
    area.is_real = true
    player.h = 5

    tick(area, player, 0.5)
    player.h = 4
    tick(area, player, 0.5)
    expect(mocks.monologue).toEqual(['interrupt'])
    expect(mocks.notices.length).toBe(0) // ターミナルには出さない
  })
})
