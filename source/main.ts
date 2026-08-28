import atlas_url from '../m/q2.png'
import { audio_init, audio_unlock } from './audio'
import { death_screen_show } from './death-screen'
import { run_start } from './game'
import { hero_el, start_el } from './dom'
import { input_init } from './input'
import { meta_load } from './meta'
import { opening_preload, opening_show } from './opening'
import { renderer_bind_image, renderer_init } from './renderer'
import { terminal_cancel, terminal_clear, terminal_hide, terminal_write_line } from './terminal'

input_init()
meta_load()

terminal_write_line('起動中...')
// クリック待ちのあいだに OP の DOM 構築と素材（画像・動画）の先読みを済ませる
opening_preload()

// 音はブラウザの自動再生ポリシーで最初のクリック後にしか鳴らせないため、
// クリックを OP より先に置き、OP 全編を音付きで流す（docs/story.md「オープニング」）
audio_init(() => {
  start_el.style.display = 'block'
  document.onclick = () => {
    document.onclick = null
    // 自動再生ポリシー対策。AudioContext の resume() はユーザー操作の
    // ハンドラ内で呼ぶ必要がある（audio.ts 参照）
    audio_unlock()
    start_el.style.display = 'none'
    terminal_cancel()
    terminal_clear()
    terminal_hide()
    hero_el.style.opacity = '0'
    setTimeout(() => {
      hero_el.style.display = 'none'
    }, 1000)

    // OP とレンダラ初期化を並走させ、両方揃ってから自席の端末へ。
    // OP は完走 26.6 秒だがスキップは一瞬なので、アトラス側も待ち合わせる
    let op_done = false
    let atlas_ready = false
    const try_start = (): void => {
      if (op_done && atlas_ready) {
        // 初回も死亡画面（自席の端末）を経由する。前セッションの残高が
        // あれば降下前に使えるし、初回プレイでも操作の予告になる
        death_screen_show(null, run_start)
      }
    }
    renderer_init()
    const atlas = new Image()
    atlas.src = atlas_url
    atlas.onload = () => {
      renderer_bind_image(atlas)
      atlas_ready = true
      try_start()
    }
    opening_show(() => {
      op_done = true
      try_start()
    })
  }
})
