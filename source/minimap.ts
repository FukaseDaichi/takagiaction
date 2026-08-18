import { minimap_canvas } from './dom'
import { entity_cpu_t } from './entity-cpu'
import { level_data, level_height, level_width, state } from './state'

// Fog of war minimap, drawn on a 2d canvas overlaying the WebGL view.
// One level tile == one pixel, so the whole 64x64 level fits as-is.

const minimap_view_radius = 10 // tiles revealed around the player
const minimap_explored = new Uint8Array(level_width * level_height)
const minimap_ctx = minimap_canvas.getContext('2d')!
const minimap_pixels = minimap_ctx.createImageData(level_width, level_height)

export function minimap_reset(): void {
  minimap_explored.fill(0)
  minimap_canvas.style.display = 'block'
}

export function minimap_hide(): void {
  minimap_canvas.style.display = 'none'
}

export function minimap_update(): void {
  minimap_reveal()
  minimap_draw()
}

function minimap_set_pixel(index: number, r: number, g: number, b: number): void {
  const p = index * 4
  minimap_pixels.data[p] = r
  minimap_pixels.data[p + 1] = g
  minimap_pixels.data[p + 2] = b
  minimap_pixels.data[p + 3] = 255
}

// Walk a line of tiles from the player towards a target tile, revealing what
// is visible and stopping at whatever blocks the view.
function minimap_cast(x0: number, z0: number, x1: number, z1: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) || 1
  const step_x = (x1 - x0) / steps
  const step_z = (z1 - z0) / steps

  for (let i = 0, x = x0, z = z0; i <= steps; i++, x += step_x, z += step_z) {
    const tile_x = Math.round(x)
    const tile_z = Math.round(z)

    if (tile_x < 0 || tile_x >= level_width || tile_z < 0 || tile_z >= level_height) {
      return
    }

    const index = tile_x + tile_z * level_width
    const tile = level_data[index]

    if (tile === 0) { return } // void: nothing to see and blocks the view
    minimap_explored[index] = 1
    if (tile > 7) { return } // wall: visible, but blocks the view
  }
}

function minimap_reveal(): void {
  const center_x = state.entity_player!.x >> 3
  const center_z = state.entity_player!.z >> 3
  const r = minimap_view_radius

  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz <= r * r) {
        minimap_cast(center_x, center_z, center_x + dx, center_z + dz)
      }
    }
  }
}

function minimap_draw(): void {

  // terrain - unexplored tiles stay transparent, showing the canvas background
  for (let index = 0; index < level_data.length; index++) {
    if (!minimap_explored[index]) {
      minimap_pixels.data[index * 4 + 3] = 0
    }
    else if (level_data[index] > 7) {
      minimap_set_pixel(index, 90, 110, 125) // wall
    }
    else {
      minimap_set_pixel(index, 28, 58, 74) // floor
    }
  }

  // cpus in explored areas - bright while offline, dimmed once rebooted
  for (let i = 0; i < state.entities.length; i++) {
    const cpu = state.entities[i]
    if (cpu instanceof entity_cpu_t) {
      const cpu_index = (cpu.x >> 3) + (cpu.z >> 3) * level_width
      if (minimap_explored[cpu_index]) {
        cpu.h > 5
          ? minimap_set_pixel(cpu_index, 40, 60, 100)
          : minimap_set_pixel(cpu_index, 80, 130, 255)
      }
    }
  }

  // player position, plus one pixel for the direction it faces
  const player_index = (state.entity_player!.x >> 3) + (state.entity_player!.z >> 3) * level_width
  minimap_set_pixel(player_index, 255, 255, 255)
  minimap_set_pixel(
    player_index +
      Math.round(Math.cos(state.entity_player!._angle)) +
      Math.round(Math.sin(state.entity_player!._angle)) * level_width,
    238, 153, 0,
  )

  minimap_ctx.putImageData(minimap_pixels, 0, 0)
}
