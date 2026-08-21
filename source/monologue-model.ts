// 吹き出しの文字送り状態機械とセリフプール選択。副作用も実行時 import も
// 持たない葉モジュール（Node の Vitest でモックなしに評価できる）。
// 時間は呼び出し側が state.time_elapsed で進める。setTimeout に載せないのは、
// terminal.ts の表示チェーンを terminal_cancel() が丸ごと捨てる既知バグ類型
// （レビュー Finding 1）に最初から加担しないため。

export const bubble_char_interval = 0.05 // 1 文字あたり秒（タイプ表示）
export const bubble_linger = 3 // 全文表示後、消えるまでの余韻（秒）

export interface bubble_t {
  text: string // 全文。'' = 非アクティブ
  delay: number // 表示開始までの残り秒
  age: number // 表示開始からの経過秒
}

export function bubble_idle(): bubble_t {
  return { text: '', delay: 0, age: 0 }
}

export function bubble_start(text: string, delay: number): bubble_t {
  return { text, delay, age: 0 }
}

export function bubble_advance(b: bubble_t, dt: number): void {
  if (!b.text) { return }
  if (b.delay > 0) {
    b.delay -= dt
    if (b.delay > 0) { return }
    b.age = -b.delay // 遅延を食い込んだ時間は表示側に繰り入れる
    b.delay = 0
    return
  }
  b.age += dt
  if (b.age > b.text.length * bubble_char_interval + bubble_linger) {
    b.text = ''
  }
}

export function bubble_visible_text(b: bubble_t): string {
  if (!b.text || b.delay > 0) { return '' }
  return b.text.slice(0, Math.floor(b.age / bubble_char_interval) + 1)
}

export function bubble_active(b: bubble_t): boolean {
  return b.text !== ''
}

// 直前に出した行（プール横断で 1 つだけ覚える）を避けて選ぶ。
// rand は [0, 1) を呼び出し側が渡す（テストで決定的にするため）。
export function monologue_pick(pool: string[], last: string, rand: number): string {
  let index = Math.min(pool.length - 1, Math.floor(rand * pool.length))
  if (pool.length > 1 && pool[index] === last) {
    index = (index + 1) % pool.length
  }
  return pool[index]
}
