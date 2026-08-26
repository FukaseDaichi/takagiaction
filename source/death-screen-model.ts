// 死亡画面の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（meta.ts と同じ扱い）。実行時 import を
// 一切持たない。

export const death_cause_nicotine = 1

// run_end() が組み立てて death_screen_show() に渡す。state を直接読ませない
// のは、死亡画面の表示中に次のランが state を書き換えても表示が変わらないため。
// 獲得ヤニの内訳は持たない。run_end() が先に meta.yani へ合算し、
// 画面には合算後の残高だけを出す（内訳表示は無い）
export interface run_result_t {
  depth: number
  kills: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  // 更新前のベスト深度。run_end() は meta.best_depth を先に更新してから
  // この画面を出すので、控えておかないと記録更新を判定できない
  best_depth_before: number
}

export function format_run_time(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

// 死因は見出し 1 行だけが担う。体調パネル（赤い箱）を消したので、ここが
// 画面で唯一の「敵に殺されたのか、ゲージが尽きたのか」の出どころになる。
// 2 行目の励ましは、死を 2 回説明することになるため置かない
export function death_message(cause: number): string {
  return cause === death_cause_nicotine ? 'ニコチン、限界です。' : '死亡したよ、高木。'
}

// 旧ベストが 0（＝未プレイ）のときは出さない。初回のランで 1F に届いただけの
// 記録を「更新」として祝うと、演出そのものの意味が薄れる
export function is_new_record(depth: number, best_before: number): boolean {
  return best_before > 0 && depth > best_before
}
