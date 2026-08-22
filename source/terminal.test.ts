import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// terminal.ts が触る外部は DOM と音声の 2 つだけなので、そこだけ差し替える。
// vi.mock のファクトリは巻き上げられるので vi.hoisted を使う。
const mocks = vi.hoisted(() => {
  // classList は通知の位置クラス（index.html の #a.nt）の付け外しに使われる。
  // 付いているかどうかしか見ないので DOMTokenList は模さず Set に記録する
  const classes = new Set<string>()
  return {
    classes,
    el: {
      style: { opacity: '', display: '' },
      innerHTML: '',
      classList: {
        add: (name: string) => { classes.add(name) },
        remove: (name: string) => { classes.delete(name) },
      },
    },
  }
})

vi.mock('./dom', () => ({ terminal_el: mocks.el }))
vi.mock('./audio', () => ({ audio_play: () => {}, audio_sfx_terminal: undefined }))

import { terminal_cancel, terminal_run_intro, terminal_show_notice } from './terminal'

// terminal_write_line() が書く innerHTML は
// '<div>' + 各行 + '&nbsp;</div><div>' ... + '<b>█</b></div>' なので、
// '<div>' で割った最後の要素が最新行になる
function last_line(): string {
  const parts = mocks.el.innerHTML.split('<div>')
  return parts[parts.length - 1]
}

function line_count(): number {
  return mocks.el.innerHTML.split('<div>').length - 1
}

const notice_tail = 2000
const normal_line_wait = 100

describe('ターミナル', () => {
  beforeEach(() => {
    // useFakeTimers() は前のテストが残した予約ごと作り直す
    vi.useFakeTimers()
    mocks.el.innerHTML = ''
    mocks.el.style.opacity = ''
    mocks.el.style.display = ''
    mocks.classes.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('通知は 1 行 100ms で打ち、戻り値の秒数どおりに隠れる', () => {
    const duration = terminal_show_notice('行1\n行2')

    expect(duration).toBe((2 * normal_line_wait + notice_tail) / 1000)
    expect(mocks.el.style.opacity).toBe('1')
    expect(line_count()).toBe(1)

    vi.advanceTimersByTime(normal_line_wait)
    expect(line_count()).toBe(2)

    // 戻り値の秒数は「隠し始めるまで」。1ms 手前ではまだ表示されている
    vi.advanceTimersByTime(duration * 1000 - normal_line_wait - 1)
    expect(mocks.el.style.opacity).toBe('1')
    vi.advanceTimersByTime(1)
    expect(mocks.el.style.opacity).toBe('0')
  })

  it('ノイズ表示中にイントロを打ち切っても、以後の通知は通常の文体で出る', () => {
    terminal_run_intro()

    // タイトル（100ms/行・プレフィックス付き）→ 4 秒 → ノイズ（16ms/行・
    // プレフィックスなし）。プレフィックスのない行が出たらノイズ表示に入っている
    let elapsed = 0
    while (last_line().startsWith('&gt; ')) {
      vi.advanceTimersByTime(16)
      elapsed += 16
      expect(elapsed, 'ノイズ表示に到達しない').toBeLessThan(60000)
    }
    expect(last_line().startsWith('&gt; ')).toBe(false)

    // ノイズのタイピング中に打ち切る。文体をモジュール変数に持たせていた頃は、
    // ここで通常値に戻す側（ストーリー表示の冒頭）が永久に走らず、以後の通知が
    // すべて 16ms/行・プレフィックスなしになった
    terminal_cancel()

    const duration = terminal_show_notice('深度 1 に到達')
    expect(duration).toBe((1 * normal_line_wait + notice_tail) / 1000)
    expect(last_line().startsWith('&gt; ')).toBe(true)
  })

  it('ゲーム中の通知は画面上中央のクラスを付け、イントロは付けない', () => {
    terminal_show_notice('深度 1 に到達')
    expect(mocks.classes.has('nt')).toBe(true)

    // 死亡画面から戻ってイントロを流し直す経路は無いが、位置クラスの持ち主が
    // 通知側であることを固定する（付けたら剥がす側が要る）
    terminal_run_intro()
    expect(mocks.classes.has('nt')).toBe(false)
  })
})
