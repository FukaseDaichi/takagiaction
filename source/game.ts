import l1_url from '../m/l1.png'
import l2_url from '../m/l2.png'
import l3_url from '../m/l3.png'
import { entity_cpu_t } from './entity-cpu'
import { entity_health_t } from './entity-health'
import { entity_player_t } from './entity-player'
import { entity_sentry_t } from './entity-sentry'
import { entity_spider_t } from './entity-spider'
import {
  camera, push_block, push_floor, push_sprite,
  renderer_end_frame, renderer_freeze_level_geometry,
  renderer_prepare_frame, renderer_reset_level_geometry,
} from './renderer'
import { minimap_reset, minimap_update } from './minimap'
import { array_rand, random_int, random_seed } from './random'
import { level_data, level_height, level_width, state } from './state'
import { terminal_run_outro, terminal_show_notice } from './terminal'

let time_last = performance.now()

// レベル画像は静的 import で URL を得る。'm/' + id + '.png' の文字列連結だと
// Vite が参照を検出できず、本番ビルドで dist に出力されないため 404 になる。
// id は 1 起点なので id - 1 で引く。
const level_image_urls = [l1_url, l2_url, l3_url]

// コールバック内の this に依存していた形（noImplicitThis が通らない）を
// 画像を引数で渡す形に変える。game.ts 内からのみ呼ぶので export しない。
function load_image(
  url: string,
  callback: (image: HTMLImageElement) => void,
): void {
  const image = new Image()
  image.src = url
  image.onload = () => callback(image)
}

export function next_level(callback?: () => void): void {
  if (state.current_level == 3) {
    state.entities_to_kill.push(state.entity_player!)
    terminal_run_outro()
  } else {
    state.current_level++
    load_level(state.current_level, callback)
  }
}

export function load_level(id: number, callback?: () => void): void {
  random_seed(0xbadc0de1 + id)
  load_image(level_image_urls[id - 1], (image) => {
    state.entities = []
    renderer_reset_level_geometry()

    state.cpus_total = 0
    state.cpus_rebooted = 0

    minimap_reset()

    const scratch = document.createElement('canvas')
    scratch.width = scratch.height = level_width // assume square levels
    const scratch_ctx = scratch.getContext('2d')!
    scratch_ctx.drawImage(image, 0, 0)
    const pixels = scratch_ctx.getImageData(0, 0, level_width, level_height).data

    for (let y = 0, index = 0; y < level_height; y++) {
      for (let x = 0; x < level_width; x++, index++) {
        // reduce to 12 bit color to accurately match
        const color_key =
          ((pixels[index * 4] >> 4) << 8) +
          ((pixels[index * 4 + 1] >> 4) << 4) +
          (pixels[index * 4 + 2] >> 4)

        if (color_key !== 0) {
          const tile = (level_data[index] =
            color_key === 0x888 // wall
              ? random_int(0, 5) < 4 ? 8 : random_int(8, 17)
              : array_rand([1, 1, 1, 1, 1, 3, 3, 2, 5, 5, 5, 5, 5, 5, 7, 7, 6])) // floor

          if (tile > 7) { // walls
            push_block(x * 8, y * 8, 4, tile - 1)
          } else if (tile > 0) { // floor
            push_floor(x * 8, y * 8, tile - 1)

            // enemies and items
            if (random_int(0, 16 - (id * 2)) == 0) {
              new entity_spider_t(x * 8, 0, y * 8, 5, 27)
            } else if (random_int(0, 100) == 0) {
              new entity_health_t(x * 8, 0, y * 8, 5, 31)
            }
          }

          // cpu
          if (color_key === 0x00f) {
            level_data[index] = 8
            new entity_cpu_t(x * 8, 0, y * 8, 0, 18)
            state.cpus_total++
          }

          // sentry
          if (color_key === 0xf00) {
            new entity_sentry_t(x * 8, 0, y * 8, 5, 32)
          }

          // player start position (blue)
          if (color_key === 0x0f0) {
            state.entity_player = new entity_player_t(x * 8, 0, y * 8, 5, 18)
          }
        }
      }
    }

    const player = state.entity_player!

    // Remove all spiders that spawned close to the player start
    for (const e of state.entities) {
      if (
        e instanceof entity_spider_t &&
        Math.abs(e.x - player.x) < 64 &&
        Math.abs(e.z - player.z) < 64
      ) {
        state.entities_to_kill.push(e)
      }
    }

    camera.x = -player.x
    camera.y = -300
    camera.z = -player.z - 100

    renderer_freeze_level_geometry()

    terminal_show_notice(
      '停止中のシステムを走査中...___' +
      (state.cpus_total) + ' 件のシステムを検出'
    )
    callback && callback()
  })
}

export function reload_level(): void {
  load_level(state.current_level)
}

export function game_tick(): void {
  const time_now = performance.now()
  state.time_elapsed = (time_now - time_last) / 1000
  time_last = time_now

  renderer_prepare_frame()

  // update and render entities
  const entities = state.entities
  for (let i = 0; i < entities.length; i++) {
    const e1 = entities[i]
    if (e1._dead) { continue }
    e1._update()

    // check for collisions between entities - it's quadratic and nobody cares \o/
    for (let j = i + 1; j < entities.length; j++) {
      const e2 = entities[j]
      if (!(
        e1.x >= e2.x + 9 ||
        e1.x + 9 <= e2.x ||
        e1.z >= e2.z + 9 ||
        e1.z + 9 <= e2.z
      )) {
        e1._check(e2)
        e2._check(e1)
      }
    }

    e1._render()
  }

  const player = state.entity_player!

  // center camera on player, apply damping
  camera.x = camera.x * 0.92 - player.x * 0.08
  camera.y = camera.y * 0.92 - player.y * 0.08
  camera.z = camera.z * 0.92 - player.z * 0.08

  // add camera shake
  camera.shake *= 0.9
  camera.x += camera.shake * (Math.random() - 0.5)
  camera.z += camera.shake * (Math.random() - 0.5)

  // health bar, render with plasma sprite
  for (let i = 0; i < player.h; i++) {
    push_sprite(-camera.x - 50 + i * 4, 29 - camera.y, -camera.z - 30, 26)
  }

  renderer_end_frame()

  minimap_update()

  // remove dead entities
  state.entities = state.entities.filter(
    (entity) => state.entities_to_kill.indexOf(entity) === -1
  )
  state.entities_to_kill = []

  requestAnimationFrame(game_tick)
}
