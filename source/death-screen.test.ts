import { beforeEach, describe, expect, it, vi } from 'vitest'

// 死亡画面が抜けるときに、押しっぱなしのキーを keys に残さないことを固定する。
//
// input.ts の document.onkeydown と、死亡画面が addEventListener で足す on_key は
// 別々のハンドラで同じ keys を触る。両方を本物で動かさないとこの取りこぼしは
// 再現できないので、jsdom は足さず最小の document を置いて配線ごと動かす。
const harness = vi.hoisted(() => {
  type listener_t = (ev: unknown) => void
  const keydown_listeners: listener_t[] = []
  const make_el = () => ({
    id: '',
    style: {} as Record<string, string>,
    innerHTML: '',
    // render() は [data-buy] の一覧と .ds-descend の 1 つに onclick を挿す
    querySelectorAll: () => [] as unknown[],
    querySelector: () => ({ onclick: null }),
  })
  const doc = {
    onkeydown: null as listener_t | null,
    onkeyup: null as listener_t | null,
    body: { appendChild: () => {} },
    createElement: () => make_el(),
    addEventListener: (type: string, fn: listener_t) => {
      if (type === 'keydown') { keydown_listeners.push(fn) }
    },
    removeEventListener: (type: string, fn: listener_t) => {
      if (type !== 'keydown') { return }
      const i = keydown_listeners.indexOf(fn)
      if (i >= 0) { keydown_listeners.splice(i, 1) }
    },
  }
  ;(globalThis as Record<string, unknown>).document = doc
  return { doc, keydown_listeners }
})

vi.mock('./dom', () => ({ canvas: { style: { opacity: '1' } } }))
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_toggle: () => {},
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
}))
vi.mock('./terminal', () => ({
  terminal_cancel: () => {},
  terminal_clear: () => {},
  terminal_hide: () => {},
}))

import { death_screen_show } from './death-screen'
import {
  input_init, key_down, key_left, key_right, key_shoot, key_spare, key_swap, key_up, keys,
} from './input'

// 実機と同じ順序で配る。input.ts の document.onkeydown はゲーム起動時に
// 代入されるので、あとから addEventListener した死亡画面より先に走る
function keydown(key: string, code: number): void {
  const ev = { key, keyCode: code, repeat: false, preventDefault: () => {} }
  harness.doc.onkeydown!(ev)
  for (const fn of [...harness.keydown_listeners]) { fn(ev) }
}

// input.ts の keys に載る 7 つ。KeyboardEvent.key は死亡画面の on_key が読む
const all_keys: Array<[string, number]> = [
  [' ', key_shoot],
  ['e', key_spare],
  ['Tab', key_swap],
  ['ArrowUp', key_up],
  ['ArrowDown', key_down],
  ['ArrowLeft', key_left],
  ['ArrowRight', key_right],
]

describe('死亡画面のキー後始末', () => {
  let started = 0

  beforeEach(() => {
    input_init()
    for (const [, code] of all_keys) { keys[code] = 0 }
    started = 0
    death_screen_show(null, () => { started++ })
  })

  it('押しっぱなしのスペースは、地下へ戻った時点で残らない', () => {
    keydown(' ', key_shoot)
    // 前提: 死亡画面は Space を読まないが、input.ts のハンドラは押下を記録する
    expect(keys[key_shoot]).toBe(1)

    keydown('Escape', 27)

    expect(started).toBe(1)
    expect(keys[key_shoot]).toBe(0)
  })

  it('Enter で地下へ戻る場合も、押しっぱなしのスペースは残らない', () => {
    // Tab で「地下へ戻る」へカーソルを移してから Enter。Escape とは別の出口
    keydown('Tab', key_swap)
    keydown(' ', key_shoot)

    keydown('Enter', 13)

    expect(started).toBe(1)
    expect(keys[key_shoot]).toBe(0)
  })

  it('keys に載るキーはどれも、押しっぱなしのまま残らない', () => {
    // 死亡画面が操作に使うのは Tab と矢印。Space と E は読まないが、同じ
    // keys に載るので押しっぱなしのまま戻れば次のランの 1 フレーム目に効く
    for (const [key, code] of all_keys) {
      keydown(key, code)
      expect(keys[code]).toBe(1)
    }

    keydown('Escape', 27)

    expect(started).toBe(1)
    for (const [, code] of all_keys) { expect(keys[code]).toBe(0) }
  })
})
