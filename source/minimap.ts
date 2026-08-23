import { minimap_canvas, sniff_el } from './dom'
import { entity_container_t } from './entity-container'
import { entity_drone_t } from './entity-drone'
import { entity_exit_t } from './entity-exit'
import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_yani_t } from './entity-yani'
import {
  meta_sniff_active, meta_sniff_distance, meta_sniff_exit, meta_sniff_loot,
  meta_sniff_path,
} from './meta'
import { minimap_radius, nicotine_stage } from './nicotine'
import { sniff_find } from './sniff'
import type { sniff_result_t } from './sniff'
import { level_data, level_height, level_width, state } from './state'

// Fog of war minimap, drawn on a 2d canvas overlaying the WebGL view.
// One level tile == one pixel, so the whole 64x64 level fits as-is.

const minimap_explored = new Uint8Array(level_width * level_height)
const minimap_ctx = minimap_canvas.getContext('2d')!
const minimap_pixels = minimap_ctx.createImageData(level_width, level_height)

// 嗅覚。BFS は毎フレーム回すには重いので 1 秒間隔で再計算する。
// 自機が 1 秒で動けるのは最大 16 タイル相当だが、矢印の解像度（ミニマップの
// 数ピクセル）ではズレとして知覚できない
let sniff_timer = 0
let sniff_result: sniff_result_t | null = null

// 明滅の位相。「まだ行っていない喫煙所」と「開通した非常口」だけが明滅する。
// HUD から「次にやること」のパネルを外した代わりに、この 1 ビットが行き先を
// 常に答える（docs/gameplay.md「明滅は行き先を意味する」）
const blink_period = 1
let blink_timer = 0

export function minimap_reset(): void {
  minimap_explored.fill(0)
  sniff_timer = 0
  sniff_result = null
  blink_timer = 0
}

export function minimap_update(): void {
  const stage = nicotine_stage(state.nicotine, state.nicotine_max)
  blink_timer = (blink_timer + state.time_elapsed) % blink_period
  minimap_sniff()
  minimap_reveal(stage)
  minimap_draw()
}

function minimap_set_pixel(index: number, r: number, g: number, b: number): void {
  const p = index * 4
  minimap_pixels.data[p] = r
  minimap_pixels.data[p + 1] = g
  minimap_pixels.data[p + 2] = b
  minimap_pixels.data[p + 3] = 255
}

