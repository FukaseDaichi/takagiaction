// OP（予告編話法の 5 カット + タイトルドロップ）の進行表。DOM もタイマーも
// 持たない葉モジュール。スクリプトの正本は docs/story.md「オープニング」
export type op_cut_t = {
  dur: number     // カットの表示時間（ミリ秒）
  lines: string[] // 字幕。複数行は dur を行数で等分した刻みで 1 行ずつ出す
  takagi?: boolean // true なら高木の声（語りと別スタイル）
}

// どのカットが動画かは opening.ts の素材配列（op_assets）が持つ。ここでは
// 進行表としての尺・字幕・声だけを持ち、動画かどうかには関与しない
export const op_cuts: op_cut_t[] = [
  { dur: 4000, lines: ['西暦2718年。やつらは違法となった。'] },
  { dur: 4000, lines: ['地上から、すべてのやつらが消えた。'] },
  { dur: 5000, lines: ['しかし一人の男が、地下にまだやつらが眠っているという噂を聞いた。'] },
  { dur: 5000, lines: ['失われた人類の遺産。', '禁じられた聖域。', '最後の安息の地。'] },
  { dur: 4000, lines: ['喫煙所だ。'], takagi: true },
  { dur: 4000, lines: [] },
]

// カット 5 の直前に置く黒 1 拍（全音停止）。ミリ秒
export const op_black_lead = 600

// タイトル動画のロゴ着地（カット 6 開始からのミリ秒）。スティングを合わせる
export const op_sting_delay = 1500

// カット内で index 行目の字幕を出す時刻（カット開始からのミリ秒）
export function op_line_at(cut: op_cut_t, index: number): number {
  return Math.round(cut.dur / cut.lines.length * index)
}

// カットの開始時刻（OP 開始からのミリ秒）。カット 5 以降は黒 1 拍ぶんずれる
export function op_cut_at(index: number): number {
  let at = 0
  for (let i = 0; i < index; i++) { at += op_cuts[i].dur }
  return at + (index >= 4 ? op_black_lead : 0)
}

export function op_total(): number {
  return op_cut_at(op_cuts.length - 1) + op_cuts[op_cuts.length - 1].dur
}
