import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, next_level } from './game'
import { input_init } from './input'
import { renderer_bind_image, renderer_init } from './renderer'
import { state } from './state'
import { terminal_cancel, terminal_hide, terminal_run_intro, terminal_write_line } from './terminal'

input_init()

terminal_write_line('起動中...')

audio_init(() => {
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    terminal_write_line('起動中...', () => {
      renderer_init()

      const atlas = new Image()
      atlas.src = atlas_url
      atlas.onload = () => {
        state.game_running = 1
        terminal_hide()
        renderer_bind_image(atlas)
        next_level(game_tick)
      }
    })
  }

  terminal_run_intro()
})
