import { audio_play, audio_sfx_hurt, audio_sfx_shoot } from './audio'
import { entity_t } from './entity'
import { entity_plasma_t } from './entity-plasma'
import { run_end } from './game'
import { key_down, key_left, key_right, key_shoot, key_up, keys } from './input'
import { meta_power_factor } from './meta'
import {
  nicotine_stage, player_light_falloff, player_speed, shot_interval, shot_spread,
} from './nicotine'
import { push_light } from './renderer'
import { state } from './state'

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
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    const smoking = state.smoking === 1
    // 一服中は移動も射撃もできない。無敵にはしない
    const speed = smoking ? 0 : player_speed(stage)

    // movement
    t.ax = keys[key_left] ? -speed : keys[key_right] ? speed : 0
    t.az = keys[key_up] ? -speed : keys[key_down] ? speed : 0

    // 一服中は加速度を切るだけでは足りない。基底の _update() が既存の vx / vz を
    // 積分し続けるので、走り込んで触れると摩擦で減速しながら約 4.7px 滑る。
    // エンティティ同士の重なり判定は 9px しかないため、接線方向に滑ると接触が
    // 外れて一服が勝手に中断する。速度そのものを落とす。
    if (smoking) { t.vx = t.vz = 0 }

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

    if (!smoking && keys[key_shoot] && t._last_shot < 0) {
      audio_play(audio_sfx_shoot)
      // 元の実装の -0.11..+0.09 と同じ非対称さを保ったまま幅だけ広げる
      const spread = shot_spread(stage)
      new entity_plasma_t(
        t.x, 0, t.z, 0, 26,
        t._angle + Math.random() * spread - spread * 0.55,
      )
      t._last_shot = shot_interval(stage, meta_power_factor())
    }

    super._update()
  }

  override _render(): void {
    this._frame++
    if (this._last_damage < 0 || this._frame % 6 < 4) {
      super._render()
    }
    // 視界は falloff で縮める。RGB を下げても暖色が減って青く沈むだけで、
    // 見える範囲はフラグメントシェーダの霧と環境光が決めている
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    push_light(this.x, 4, this.z + 6, 1, 0.5, 0, player_light_falloff(stage))
  }

  protected override _kill(): void {
    super._kill()
    this.y = 10
    this.z += 5
    // 死＝ラン終了。同じフロアの頭からやり直す経路は無くなった
    run_end()
  }

  override _receive_damage(from: entity_t, amount: number): void {
    if (this._last_damage < 0) {
      audio_play(audio_sfx_hurt)
      super._receive_damage(from, amount)
      this._last_damage = 2
    }
  }

  // ニコチン切れ（ゲージ 0%）の継続ダメージ。被弾ではないので
  // _receive_damage() の 2 秒の無敵を通さない。通してしまうと
  // 2 秒ごとのダメージが無敵とちょうど拮抗して不規則になる。
  _receive_withdrawal_damage(): void {
    audio_play(audio_sfx_hurt)
    this.h -= 1
    if (this.h <= 0) { this._kill() }
  }
}
