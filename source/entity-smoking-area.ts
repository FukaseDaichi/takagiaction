import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_block, push_light, push_sprite } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

// 一服にかかる時間（秒）。この間ずっと触れ続けないと非常口は開かない。
const smoking_duration = 2.5

// アトラス上の割り当て（tools/atlas.py が 33〜38 に焼き込む）。
// 側面タイルは 8/9/17 以外であること — push_block はその3つだけ高さ16にする。
// スタンド灰皿は低い方（高さ8）で描く。
const tile_ashtray_top = 33
const tile_ashtray_side = 34
const tile_removed_top = 35
const tile_removed_side = 36
const tile_sign = 37

export class entity_smoking_area_t extends entity_t {
  // 本物なら true、ダミー（灰皿撤去済み）なら false。
  // サブクラスのフィールド初期化子は基底 constructor（＝ _init）の後に走るので、
  // _init() 経由では渡せない（渡しても undefined で潰される）。生成側が代入する。
  is_real = false

  private _touching = false
  private _was_smoking = false
  private _progress = 0
  private _done = false
  private _hp_mark = 0
  private _animation_time = 0
  // 中断直後の 1 フレームは touching が真のままなので、何もせず再武装だけ
  // 抑止するためのフラグ。接触が切れるまで解除しない（_advance 参照）。
  private _needs_release = false

  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) { this._touching = true }
  }

  // ダミーだと開示済みか。minimap が灰色化に使う
  get revealed_dummy(): boolean {
    return this._done && !this.is_real
  }

  // game_tick は「エンティティ i の _update → i より後ろとの衝突判定 → i の _render」
  // の順に回す。i より前のエンティティからの _check は i の反復より先に済んでいるので、
  // _render の時点で _touching はこのフレームの接触結果として完成している。
  // エンティティの添字順に依存せず判定できるのはここだけ。
  override _render(): void {
    this._animation_time += state.time_elapsed

    const revealed = this.revealed_dummy
    push_block(
      this.x, this.z,
      revealed ? tile_removed_top : tile_ashtray_top,
      revealed ? tile_removed_side : tile_ashtray_side,
    )
    // 標識は灰皿の右脇。開示後は撤去告知の貼り紙に変わる
    push_sprite(this.x + 9, 0, this.z + 1, revealed ? tile_removed_side : tile_sign)
    if (!revealed) {
      push_light(
        this.x + 4, 4, this.z + 12,
        1.0, 0.6, 0.1,
        this._done ? 0.08 : 0.03 + Math.sin(this._animation_time * 3) * 0.01,
      )
    }

    const touching = this._touching
    this._touching = false

    // 接触が切れたら再武装の待ちを解除する。中断直後は _progress が 0 に
    // 戻っているため、ここで待たせておかないと同じ場所に立ったまま
    // 次のフレームで即座に再武装してしまう（レビュー Finding 2）。
    if (!touching) {
      this._needs_release = false
    }

    let smoking = false
    // state.game_running: 自機の被弾死と同じフレームでここに来ると、
    // run_end() が先に立てたこのフラグで判定できる。ラン終了後に
    // terminal_show_notice() を呼ぶと、terminal_show_result() が組んだ
    // 表示チェーンを terminal_cancel() が壊し、クリック復帰ハンドラが
    // 登録されないままソフトロックする（レビュー Finding 1）。
    if (touching && !this._done && !this._needs_release && state.game_running) {
      if (this.is_real) {
        smoking = this._advance()
      } else {
        this._take_dummy()
      }
    }

    // 移動と射撃のロック。自分が持っていたロックだけを解放する
    if (smoking) {
      state.smoking = 1
    } else if (this._was_smoking) {
      state.smoking = 0
    }
    this._was_smoking = smoking
  }

  // 戻り値は「吸い続けているか」。完了・中断のフレームでは false になり、
  // 次のフレームから移動と射撃が戻る。
  private _advance(): boolean {
    const player = state.entity_player!

    if (this._progress === 0) { this._hp_mark = player.h }

    // 被弾で中断。進捗は 0 に戻るが _done は立てないので吸い直せる。
    // 中断で喫煙所を消費すると非常口が永久に開かず、ゲージが尽きるまで
    // 何もできない詰み状態が発生する。
    if (player.h < this._hp_mark) {
      this._progress = 0
      // 一服中は自機の速度を強制的にゼロにしている。接触が切れるまで
      // 再武装させないと、動けないまま押さえ込まれ続けて詰む。
      this._needs_release = true
      terminal_show_notice('咳き込んだ')
      return false
    }

    this._progress += state.time_elapsed
    // 吸っている間ずっと回復するので「吸えた時間に比例」が自然に満たされる。
    // 2.5 秒で満タンになる速度。中断が事故ではなく判断のグラデーションになる。
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + (state.nicotine_max / smoking_duration) * state.time_elapsed,
    )

    if (this._progress >= smoking_duration) {
      this._complete()
      return false
    }
    return true
  }

  private _complete(): void {
    const player = state.entity_player!
    this._done = true
    state.nicotine = state.nicotine_max
    player.h = Math.min(player.h + 1, 5)
    state.exit_open = 1
    audio_play(audio_sfx_beep)
    terminal_show_notice('深く吸い込む...___非常口のロックが解除された')
  }

  // ダミーは回復手段ではなく「歩いた時間の損」。5% は深度 21 なら 2.7 秒ぶんで、
  // 実質ゼロ。回復ではなくペナルティとして設計されている。
  private _take_dummy(): void {
    this._done = true
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + state.nicotine_max * 0.05,
    )
    audio_play(audio_sfx_pickup)
    terminal_show_notice('灰皿は撤去されました')
  }
}
