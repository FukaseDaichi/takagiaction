import { audio_toggle } from './audio'

export const keys: Record<number, number> = { 32: 0, 37: 0, 38: 0, 39: 0, 40: 0 }

export const key_up = 38
export const key_down = 40
export const key_left = 37
export const key_right = 39
export const key_shoot = 32

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
    set_key(ev, 1)
  }

  document.onkeyup = (ev) => {
    set_key(ev, 0)
  }
}
