import { audio_play, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { push_light } from './renderer'
import { state } from './state'

// 吸い殻。拾うとラン内のヤニが 1 増える。meta への合算は run_end() が行う。
// スプライトは 26（HP バーと同じ白点）を火種に見立て、専用の絵は用意しない
export class entity_yani_t extends entity_t {
  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) {
      this._kill()
      state.yani_run++
      audio_play(audio_sfx_pickup)
    }
  }

  override _render(): void {
    super._render()
    // 弱いオレンジの光で、暗い床でも吸い殻の火種として見つけられるようにする
    push_light(this.x, 2, this.z + 4, 1.0, 0.4, 0.1, 0.3)
  }
}
