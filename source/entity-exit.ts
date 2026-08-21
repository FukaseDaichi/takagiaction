import { audio_play, audio_sfx_beep } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_block, push_light } from './renderer'
import { level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

export class entity_exit_t extends entity_t {
  private _opened = false
  private _used = false
  private _animation_time = 0

  override _render(): void {
    this._animation_time += state.time_elapsed

    if (state.exit_open) {
      // 開通の瞬間に当たり判定だけ床へ戻す。レベル形状は
      // renderer_freeze_level_geometry() で buffer_data の先頭に焼かれていて
      // 後から書き換えられないため、「壁 → 床の差し替え」は静的ジオメトリでは
      // 表現できない。閉じている間だけ毎フレーム push_block する。
      if (!this._opened) {
        this._opened = true
        level_data[(this.x >> 3) + (this.z >> 3) * level_width] = 1
      }
    } else {
      push_block(this.x, this.z, 4, 17)
    }

    push_light(
      this.x + 4, 4, this.z + 12,
      0.2, 1.0, 0.5,
      state.exit_open ? 0.02 + Math.sin(this._animation_time * 6) * 0.01 : 0.01,
    )
  }

  override _check(other: entity_t): void {
    // state.game_running: 自機の被弾死と同じフレームでここに来ると、
    // run_end() が death_screen_show() で止めたターミナルを
    // terminal_show_notice() が再び動かしてしまう（entity-smoking-area.ts と
    // 同じ理由）。ラン終了後は遷移そのものを予約しない。
    if (state.game_running && state.exit_open && !this._used && other instanceof entity_player_t) {
      this._used = true
      audio_play(audio_sfx_beep)
      // 降下は state.descend_timer に積み、実行は game_tick に任せる。理由は 2 つ:
      // ・next_level() を衝突ループの中から直接呼ぶと、走査中の state.entities を
      //   差し替えることになる
      // ・terminal_show_notice() の完了コールバックに載せると、約 5 秒の通過演出中に
      //   別の通知（E の予備の一本、M の音声トグル）が 1 つ出た
      //   だけで terminal_cancel() が予約ごと捨て、深度が進まないまま非常口も
      //   喫煙所も使用済みになってフロアが永久に詰む（レビュー Finding 1）
      state.descend_timer = terminal_show_notice('非常口を通過___下の階へ')
    }
  }
}
