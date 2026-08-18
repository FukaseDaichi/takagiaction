import { audio_play, audio_sfx_explode } from './audio'
import { entity_t } from './entity'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { entity_player_t } from './entity-player'
import { camera } from './renderer'
import { state } from './state'

export class entity_spider_t extends entity_t {
  private _animation_time = 0
  private _select_target_counter = 0
  private _target_x = this.x // 基底 constructor が this.x を設定した後に走る
  private _target_z = this.z

  override _update(): void {
    const t = this
    const txd = t.x - t._target_x
    const tzd = t.z - t._target_z
    const xd = t.x - state.entity_player!.x
    const zd = t.z - state.entity_player!.z
    const dist = Math.sqrt(xd * xd + zd * zd)

    t._select_target_counter -= state.time_elapsed

    // select new target after a while
    if (t._select_target_counter < 0 && dist < 64) {
      t._select_target_counter = Math.random() * 0.5 + 0.3
      t._target_x = state.entity_player!.x
      t._target_z = state.entity_player!.z
    }

    // set velocity towards target
    t.ax = Math.abs(txd) > 2 ? (txd > 0 ? -160 : 160) : 0
    t.az = Math.abs(tzd) > 2 ? (tzd > 0 ? -160 : 160) : 0

    super._update()
    this._animation_time += state.time_elapsed
    this.s = 27 + (((this._animation_time * 15) | 0) % 3)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    this.vx = from.vx
    this.vz = from.vz
    spawn_particles(this, 5)
  }

  override _check(other: entity_t): void {
    // slightly bounce off from other spiders to separate them
    if (other instanceof entity_spider_t) {
      const axis: 'x' | 'z' =
        Math.abs(other.x - this.x) > Math.abs(other.z - this.z) ? 'x' : 'z'
      const velocity_axis: 'vx' | 'vz' = axis === 'x' ? 'vx' : 'vz'
      const amount = this[axis] > other[axis] ? 0.6 : -0.6

      this[velocity_axis] += amount
      other[velocity_axis] -= amount
    }

    // hurt player
    else if (other instanceof entity_player_t) {
      this.vx *= -1.5
      this.vz *= -1.5
      other._receive_damage(this, 1)
    }
  }

  protected override _kill(): void {
    super._kill()
    new entity_explosion_t(this.x, 0, this.z, 0, 26)
    camera.shake = 1
    audio_play(audio_sfx_explode)
  }
}
