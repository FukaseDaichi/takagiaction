import { describe, expect, it } from 'vitest'
import {
  bubble_active, bubble_advance, bubble_char_interval, bubble_idle, bubble_linger,
  bubble_start, bubble_visible_text, monologue_pick,
} from './monologue-model'

describe('monologue_pick', () => {
  const pool = ['あ', 'い', 'う']

  it('rand に応じたプールの行を返す', () => {
    expect(monologue_pick(pool, '', 0)).toBe('あ')
    expect(monologue_pick(pool, '', 0.5)).toBe('い')
    expect(monologue_pick(pool, '', 0.99)).toBe('う')
  })

  it('直前と同じ行に当たったら次の行へずらす（末尾は先頭へ巻く）', () => {
    expect(monologue_pick(pool, 'あ', 0)).toBe('い')
    expect(monologue_pick(pool, 'う', 0.99)).toBe('あ')
  })

  it('1 行しかないプールは直前と同じでもその行を返す', () => {
    expect(monologue_pick(['あ'], 'あ', 0.5)).toBe('あ')
  })
})

describe('bubble', () => {
  it('idle は非アクティブで何も表示しない', () => {
    const b = bubble_idle()
    expect(bubble_active(b)).toBe(false)
    expect(bubble_visible_text(b)).toBe('')
  })

  it('遅延中は非表示だがアクティブ（予約中）', () => {
    const b = bubble_start('たばこ', 2)
    expect(bubble_active(b)).toBe(true)
    expect(bubble_visible_text(b)).toBe('')
    bubble_advance(b, 1)
    expect(bubble_visible_text(b)).toBe('')
  })

  it('遅延を消化すると文字送りが始まり、食い込んだ時間ぶんも進む', () => {
    const b = bubble_start('たばこたばこ', 1)
    bubble_advance(b, 1 + bubble_char_interval * 3.5)
    // 遅延 1 秒を消化し、食い込んだ 3.5 文字ぶんの時間 + 先頭 1 文字で 4 文字見えている。
    // 文字境界の真上（* 3）を狙うと、1 - (1 + 0.05*3) の丸め誤差で 1 文字ぶん足りなくなる
    expect(bubble_visible_text(b)).toBe('たばこた')
  })

  it('文字送りは 1 文字ずつ進む', () => {
    const b = bubble_start('たばこ', 0)
    expect(bubble_visible_text(b)).toBe('た')
    bubble_advance(b, bubble_char_interval)
    expect(bubble_visible_text(b)).toBe('たば')
    bubble_advance(b, bubble_char_interval)
    expect(bubble_visible_text(b)).toBe('たばこ')
  })

  it('全文表示から linger 経過で非アクティブになる', () => {
    const b = bubble_start('たばこ', 0)
    bubble_advance(b, 3 * bubble_char_interval + bubble_linger - 0.01)
    expect(bubble_active(b)).toBe(true)
    bubble_advance(b, 0.02)
    expect(bubble_active(b)).toBe(false)
    expect(bubble_visible_text(b)).toBe('')
  })
})
