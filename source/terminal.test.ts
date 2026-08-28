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

import { terminal_show_notice } from './terminal'

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

  it('通知は 1 行 100ms で打ち、打ち終わってから余韻ぶんで隠れる', () => {
    terminal_show_notice('行1\n行2')

    expect(mocks.el.style.opacity).toBe('1')
    expect(mocks.classes.has('nt')).toBe(true)
    expect(line_count()).toBe(1)
    expect(last_line().startsWith('&gt; ')).toBe(true)

    vi.advanceTimersByTime(normal_line_wait)
    expect(line_count()).toBe(2)

    // 1 行につき line_wait を 1 回、打ち終わりに余韻を 1 回。
    // 隠し始める 1ms 手前ではまだ表示されている
    const hide_at = 2 * normal_line_wait + notice_tail
    vi.advanceTimersByTime(hide_at - normal_line_wait - 1)
    expect(mocks.el.style.opacity).toBe('1')
    vi.advanceTimersByTime(1)
    expect(mocks.el.style.opacity).toBe('0')
  })
})
