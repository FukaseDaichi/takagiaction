import {
  audio_music_death, audio_play, audio_sfx_hurt, audio_sfx_pickup, audio_sfx_shoot,
} from './audio'
import { death_cause_nicotine } from './death-screen-model'
import { entity_t } from './entity'
import { entity_plasma_t } from './entity-plasma'
import { key_down, key_left, key_right, key_shoot, key_spare, key_up, keys } from './input'
import { meta_power_factor, meta_speed_factor } from './meta'
import { monologue_death } from './monologue'
import {
  nicotine_stage, player_light_falloff, player_speed, shot_interval, shot_spread,
} from './nicotine'
import { camera, push_light } from './renderer'
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
    // 死亡シーケンス中の死体。入力も物理も止めて、game_tick が y（ドローンの
    // 持ち上げ）を書くのに任せる。基底の _update() を呼ぶと bobbing で書いた
    // y の残差を積分し続けてしまうので、ここで完全に止める
    if (state.dying) {
      t.ax = t.az = 0
      t.vx = t.vz = 0
      return
    }
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    const smoking = state.smoking === 1
    // 一服中は移動も射撃もできない。無敵にはしない
    const speed = smoking ? 0 : player_speed(stage, meta_speed_factor())

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

    // 予備の一本: E で 50% 回復。エッジ検出は input.ts と対で、処理したら 0 へ戻す。
    // こっそり浅く吸うだけなので感知器は作動せず（非常口は開かない）、回復も半分止まり。
    // リザルト表示中の terminal_show_notice は表示チェーンを壊すので game_running を見る
    if (keys[key_spare]) {
      keys[key_spare] = 0
      if (!smoking && state.game_running && state.spares_left > 0) {
        state.spares_left--
        state.smoke_count++
        state.nicotine = Math.min(
          state.nicotine_max, state.nicotine + state.nicotine_max * 0.5,
        )
        audio_play(audio_sfx_pickup)
        terminal_show_notice('隠れて一服した（残り ' + state.spares_left + ' 本）')
      }
    }

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
    // 死体は点滅させない（致命打の直後は被弾点滅の 2 秒が残っている）
    if (state.dying || this._last_damage < 0 || this._frame % 6 < 4) {
      super._render()
    }
    // 視界は falloff で縮める。RGB を下げても暖色が減って青く沈むだけで、
    // 見える範囲はフラグメントシェーダの霧と環境光が決めている
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    push_light(this.x, 4, this.z + 6, 1, 0.5, 0, player_light_falloff(stage))
  }

  // 死＝死亡シーケンスの開始（docs/gameplay.md「死亡シーケンス」）。
  // super._kill() は呼ばない — _dead にするとフレーム末尾でエンティティから
  // 除去されて死体が消える。run_end() は game_tick が 3 秒後に呼ぶ。
  // 一度死んだらもう死なない: state.dying が二重呼び出しを遮断し（二重に走ると
  // 姿勢がもう一段跳ねる）、game_running がリザルト表示中の再開を止める。
  // 死体は load_level まで残るので、止めないと敵に押されるたびシーケンスが
  // 走り直し、表示中のリザルトに通知と BGM の落としが割り込む
  protected override _kill(): void {
    if (state.dying || !state.game_running) { return }
    state.dying = 1
    state.death_elapsed = 0
    this.y = 10
    this.z += 5
    camera.shake = 5 // 倒れた衝撃の一発。以降は 0.9/frame の減衰に任せる
    audio_music_death()
    monologue_death(state.death_cause)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    // 死体は傷つかない（敵が乗ってきても hurt 音を鳴らさない）。シーケンス中も
    // リザルト表示中も、死体が消えるのは次のフロアを読み込むときだけ
    if (state.dying || !state.game_running) { return }
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
    if (this.h <= 0) {
      // 死因の記録は _kill() より前。run_end() がこの値を死亡画面に渡す
      state.death_cause = death_cause_nicotine
      this._kill()
    }
  }
}
