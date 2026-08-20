import atlas_url from '../m/q2.png'
import { audio_init } from './audio'
import { game_tick, run_start } from './game'
import { hero_el } from './dom'
import { input_init } from './input'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_hide, terminal_run_intro, terminal_write_line } from './terminal'

input_init()

terminal_write_line('起動中...')

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
        terminal_hide()
        renderer_bind_image(atlas)
        // レベル生成が同期処理になったのでコールバックは要らない。
        // rAF ループはここで一度だけ回し始める（ラン再開では回し直さない）
        run_start()
        game_tick()
      }
    })
  }

  terminal_run_intro()
})