function minimap_sniff(): void {
  // state.game_running: run_end() 後も requestAnimationFrame(game_tick) は
  // 回り続け、minimap_update() は無条件に呼ばれる。ここで打ち切らないと、
  // リザルト表示中も 1 秒ごとに BFS が回り、次のランの最初のフレームまで
  // 前のランの光跡と残り香の距離が残る
  // （entity-smoking-area.ts / entity-exit.ts の state.game_running と同じ理由）。
  if (
    !state.game_running ||
    !meta_sniff_active(state.nicotine / state.nicotine_max)
  ) {
    sniff_result = null
    sniff_timer = 0
    sniff_el.style.display = 'none'
    return
  }

  sniff_timer -= state.time_elapsed
  if (sniff_timer <= 0) {
    sniff_timer = 1
    const player = state.entity_player!
    const targets: { x: number, z: number }[] = []
    for (const e of state.entities) {
      // 本物もダミーも「残り香」。消費済み（吸い終わり・灰皿撤去判明）は外す
      if (e instanceof entity_smoking_area_t && !e._done) {
        targets.push({ x: e.x >> 3, z: e.z >> 3 })
      }
      // 嗅覚 Lv4: 開通済みの非常口も嗅ぐ。分岐を書かずに「本物 > 非常口」に
      // なる — _complete() が _done と exit_open を同じ呼び出しで立てるので、
      // まだ吸っていない本物と開通済みの非常口は同時に候補にならない。
      // 開示していないダミーは吸い終えたあとも残るため、ダミーと非常口は
      // BFS 距離で素直に競う（一服後に意味があるのは非常口だけなので、
      // 非常口が勝つのは望ましい。docs/meta-progression.md）。埋まるのは
      // 「一服後に非常口を探して歩き回り、ゲージが再び落ちた」局面で、
      // それまで嗅覚は沈黙していた
      else if (
        e instanceof entity_exit_t && state.exit_open && meta_sniff_exit()
      ) {
        targets.push({ x: e.x >> 3, z: e.z >> 3 })
      }
    }
    sniff_result = sniff_find(level_data, player.x >> 3, player.z >> 3, targets)
  }

  // Lv3 以上: 距離も表示する（1 タイル = 1m と読む）
  if (sniff_result && meta_sniff_distance()) {
    sniff_el.textContent = '残り香 ' + sniff_result.dist + 'm'
    sniff_el.style.display = 'block'
  } else {
    sniff_el.style.display = 'none'
  }
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

function minimap_reveal(stage: number): void {
  const player = state.entity_player!
  const center_x = player.x >> 3
  const center_z = player.z >> 3
  // ゲージが減るほど描き込み半径が縮む。焦りを情報量の減少で表す。
  // minimap_explored は累積で消えないので、効くのは「新しく開く速度」だけ。
  const r = minimap_radius(stage)

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

  // 喫煙所は開示済みダミーだけ灰色。それ以外（未接触・本物）は同じオレンジで、見分けは足で確かめるしかない。
  // 非常口は開通していて、かつ探索済みのときだけ緑で出る。
  //
  // 「これから行く先」だけが明滅する: まだ触っていない喫煙所（本物もダミーも
  // 候補なので両方明滅する。見分けは足で確かめるという中核はそのまま）と、
  // 開通した非常口。吸い終わった本物と開示済みダミーは用済みなので明滅しない。
  // 消える側ではなく白く強くなる側に振るのは、1 タイル 1 ピクセルしかないため
  // 暗くすると見失うから。
  const blink = blink_timer < blink_period / 2
  // 嗅覚 Lv5: ヤニ・清掃ドローン・押収品コンテナは未探索タイルでも点灯する。
  // しきい値は持たない（meta.ts）が、リザルト表示中に前のランの分を映さない
  // ため game_running のガードは生存系と同じく通す
  const loot = state.game_running && meta_sniff_loot()
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i]
    const index = (e.x >> 3) + (e.z >> 3) * level_width

    // 収入系は明滅させない。明滅の有無は生存系（行き先）と収入系（機会）を分ける
    // 印であり（「明滅は行き先を意味する」の規約をそのまま使う）、ヤニと光跡
    // （255,220,100）の見分けは色ではなく形（光跡は自機に隣接する 3 連の
    // ピクセル）が担う
    if (e instanceof entity_yani_t) {
      if (loot) { minimap_set_pixel(index, 215, 195, 110) }
      continue
    }
    if (e instanceof entity_drone_t) {
      if (loot) { minimap_set_pixel(index, 140, 200, 240) }
      continue
    }
    // 押収品コンテナも収入系（機会）。生存系との見分けは明滅の有無が担うので、
    // ヤニ・ドローンと同じく明滅させない（docs/meta-progression.md
    // 「生存系と収入系は別の感覚である」）
    if (e instanceof entity_container_t) {
      if (loot) { minimap_set_pixel(index, 150, 230, 200) }
      continue
    }

    if (!minimap_explored[index]) { continue }

    if (e instanceof entity_smoking_area_t) {
      if (e.revealed_dummy) {
        minimap_set_pixel(index, 110, 110, 110)
      } else if (!e._done && blink) {
        minimap_set_pixel(index, 255, 228, 150)
      } else {
        minimap_set_pixel(index, 238, 153, 0)
      }
    } else if (e instanceof entity_exit_t && state.exit_open) {
      if (blink) {
        minimap_set_pixel(index, 190, 255, 220)
      } else {
        minimap_set_pixel(index, 0, 220, 120)
      }
    }
  }

  // player position, plus one pixel for the direction it faces
  const player = state.entity_player!
  const player_index = (player.x >> 3) + (player.z >> 3) * level_width
  minimap_set_pixel(player_index, 255, 255, 255)
  minimap_set_pixel(
    player_index +
      Math.round(Math.cos(player._angle)) +
      Math.round(Math.sin(player._angle)) * level_width,
    238, 153, 0,
  )

  // 嗅覚: 自機から残り香の方角へ短い光跡を描く。Lv3 以上は経路の第一歩
  // （path_angle）を指す。指す先のタイル自体は必ず床だが、光跡は r=2〜4 に
  // 描くため唯一床が保証される r=1 は描かれず、通路がすぐ折れると光跡は
  // 壁の上に乗りうる（読ませているのは向きだけ）。Lv1〜2 はユークリッド角の
  // ままで、「近いのに矢印が壁を指す」ことが粗い鼻であることの表現になる
  if (sniff_result) {
    const angle = meta_sniff_path() ? sniff_result.path_angle : sniff_result.angle
    for (let r = 2; r <= 4; r++) {
      const x = (player.x >> 3) + Math.round(Math.cos(angle) * r)
      const z = (player.z >> 3) + Math.round(Math.sin(angle) * r)
      if (x >= 0 && x < level_width && z >= 0 && z < level_height) {
        minimap_set_pixel(x + z * level_width, 255, 220, 100)
      }
    }
  }

  minimap_ctx.putImageData(minimap_pixels, 0, 0)
}
