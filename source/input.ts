import { audio_toggle } from './audio'

export const keys: Record<number, number> =
  { 9: 0, 32: 0, 37: 0, 38: 0, 39: 0, 40: 0, 69: 0 }

export const key_up = 38
export const key_down = 40
export const key_left = 37
export const key_right = 39
export const key_shoot = 32
export const key_spare = 69
export const key_swap = 9

// convert AWDS to left up down right
const key_convert: Record<number, number> = { 65: 37, 87: 38, 68: 39, 83: 40 }

function set_key(ev: KeyboardEvent, value: number): void {
  const code = key_convert[ev.keyCode] || ev.keyCode
  if (code in keys) {
    keys[code] = value
    ev.preventDefault()
  }
}

export function input_init(): void {
  document.onkeydown = (ev) => {
    if (ev.keyCode === 77) { // M: 音声トグル
      if (!ev.repeat) {
        audio_toggle()
      }
      return
    }
    // E（予備の一本）: 押しっぱなしで 1 のままだと毎フレーム発動してしまう。
    // 非リピートの keydown だけ 1 にし、使用側（entity-player）が処理後に 0 へ
    // 戻す。リピート keydown では 1 に戻さないので、押しっぱなしでも 1 回きり
    if (ev.keyCode === key_spare) {
      if (!ev.repeat) { keys[key_spare] = 1 }
      ev.preventDefault()
      return
    }
    // Tab（持ち替え）: E と同じエッジ検出。preventDefault() は必須で、
    // 外すとブラウザ既定のフォーカス移動が走る
    if (ev.keyCode === key_swap) {
      if (!ev.repeat) { keys[key_swap] = 1 }
      ev.preventDefault()
      return
    }
    set_key(ev, 1)
  }

  document.onkeyup = (ev) => {
    set_key(ev, 0)
  }
}
