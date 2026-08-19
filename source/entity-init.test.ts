import { describe, expect, it, vi } from 'vitest'

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
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))
// game は minimap → dom 経由で document に触る（自機の _kill から呼ばれるだけで
// フィールド初期化の検証には関係がない）
vi.mock('./game', () => ({ reload_level: () => {}, next_level: () => {} }))

import { entity_cpu_t } from './entity-cpu'
import { entity_exit_t } from './entity-exit'
import { entity_explosion_t } from './entity-explosion'
import { entity_particle_t } from './entity-particle'
import { entity_plasma_t } from './entity-plasma'
import { entity_player_t } from './entity-player'
import { entity_sentry_plasma_t, entity_sentry_t } from './entity-sentry'
import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_spider_t } from './entity-spider'

// private フィールドを読むためのヘルパ。初期化順序の検証が目的なので、
// 内部を覗くこと自体がこのテストの主題である。
function peek(entity: object, field: string): unknown {
  return (entity as Record<string, unknown>)[field]
}

// useDefineForClassFields が true のとき、サブクラスのフィールド宣言は基底
// constructor の完了後に define される。_init() 内で自クラスのフィールドに
// 代入すると潰されるため初期化子で書く必要がある。ここが壊れると蜘蛛と歩哨が
// (0,0) を狙い、粒子と爆発が消えず、射撃判定が壊れる。型チェックでは検出できない。
describe('クラスフィールドの初期化順序', () => {
  it('entity_sentry_t は h=20 と生成座標を保持する', () => {
    const sentry = new entity_sentry_t(112, 0, 456, 5, 32)
    expect(sentry.h).toBe(20)
    expect(peek(sentry, '_target_x')).toBe(112)
    expect(peek(sentry, '_target_z')).toBe(456)
    expect(peek(sentry, '_select_target_counter')).toBe(0)
  })

  it('entity_spider_t は生成座標を保持する', () => {
    const spider = new entity_spider_t(64, 0, 128, 5, 27)
    expect(peek(spider, '_target_x')).toBe(64)
    expect(peek(spider, '_target_z')).toBe(128)
    expect(peek(spider, '_animation_time')).toBe(0)
  })

  it('entity_spider_t は次の索敵までのカウンタを 0 で初期化する', () => {
    const spider = new entity_spider_t(64, 0, 128, 5, 27)
    expect(peek(spider, '_select_target_counter')).toBe(0)
  })

  it('entity_cpu_t はアニメーション用の時間カウンタを 0 で初期化する', () => {
    const cpu = new entity_cpu_t(0, 0, 0, 5, 4)
    expect(peek(cpu, '_animation_time')).toBe(0)
  })

  it('寿命を持つエンティティは寿命が設定される', () => {
    expect(peek(new entity_particle_t(0, 0, 0, 1, 30), '_lifetime')).toBe(3)
    expect(peek(new entity_explosion_t(0, 0, 0, 0, 26), '_lifetime')).toBe(1)
  })

  it('entity_player_t は初期の向きとカウンタを持つ', () => {
    const player = new entity_player_t(0, 0, 0, 5, 18)
    expect(player._angle).toBe(Math.PI / 2)
    expect(peek(player, '_bob')).toBe(0)
    expect(peek(player, '_frame')).toBe(0)
    expect(peek(player, '_last_shot')).toBe(0)
    expect(peek(player, '_last_damage')).toBe(0)
  })

  it('弾は角度から速度を得る（_init が基底フィールドに書ける）', () => {
    const plasma = new entity_plasma_t(0, 0, 0, 0, 26, 0)
    expect(plasma.vx).toBe(96)
    expect(plasma.vz).toBe(0)

    const sentry_plasma = new entity_sentry_plasma_t(0, 0, 0, 0, 26, 0)
    expect(sentry_plasma.vx).toBe(64)
    expect(sentry_plasma.vz).toBe(0)
  })

  it('entity_smoking_area_t は進捗と接触フラグを 0 / false で初期化する', () => {
    const area = new entity_smoking_area_t(64, 0, 128, 0, 18)
    expect(area.is_real).toBe(false)
    expect(peek(area, '_progress')).toBe(0)
    expect(peek(area, '_touching')).toBe(false)
    expect(peek(area, '_was_smoking')).toBe(false)
    expect(peek(area, '_done')).toBe(false)
    expect(peek(area, '_animation_time')).toBe(0)
  })

  it('entity_exit_t は未開通・未使用で始まる', () => {
    const exit = new entity_exit_t(64, 0, 128, 0, 18)
    expect(peek(exit, '_opened')).toBe(false)
    expect(peek(exit, '_used')).toBe(false)
    expect(peek(exit, '_animation_time')).toBe(0)
  })
})
