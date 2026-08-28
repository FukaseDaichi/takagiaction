import { audio_play, audio_sfx_terminal } from './audio'
import { terminal_el } from './dom'

const terminal_text_ident = '&gt; '

// 通知を打ち終えてから隠すまでの余韻（ミリ秒）
const terminal_notice_tail = 2000

// 1 行あたりの待ち（ミリ秒）。表示チェーンは通知だけになった
const terminal_line_wait = 100

let terminal_text_buffer: string[] = []
let terminal_timeout_id: ReturnType<typeof setTimeout> = 0
let terminal_hide_timeout: ReturnType<typeof setTimeout> = 0

function terminal_show(): void {
  clearTimeout(terminal_hide_timeout)
  terminal_el.style.opacity = '1'
  terminal_el.style.display = 'block'
}

export function terminal_hide(): void {
  terminal_el.style.opacity = '0'
  terminal_hide_timeout = setTimeout(() => {
    terminal_el.style.display = 'none'
  }, 1000)
}

export function terminal_cancel(): void {
  clearTimeout(terminal_timeout_id)
}

// 表示内容と terminal_text_buffer は常に対で戻す。片方だけ戻すと、消えた行が
// バッファに残ったまま次の terminal_write_line() で復活する
export function terminal_clear(): void {
  terminal_el.innerHTML = ''
  terminal_text_buffer = []
}

function terminal_prepare_text(text: string): string[] {
  return text.replace(/_/g, '\n'.repeat(10)).split('\n')
}

function terminal_write_text(lines: string[], callback?: () => void): void {
  const line = lines.shift()
  if (line === undefined) {
    callback?.()
    return
  }
  terminal_write_line(line, () => terminal_write_text(lines, callback))
}

export function terminal_write_line(line: string, callback?: () => void): void {
  if (terminal_text_buffer.length > 20) {
    terminal_text_buffer.shift()
  }
  if (line) {
    audio_play(audio_sfx_terminal)
    terminal_text_buffer.push(terminal_text_ident + line)
    terminal_el.innerHTML = '<div>' + terminal_text_buffer.join('&nbsp;</div><div>') + '<b>█</b></div>'
  }
  if (callback) {
    terminal_timeout_id = setTimeout(callback, terminal_line_wait)
  }
}

// 通知を表示する。
//
// 完了コールバックは受け取らない。渡されたコールバックは terminal_timeout_id の
// 表示チェーンにしか載せられず、そのチェーンは別の場所からの
// terminal_show_notice()（音声トグル、予備の一本、非常口通過）が
// 冒頭の terminal_cancel() で丸ごと捨ててしまう。非常口の降下予約をここに
// 載せていたため、通過演出の約 5 秒のあいだに通知が 1 つ挟まるだけで降下が
// 消え、フロアが永久に詰んだ（レビュー Finding 1）。表示の完了に合わせて
// 何かしたい呼び出し側は、通知の長さに依存しない自前の予約を持つこと
// （非常口の descend_duration と state.descend_timer が例）。
export function terminal_show_notice(notice: string): void {
  terminal_clear()

  terminal_cancel()
  terminal_show()
  // 通知は画面上中央に出す。起動時の左上組み（main.ts の「起動中...」）と
  // 同じ位置に出すと HUD のニコチンゲージのパネルと重なる（クラスの実体は
  // index.html の #a.nt）
  terminal_el.classList.add('nt')

  terminal_write_text(terminal_prepare_text(notice), () => {
    terminal_timeout_id = setTimeout(terminal_hide, terminal_notice_tail)
  })
}
