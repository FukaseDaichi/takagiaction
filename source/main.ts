import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, run_start } from './game'
import { hero_el } from './dom'
import { input_init } from './input'
import { menu_show } from './menu'
import { meta_load } from './meta'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_run_intro, terminal_write_line } from './terminal'

input_init()
meta_load()

terminal_write_line('起動中...')

// rAF ループは起動時に一度だけ回し始める（ラン再開では回し直さない）
let game_started = false

function start_run(): void {
  run_start()
  if (!game_started) {
    game_started = true
    game_tick()
  }
}

audio_init(() => {
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    hero_el.style.opacity = '0'
    setTimeout(() => {
      hero_el.style.display = 'none'
    }, 1000)
    terminal_write_line('起動中...', () => {
      renderer_init()

      const atlas = new Image()
      atlas.src = atlas_url
      atlas.onload = () => {
        renderer_bind_image(atlas)
        // 初回もメニュー（自席の端末）を経由する。前セッションの残高が
        // あれば降下前に使えるし、初回プレイでも操作の予告になる
        menu_show(start_run)
      }
    })
  }

  terminal_run_intro()
})
