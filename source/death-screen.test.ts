import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 死亡画面が抜けるときに、押しっぱなしのキーを keys に残さないことを固定する。
//
// input.ts の document.onkeydown と、死亡画面が addEventListener で足す on_key は
// 別々のハンドラで同じ keys を触る。両方を本物で動かさないとこの取りこぼしは
// 再現できないので、jsdom は足さず最小の document を置いて配線ごと動かす。
const harness = vi.hoisted(() => {
  type listener_t = (ev: unknown) => void
  const keydown_listeners: listener_t[] = []
  // 死亡画面が実際に触る面だけを持つ要素。ここに並ぶ property は、モックを
  // 削って落ちたスタックが名指ししたものだけで、予防的な追加はしない
  // （classList.contains や dataset は実装が使わない。offsetWidth は
  // `void el.offsetWidth` の強制リフローでしか読まれず、未定義でも投げない）
  const make_el = (): Record<string, unknown> => ({
    id: '',
    // display は .ds-yani-warn / .ds-item / .ds-nr / #ds 自身の表示切り替えで
    // 代入され、setProperty は fill_detail() が --c（部位の色）を挿すのに使う
    style: { display: '', setProperty: () => {} },
    textContent: '',
    innerHTML: '',
    // apply() / fill_static() / descend() が付け外しする。付いた class は
    // このテストの主題（keys の後始末）と無関係なので記録しない
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    onclick: null,
    // render() は [data-item] / .ds-part / .ds-detail-pips i を走査して強調
    // 階層を当てるが、キーボードの配線には要らないので空で足りる
    querySelectorAll: () => [] as unknown[],
    querySelector: () => make_el(),
  })
  const doc = {
    onkeydown: null as listener_t | null,
    onkeyup: null as listener_t | null,
    body: { appendChild: () => {} },
    createElement: () => make_el(),
    addEventListener: (type: string, fn: listener_t) => {
      // 同じ (type, listener) の二重登録は本物の DOM が弾く。ここで弾かないと
      // 表示のたびに on_key が積み上がり、1 回のキーで dispatch が何度も走る
      if (type === 'keydown' && !keydown_listeners.includes(fn)) { keydown_listeners.push(fn) }
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
// ESM のモックは、使われる名前が欠けているとその名前を読んだ時点で投げる。
// death-screen.ts が import する 10 個をそのまま並べる。audio_toggle は
// input.ts が M キー用に import しているが、このテストは M を押さないので置かない
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_sfx_beep: undefined,
  audio_sfx_door: undefined,
  audio_sfx_exhale: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_lighter: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_shoot: undefined,
  audio_sfx_swing: undefined,
  audio_sfx_terminal: undefined,
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
// 代入されるので、あとから addEventListener した死亡画面より先に走る。
// 返り値は preventDefault() が呼ばれた回数（2 系統の合計）
function keydown(key: string, code: number): number {
  let prevented = 0
  const ev = { key, keyCode: code, repeat: false, preventDefault: () => { prevented++ } }
  harness.doc.onkeydown!(ev)
  for (const fn of [...harness.keydown_listeners]) { fn(ev) }
  return prevented
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

// 入場シーケンスの尺。この 1400ms は state.busy = true で、ds_reduce が
// 入力を全部捨てる。どのテストもまずここまで進めてから入力を送る
const entry_lock = 1400
// 退場演出の尺。keys の後始末と on_descend_cb() はこの終わりに走る
const exit_duration = 1000

// 死因は敵、記録更新なし。この画面のどの分岐を通っても descend() は同じなので、
// リザルトの中身は「死んで出た画面である」ことだけを表す最小の 1 件で足りる
const result = {
  depth: 3, kills: 12, run_time: 95, smoke_count: 2, dummy_count: 1,
  death_cause: 0, best_depth_before: 0,
}

describe('死亡画面のキー後始末', () => {
  let started = 0

  beforeEach(() => {
    // useFakeTimers() は前のテストが残した予約ごと作り直す
    vi.useFakeTimers()
    input_init()
    for (const [, code] of all_keys) { keys[code] = 0 }
    started = 0
    death_screen_show(result, () => { started++ })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('入場シーケンス中の入力は捨てられ、明けてから効く', () => {
    keydown('Escape', 27)
    vi.advanceTimersByTime(exit_duration)
    expect(started).toBe(0)

    // 入場が明けてから同じキーを押せば、通常どおり降下する
    vi.advanceTimersByTime(entry_lock - exit_duration)
    keydown('Escape', 27)
    vi.advanceTimersByTime(exit_duration)
    expect(started).toBe(1)
  })

  it('押しっぱなしのスペースは、地下へ戻った時点で残らない', () => {
    vi.advanceTimersByTime(entry_lock)
    keydown(' ', key_shoot)
    // 前提: 死亡画面は Space を読まないが、input.ts のハンドラは押下を記録する
    expect(keys[key_shoot]).toBe(1)

    keydown('Escape', 27)

    // 後始末は退場演出（1000ms）の終わりで、on_descend_cb() の直前に走る。
    // 「まだ 1 のまま」を挟むことで、キー戻しが descend() の入口へ移されたり
    // 演出の外へ出されたりする変異も殺せる
    expect(started).toBe(0)
    expect(keys[key_shoot]).toBe(1)

    vi.advanceTimersByTime(exit_duration)

    expect(started).toBe(1)
    expect(keys[key_shoot]).toBe(0)
  })

  it('Enter で地下へ戻る場合も、押しっぱなしのスペースは残らない', () => {
    vi.advanceTimersByTime(entry_lock)
    // 既定フォーカスは「地下へ戻る」なので、Enter がそのまま降下になる。
    // Escape とは別の出口
    keydown(' ', key_shoot)

    keydown('Enter', 13)
    vi.advanceTimersByTime(exit_duration)

    expect(started).toBe(1)
    expect(keys[key_shoot]).toBe(0)
  })

  it('keys に載るキーはどれも、押しっぱなしのまま残らない', () => {
    vi.advanceTimersByTime(entry_lock)
    // 死亡画面が操作に使うのは Tab と矢印。Space と E は読まないが、同じ
    // keys に載るので押しっぱなしのまま戻れば次のランの 1 フレーム目に効く
    for (const [key, code] of all_keys) {
      keydown(key, code)
      expect(keys[code]).toBe(1)
    }

    // Tab で強化モードへ入っているので、Esc は「1 段戻る」を 2 回踏む
    // （1 回目で idle へ、2 回目で降下）
    keydown('Escape', 27)
    keydown('Escape', 27)
    vi.advanceTimersByTime(exit_duration)

    expect(started).toBe(1)
    for (const [, code] of all_keys) { expect(keys[code]).toBe(0) }
  })
})

// preventDefault() は「機能を成立させている最も外側の 1 行」で、外すと Tab で
// ブラウザ既定のフォーカス移動が走り、クリックでネイティブフォーカスが残った
// ボタンが Enter / Space に二重反応する（設計書「状態機械」「テスト方針」）
describe('死亡画面のキー既定動作', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    input_init()
    death_screen_show(result, () => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 入場シーケンス中（busy）でも preventDefault は on_key の先頭、dispatch より
  // 前で走るので、状態を動かさずに数えられる。input.ts の onkeydown も keys に
  // 載るキーでは preventDefault を呼ぶため、死亡画面ぶんだけを単独で見られるのは
  // keys に載らない Enter で、Tab と Space は 2 系統の合計になる
  it('Tab / Enter / Space はブラウザ既定の動作を止める', () => {
    expect(keydown('Enter', 13)).toBe(1)
    expect(keydown('Tab', key_swap)).toBe(2)
    expect(keydown(' ', key_shoot)).toBe(2)
  })

  it('矢印と Esc では死亡画面は既定動作を止めない', () => {
    expect(keydown('ArrowUp', key_up)).toBe(1) // input.ts のぶんだけ
    expect(keydown('Escape', 27)).toBe(0)
  })
})
