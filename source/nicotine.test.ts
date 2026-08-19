import { describe, expect, it } from 'vitest'
import {
  camera_shake_amount, minimap_radius, nicotine_drain_rate, nicotine_stage,
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_normal,
  nicotine_stage_withdrawal, player_light_falloff, player_speed,
  shot_interval, shot_spread, stage_color,
} from './nicotine'

describe('nicotine_stage', () => {
  // 設計書 §1 の段階効果: 100〜61% 通常 / 60〜31% そわそわ / 30〜1% 離脱 / 0% 限界
  it('61% は通常、60% はそわそわ', () => {
    expect(nicotine_stage(61, 100)).toBe(nicotine_stage_normal)
    expect(nicotine_stage(60, 100)).toBe(nicotine_stage_edgy)
  })

  it('31% はそわそわ、30% は離脱症状', () => {
    expect(nicotine_stage(31, 100)).toBe(nicotine_stage_edgy)
    expect(nicotine_stage(30, 100)).toBe(nicotine_stage_withdrawal)
  })

  it('1% は離脱症状、0% は限界', () => {
    expect(nicotine_stage(1, 100)).toBe(nicotine_stage_withdrawal)
    expect(nicotine_stage(0, 100)).toBe(nicotine_stage_limit)
  })

  // 境界は「その比率より上」で切る。90/150 と 45/150 は IEEE の除算が
  // 正しく丸めるので、リテラルの 0.6 / 0.3 と厳密に同じ double になる。
  it('最大値が 100 以外でも比率で判定する', () => {
    expect(nicotine_stage(91, 150)).toBe(nicotine_stage_normal) // 60.7%
    expect(nicotine_stage(90, 150)).toBe(nicotine_stage_edgy) // ちょうど 60%
    expect(nicotine_stage(46, 150)).toBe(nicotine_stage_edgy) // 30.7%
    expect(nicotine_stage(45, 150)).toBe(nicotine_stage_withdrawal) // ちょうど 30%
  })
})

describe('nicotine_drain_rate', () => {
  it('深度 1 は係数 1.0（ゲージ 100 で 100 秒）', () => {
    expect(nicotine_drain_rate(1)).toBeCloseTo(1.0, 6)
  })

  // 設計書 §1 の「深度11で約62秒」に対応する。√ 曲線の係数 0.19 はこの点を通るよう選んだ
  it('深度 11 は約 1.60（62.5 秒）', () => {
    expect(nicotine_drain_rate(11)).toBeCloseTo(1.6008, 3)
    expect(100 / nicotine_drain_rate(11)).toBeCloseTo(62.5, 1)
  })

  it('深度が上がると単調に増える', () => {
    for (let depth = 1; depth < 200; depth++) {
      expect(nicotine_drain_rate(depth + 1)).toBeGreaterThan(nicotine_drain_rate(depth))
    }
  })

  // レビュー C-2: 線形だと、計画B の全強化（最大 150 / 耐性 −30% = 2.143 倍）と
  // 深度 20 でちょうど相殺して伸びしろが消える。√ 曲線ならその点が深度 37 まで動く。
  // ここで見ているのは曲線の形そのもので、強化の実装には依存しない。
  it('係数が 2.143 に達するのは深度 37 付近', () => {
    expect(nicotine_drain_rate(36)).toBeLessThan(150 / 100 / 0.7)
    expect(nicotine_drain_rate(38)).toBeGreaterThan(150 / 100 / 0.7)
  })
})

describe('段階効果', () => {
  it('離脱症状で移動速度が 128 から 96 に落ちる', () => {
    expect(player_speed(nicotine_stage_normal)).toBe(128)
    expect(player_speed(nicotine_stage_edgy)).toBe(128)
    expect(player_speed(nicotine_stage_withdrawal)).toBe(96)
    expect(player_speed(nicotine_stage_limit)).toBe(96)
  })

  // 設計書 §1: 基礎 0.1 秒 × ニコチン係数。火力強化の係数は計画B で挟まる
  it('離脱症状では射撃間隔が 1.8 倍になる', () => {
    expect(shot_interval(nicotine_stage_normal)).toBeCloseTo(0.1, 6)
    expect(shot_interval(nicotine_stage_edgy)).toBeCloseTo(0.1, 6)
    expect(shot_interval(nicotine_stage_withdrawal)).toBeCloseTo(0.18, 6)
    expect(shot_interval(nicotine_stage_limit)).toBeCloseTo(0.18, 6)
  })

  it('離脱症状で弾の拡散が 2 倍になる', () => {
    expect(shot_spread(nicotine_stage_normal)).toBeCloseTo(0.2, 6)
    expect(shot_spread(nicotine_stage_edgy)).toBeCloseTo(0.2, 6)
    expect(shot_spread(nicotine_stage_withdrawal)).toBeCloseTo(0.4, 6)
  })

  // レビュー B-4: RGB を下げても見える範囲は変わらない。falloff を上げて半径を縮める
  it('ライトの falloff は段階が進むほど大きくなる（＝半径が縮む）', () => {
    expect(player_light_falloff(nicotine_stage_normal)).toBe(0.04)
    expect(player_light_falloff(nicotine_stage_edgy)).toBeGreaterThan(0.04)
    expect(player_light_falloff(nicotine_stage_withdrawal))
      .toBeGreaterThan(player_light_falloff(nicotine_stage_edgy))
  })

  it('ミニマップ半径は段階が進むほど小さくなる', () => {
    expect(minimap_radius(nicotine_stage_normal)).toBe(10)
    expect(minimap_radius(nicotine_stage_edgy)).toBeLessThan(10)
    expect(minimap_radius(nicotine_stage_withdrawal))
      .toBeLessThan(minimap_radius(nicotine_stage_edgy))
  })

  it('手の震えは離脱症状から発生する', () => {
    expect(camera_shake_amount(nicotine_stage_normal)).toBe(0)
    expect(camera_shake_amount(nicotine_stage_edgy)).toBe(0)
    expect(camera_shake_amount(nicotine_stage_withdrawal)).toBeGreaterThan(0)
  })

  it('段階ごとに色が定義されている', () => {
    for (const stage of [0, 1, 2, 3]) {
      expect(stage_color(stage)).toMatch(/^#[0-9a-f]{3}$/)
    }
  })
})
