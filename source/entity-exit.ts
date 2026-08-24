import { audio_play, audio_sfx_beep } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_block, push_light, push_sprite } from './renderer'
import { descend_duration, level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

// アトラス上の割り当て（tools/exit_tiles.py が 47・48 に焼き込む）。
// 床は静的ジオメトリなので game.ts が敷く（開通しても敷き直さない）。
const tile_sign = 47
export const tile_exit_floor = 48

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
      // 開通すると壁が消えて、床の緑の枠（tile_exit_floor）だけが残る。それだけ
      // では俯瞰の視点で足元に隠れるので、頭上の高さに標識を浮かべる。y = 6 は
      // 自機のビルボード（y = 0〜6）の真上で、扉の上に掲げた標識に見える位置。
      // 自機と重ならないので、乗っている間も標識が隠れない
      push_sprite(this.x + 1, 6, this.z + 1, tile_sign)
    } else {
      push_block(this.x, this.z, 4, 17)
    }

    // 開通後は明滅しながら閉じているときより強く照らす。周期は
    // ミニマップの明滅（1 秒）と揃えてあり、緑が脈打つのは画面でもミニマップでも
    // 「そこが出口だ」の意味になる（docs/gameplay.md「明滅は行き先を意味する」）
    push_light(
      this.x + 4, 4, this.z + 12,
      0.2, 1.0, 0.5,
      state.exit_open ? 0.015 + Math.sin(this._animation_time * 6) * 0.005 : 0.01,
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
      state.descend_timer = descend_duration
      // 行き先（下の階へ）は HUD のカウントダウンが出す。ターミナルは事実だけを
      // 1 行で置く（docs/story.md「声の使い分け」）
      terminal_show_notice('非常口を通過')
    }
  }
}
