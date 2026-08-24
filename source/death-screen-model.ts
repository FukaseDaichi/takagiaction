import { nicotine_stage } from './nicotine'

// 死亡画面の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（meta.ts / nicotine.ts と同じ扱い）。

export const death_cause_nicotine = 1

// run_end() が組み立てて death_screen_show() に渡す。state を直接読ませない
// のは、死亡画面の表示中に次のランが state を書き換えても表示が変わらないため
// 獲得ヤニの内訳は持たない。run_end() が先に meta.yani へ合算し、
// 画面には合算後の残高だけを出す（内訳表示は無い）
export interface run_result_t {
  depth: number
  kills: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  nicotine_ratio: number // 死亡時の残量比 0..1
  // 更新前のベスト深度。run_end() は meta.best_depth を先に更新してから
  // この画面を出すので、控えておかないと記録更新を判定できない
  best_depth_before: number
}

export function format_run_time(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

export function death_message(cause: number): string[] {
  return cause === death_cause_nicotine
    ? ['ニコチン、限界です。', 'しっかり整えて、また潜れ。']
    : ['やられたよ、高木。', '次はもっと慎重に。']
}

// 死亡時のニコチン段階から導出する体調表示。数値ゲージ（吸いたい気持ち）は
// 残量比の逆数で、段階より細かく動く
export function condition_texts(
  nicotine_ratio: number,
): { tremor: string, focus: string, craving_ratio: number } {
  const stage = nicotine_stage(nicotine_ratio, 1)
  const tremor = ['なし', '小', '大', 'MAX'][stage]
  const focus = ['正常', '散漫', '低下', '崩壊'][stage]
  return { tremor, focus, craving_ratio: 1 - nicotine_ratio }
}

// 旧ベストが 0（＝未プレイ）のときは出さない。初回のランで 1F に届いただけの
// 記録を「更新」として祝うと、演出そのものの意味が薄れる
export function is_new_record(depth: number, best_before: number): boolean {
  return best_before > 0 && depth > best_before
}
