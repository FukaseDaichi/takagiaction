import { describe, expect, it } from 'vitest'
import {
  death_cause_nicotine, death_message, format_run_time, is_new_record,
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
  // 赤い状態パネルを消したので、死因の区別が残るのは見出しだけになる
  it('敵に殺されたときは既定の見出しを返す', () => {
    expect(death_message(0)).toBe('死亡したよ、高木。')
  })

  it('ニコチン切れは別の見出しで死因が分かる', () => {
    expect(death_message(death_cause_nicotine)).toBe('ニコチン、限界です。')
  })

  it('見出しは 1 行の文字列で、配列ではない', () => {
    expect(typeof death_message(0)).toBe('string')
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
