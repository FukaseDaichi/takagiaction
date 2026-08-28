import { describe, expect, it } from 'vitest'
import {
  op_black_lead, op_cut_at, op_cuts, op_line_at, op_total,
} from './opening-model'

describe('OP の進行表', () => {
  it('スクリプトは docs/story.md の 5 枚 + タイトルドロップ', () => {
    expect(op_cuts.map((cut) => cut.lines)).toEqual([
      ['西暦2718年。やつらは違法となった。'],
      ['地上から、すべてのやつらが消えた。'],
      ['しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。'],
      ['失われた人類の遺産。', '禁じられた聖域。', '最後の安息の地。'],
      ['喫煙所だ。'],
      [],
    ])
    // 「喫煙所だ。」だけが高木の声。動画はカット 5・6（0 始まりで 4・5）
    expect(op_cuts.map((cut) => !!cut.takagi)).toEqual(
      [false, false, false, false, true, false])
    expect(op_cuts.map((cut) => !!cut.video)).toEqual(
      [false, false, false, false, true, true])
  })

  it('カットの開始時刻はカット 5 の黒 1 拍を含んで累積する', () => {
    expect(op_cut_at(0)).toBe(0)
    expect(op_cut_at(1)).toBe(4000)
    expect(op_cut_at(2)).toBe(8000)
    expect(op_cut_at(3)).toBe(13000)
    // カット 5 の頭に黒 1 拍（全音停止）が挟まる
    expect(op_cut_at(4)).toBe(18000 + op_black_lead)
    expect(op_cut_at(5)).toBe(22000 + op_black_lead)
    // 尺は仕様の約 26 秒（= 26000 + 黒 1 拍）
    expect(op_total()).toBe(26000 + op_black_lead)
  })

  it('三連呼はカットの尺を行数で等分した刻みで出る', () => {
    const cut4 = op_cuts[3]
    expect(op_line_at(cut4, 0)).toBe(0)
    expect(op_line_at(cut4, 1)).toBe(1667)
    expect(op_line_at(cut4, 2)).toBe(3333)
  })
})
