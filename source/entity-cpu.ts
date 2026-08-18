import { audio_play, audio_sfx_beep } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { next_level } from './game'
import { push_block, push_light } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

export class entity_cpu_t extends entity_t {
  private _animation_time = 0

  override _render(): void {
    this._animation_time += state.time_elapsed

    push_block(this.x, this.z, 4, 17)
    const intensity =
      this.h == 5
        ? 0.02 + Math.sin(this._animation_time * 10 + Math.random() * 2) * 0.01
        : 0.01
    push_light(this.x + 4, 4, this.z + 12, 0.2, 0.4, 1.0, intensity)
  }

  override _check(other: entity_t): void {
    if (this.h == 5 && other instanceof entity_player_t) {
      this.h = 10
      state.cpus_rebooted++

      const reboot_message = '\n\n\n再起動中..._' + '成功\n'

      if (state.cpus_total - state.cpus_rebooted > 0) {
        terminal_show_notice(
          reboot_message +
            '残り ' +
            (state.cpus_total - state.cpus_rebooted) +
            ' 件のシステムが停止中',
        )
      } else {
        if (state.current_level != 3) {
          terminal_show_notice(
            reboot_message +
              '全システム オンライン\n' +
              '次の転送先を三角測量中...___' +
              '座標を捕捉\n' +
              '転送中...',
            next_level,
          )
        } else {
          terminal_show_notice(reboot_message + '全システム オンライン', next_level)
        }
      }
      audio_play(audio_sfx_beep)
    }
  }
}
