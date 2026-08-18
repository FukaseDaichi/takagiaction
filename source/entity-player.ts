import { audio_play, audio_sfx_hurt, audio_sfx_shoot } from './audio'
import { entity_t } from './entity'
import { entity_plasma_t } from './entity-plasma'
import { reload_level } from './game'
import { key_down, key_left, key_right, key_shoot, key_up, keys } from './input'
import { push_light } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

export class entity_player_t extends entity_t {
  // minimap.ts が自機の向きを 1px で描くために読む
  _angle = Math.PI / 2 // face towards the viewer

  private _bob = 0
  private _frame = 0
  private _last_shot = 0
  private _last_damage = 0

  // _init() は持たない。元の実装は上記フィールドの初期化だけをしていた

  override _update(): void {
    const t = this
    const speed = 128

    // movement
    t.ax = keys[key_left] ? -speed : keys[key_right] ? speed : 0
    t.az = keys[key_up] ? -speed : keys[key_down] ? speed : 0

    // rotation - face the direction of movement, hold still while shooting
    if (!keys[key_shoot] && (t.ax || t.az)) {
      t._angle = Math.atan2(t.az, t.ax)
    }
    t.s = (18 + (((t._angle / Math.PI) * 4 + 10.5) % 8)) | 0

    // bobbing
    t._bob += state.time_elapsed * 1.75 * (Math.abs(t.vx) + Math.abs(t.vz))
    t.y = Math.sin(t._bob) * 0.25

    t._last_damage -= state.time_elapsed
    t._last_shot -= state.time_elapsed

    if (keys[key_shoot] && t._last_shot < 0) {
      audio_play(audio_sfx_shoot)
      new entity_plasma_t(t.x, 0, t.z, 0, 26, t._angle + Math.random() * 0.2 - 0.11)
      t._last_shot = 0.1
    }

    super._update()
  }

  override _render(): void {
    this._frame++
    if (this._last_damage < 0 || this._frame % 6 < 4) {
      super._render()
    }
    push_light(this.x, 4, this.z + 6, 1, 0.5, 0, 0.04)
  }

  protected override _kill(): void {
    super._kill()
    this.y = 10
    this.z += 5
    terminal_show_notice('展開失敗\n' + 'バックアップから復元中...')
    setTimeout(reload_level, 3000)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    if (this._last_damage < 0) {
      audio_play(audio_sfx_hurt)
      super._receive_damage(from, amount)
      this._last_damage = 2
    }
  }
}
