import { audio_play, audio_sfx_explode } from './audio'
import { entity_t } from './entity'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { entity_player_t } from './entity-player'
import { camera, push_light } from './renderer'
import { state } from './state'

export class entity_sentry_t extends entity_t {
  private _select_target_counter = 0
  private _target_x = this.x // 基底 constructor が this.x を設定した後に走る
  private _target_z = this.z

  protected override _init(): void {
    this.h = 20 // h は基底フィールドなので初期化子に潰されない
  }

  override _update(): void {
    const t = this
    const txd = t.x - t._target_x
    const tzd = t.z - t._target_z
    const xd = t.x - state.entity_player!.x
    const zd = t.z - state.entity_player!.z
    const dist = Math.sqrt(xd * xd + zd * zd)

    t._select_target_counter -= state.time_elapsed

    // select new target after a while
    if (t._select_target_counter < 0) {
      if (dist < 64) {
        t._select_target_counter = Math.random() * 0.5 + 0.3
        t._target_x = state.entity_player!.x
        t._target_z = state.entity_player!.z
      }
      if (dist < 48) {
        const angle = Math.atan2(
          state.entity_player!.z - this.z,
          state.entity_player!.x - this.x,
        )
        new entity_sentry_plasma_t(
          t.x,
          0,
          t.z,
          0,
          26,
          angle + Math.random() * 0.2 - 0.11,
        )
      }
    }

    // set velocity towards target
    if (dist > 24) {
      t.ax = Math.abs(txd) > 2 ? (txd > 0 ? -48 : 48) : 0
      t.az = Math.abs(tzd) > 2 ? (tzd > 0 ? -48 : 48) : 0
    } else {
      t.ax = t.az = 0
    }

    super._update()
  }

  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    this.vx = from.vx * 0.1
    this.vz = from.vz * 0.1
    spawn_particles(this, 3)
  }

  protected override _kill(): void {
    super._kill()
    new entity_explosion_t(this.x, 0, this.z, 0, 26)
    camera.shake = 3
    audio_play(audio_sfx_explode)
  }
}

export class entity_sentry_plasma_t extends entity_t {
  protected override _init(angle: number): void {
    const speed = 64
    this.vx = Math.cos(angle) * speed
    this.vz = Math.sin(angle) * speed
  }

  override _render(): void {
    super._render()
    push_light(this.x, 4, this.z + 6, 1.5, 0.2, 0.1, 0.04)
  }

  protected override _did_collide(): void {
    this._kill()
  }

  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) {
      other._receive_damage(this, 1)
      this._kill()
    }
  }
}
