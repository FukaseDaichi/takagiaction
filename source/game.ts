import { entity_exit_t } from './entity-exit'
import { entity_health_t } from './entity-health'
import { entity_player_t } from './entity-player'
import { entity_sentry_t } from './entity-sentry'
import { entity_smoking_area_t } from './entity-smoking-area'
import { entity_spider_t } from './entity-spider'
import { hud_hide, hud_show, hud_update } from './hud'
import { generate_level } from './level-generator'
import {
  meta, meta_drain_factor, meta_nicotine_max, meta_save, meta_spare_count,
} from './meta'
import { minimap_hide, minimap_reset, minimap_update } from './minimap'
import {
  camera_shake_amount, nicotine_drain_rate, nicotine_stage, nicotine_stage_limit,
} from './nicotine'
import {
  camera, push_block, push_floor, push_sprite,
  renderer_end_frame, renderer_freeze_level_geometry,
  renderer_prepare_frame, renderer_reset_level_geometry,
} from './renderer'
import { level_data, level_height, level_width, state } from './state'
import { terminal_show_notice, terminal_show_result } from './terminal'

let time_last = performance.now()

// ゲージ 0% の継続ダメージ用。読み書きが game.ts に閉じるのでモジュールローカル。
let limit_damage_timer = 0

export function run_start(): void {
  // ラン開始ごとにシードを引く。シードを深度から一意に決めると、どのランでも
  // 深度 1 が同じ間取りになって暗記ゲーになる。
  state.run_seed = ((Math.random() * 0x7ffffffe) | 0) + 1
  state.depth = 0
  state.kills = 0
  state.yani_run = 0
  state.spares_left = meta_spare_count()
  state.nicotine_max = meta_nicotine_max()
  state.nicotine = state.nicotine_max
  state.game_running = 1
  next_level()
}

export function next_level(): void {
  state.depth++
  state.yani_run += state.depth // フロア到達ボーナス: そのフロアの深度と同数
  load_level(state.depth)
}

export function run_end(): void {
  // 二重呼び出し防止。ここは meta（ラン間で残る恒久状態）を書くので、
  // 2 度走るとヤニが二重に加算されて保存される。ニコチン切れの継続ダメージで
  // 死んだ同じフレームに敵と接触すると、_receive_withdrawal_damage() が
  // _receive_damage() の 2 秒の無敵を通さないぶん _kill() が 2 度走りうる。
  if (!state.game_running) { return }
  state.game_running = 0
  minimap_hide()
  hud_hide()
  // 死亡時も全額持ち帰り。ランごとに失う設計は「損した」感覚を残すだけで
  // 深度を伸ばす動機にならない（設計書）
  meta.yani += state.yani_run
  meta.best_depth = Math.max(meta.best_depth, state.depth)
  meta_save()
  terminal_show_result(state.depth, state.kills, run_start)
}

function load_level(depth: number): void {
  const layout = generate_level(depth, state.run_seed + depth * 7919)

  state.entities = []
  state.entities_to_kill = []
  state.exit_open = 0
  state.smoking = 0
  limit_damage_timer = 0
  camera.shake = 0 // 死亡時に貯まった震えを次のランへ持ち越さないようにする

  renderer_reset_level_geometry()
  minimap_reset()
  hud_show()

  level_data.set(layout.tiles)

  // 喫煙所と非常口はエンティティが毎フレーム push_block() で描くので、
  // 静的ジオメトリからは外す。焼き込んだレベル形状は後から書き換えられないため、
  // 非常口の「壁 → 床」を静的側で表現することはできない。
  const entity_tiles = new Set(
    [layout.smoking_area, layout.exit, ...layout.dummies]
      .map((p) => p.x + p.z * level_width),
  )

  for (let z = 0; z < level_height; z++) {
    for (let x = 0; x < level_width; x++) {
      const index = x + z * level_width
      const tile = level_data[index]

      // 喫煙所と非常口は「ブロックだけ」エンティティが毎フレーム描く。床は静的側で
      // 敷いておく。非常口は開通するとブロックの描画をやめるため、床が無いと
      // そのタイルだけ背景の黒が抜けて見える。生成器がこれらのタイルに書くのは
      // 壁の値なので、床の見た目は明示的に選ぶ（entity-exit が開通時に
      // level_data へ書き戻す 1 と揃えて、アトラス添字 0 にする）。
      if (entity_tiles.has(index)) {
        push_floor(x * 8, z * 8, 0)
        continue
      }

      if (tile > 7) {
        push_block(x * 8, z * 8, 4, tile - 1)
      } else if (tile > 0) {
        push_floor(x * 8, z * 8, tile - 1)
      }
    }
  }

  state.entity_player =
    new entity_player_t(layout.start.x * 8, 0, layout.start.z * 8, 5, 18)

  const smoking_area = new entity_smoking_area_t(
    layout.smoking_area.x * 8, 0, layout.smoking_area.z * 8, 0, 18,
  )
  smoking_area.is_real = true

  for (const p of layout.dummies) {
    new entity_smoking_area_t(p.x * 8, 0, p.z * 8, 0, 18)
  }
  new entity_exit_t(layout.exit.x * 8, 0, layout.exit.z * 8, 0, 18)

  for (const p of layout.spiders) { new entity_spider_t(p.x * 8, 0, p.z * 8, 5, 27) }
  for (const p of layout.sentries) { new entity_sentry_t(p.x * 8, 0, p.z * 8, 5, 32) }
  for (const p of layout.health) { new entity_health_t(p.x * 8, 0, p.z * 8, 5, 31) }

  const player = state.entity_player!
  camera.x = -player.x
  camera.y = -300
  camera.z = -player.z - 100

  renderer_freeze_level_geometry()

  terminal_show_notice('深度 ' + depth + ' に到達___喫煙所の残り香を探知中...')
}

