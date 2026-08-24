import { describe, expect, it } from 'vitest'
import {
  condition_texts, death_cause_nicotine, death_message, format_run_time,
  is_new_record,
} from './death-screen-model'

describe('生存時間の表示', () => {
  it('mm:ss で秒は 2 桁にする', () => {
    expect(format_run_time(0)).toBe('0:00')
    expect(format_run_time(59.9)).toBe('0:59')
    expect(format_run_time(767)).toBe('12:47')
  })

  it('負値は 0:00 に丸める', () => {
    expect(format_run_time(-1)).toBe('0:00')
  })
})

describe('死因メッセージ', () => {
  it('ニコチン切れと敵で文言が変わる', () => {
    expect(death_message(death_cause_nicotine)[0]).toContain('ニコチン')
    expect(death_message(0)[0]).toContain('やられた')
  })
})

describe('死亡時の状態表示', () => {
  it('ゲージ 0% は 手の震え MAX・集中力 崩壊', () => {
    const c = condition_texts(0)
    expect(c.tremor).toBe('MAX')
    expect(c.focus).toBe('崩壊')
    expect(c.craving_ratio).toBe(1)
  })

  it('離脱症状帯（30% 以下）は 大・低下', () => {
    const c = condition_texts(0.2)
    expect(c.tremor).toBe('大')
    expect(c.focus).toBe('低下')
    expect(c.craving_ratio).toBeCloseTo(0.8, 6)
  })

  it('そわそわ帯（60% 以下）は 小・散漫', () => {
    expect(condition_texts(0.5).tremor).toBe('小')
    expect(condition_texts(0.5).focus).toBe('散漫')
  })

  it('通常帯は なし・正常', () => {
    expect(condition_texts(0.9).tremor).toBe('なし')
    expect(condition_texts(0.9).focus).toBe('正常')
  })
})

describe('ニューレコード判定', () => {
  it('旧ベストを超えたら更新', () => {
    expect(is_new_record(21, 15)).toBe(true)
  })

  it('同値は更新ではない', () => {
    expect(is_new_record(15, 15)).toBe(false)
  })

  it('下回ったら更新ではない', () => {
    expect(is_new_record(9, 15)).toBe(false)
  })

  // 初回のランで 1F に届いただけの記録を「更新」として祝うと演出の意味が薄れる
  it('旧ベスト 0（未プレイ）では更新にしない', () => {
    expect(is_new_record(1, 0)).toBe(false)
    expect(is_new_record(99, 0)).toBe(false)
  })
})