export function game_tick(): void {
  const time_now = performance.now()
  // 最初の game_tick はイントロのタイピングとクリック待ちのあとに走るので、
  // 素の差分は 30〜60 秒になる。タブをバックグラウンドにしたときも同じ。
  // そのままだとニコチンが一気に削られ、entity_t._update() の積分も飽和して
  // 自機と敵が壁をすり抜けて飛ぶ。フレームが落ちたときは飛ばさずスローモーションにする。
  state.time_elapsed = Math.min((time_now - time_last) / 1000, 0.1)
  time_last = time_now

  renderer_prepare_frame()

  const player = state.entity_player!

  // ニコチン減少。ラン終了後（リザルト表示中）と一服中は止める。
  // 一服中に減少を走らせると、設計書 §1 の「1.5 秒吸えたら 60% 回復」が
  // 減少ぶんだけ目減りして成立しなくなる（深度 1 で 58.5、深度 30 で 57.0）。
  // 吸っている間だけ止めるのが、要件を完全に満たす最も単純な形。
  // state.smoking が立つのは喫煙所の _render（この後）なので接触の初回 1 フレーム
  // だけは減少が走るが、深度 1 で 0.017 と誤差にもならない。
  if (state.game_running && !state.smoking) {
    state.nicotine = Math.max(
      0,
      state.nicotine -
        nicotine_drain_rate(state.depth) * meta_drain_factor() * state.time_elapsed,
    )
  }
  const stage = nicotine_stage(state.nicotine, state.nicotine_max)

  // 限界（0%）: 2 秒ごとに HP が 1 減る。即死ではなく、まだ間に合う猶予帯
  if (state.game_running && !state.smoking && stage === nicotine_stage_limit) {
    limit_damage_timer += state.time_elapsed
    if (limit_damage_timer >= 2) {
      limit_damage_timer -= 2
      player._receive_withdrawal_damage()
    }
  } else {
    limit_damage_timer = 0
  }

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

  // center camera on player, apply damping
  camera.x = camera.x * 0.92 - player.x * 0.08
  camera.y = camera.y * 0.92 - player.y * 0.08
  camera.z = camera.z * 0.92 - player.z * 0.08

  // add camera shake - 離脱症状では毎フレーム微量を足して手の震えにする
  camera.shake = camera.shake * 0.9 + camera_shake_amount(stage)
  camera.x += camera.shake * (Math.random() - 0.5)
  camera.z += camera.shake * (Math.random() - 0.5)

  // health bar, render with plasma sprite
  for (let i = 0; i < player.h; i++) {
    push_sprite(-camera.x - 50 + i * 4, 29 - camera.y, -camera.z - 30, 26)
  }

  hud_update(state.nicotine, state.nicotine_max, stage)

  renderer_end_frame()

  minimap_update()

  // remove dead entities
  state.entities = state.entities.filter(
    (entity) => state.entities_to_kill.indexOf(entity) === -1
  )
  state.entities_to_kill = []

  requestAnimationFrame(game_tick)
}
