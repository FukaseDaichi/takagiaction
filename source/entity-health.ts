import { audio_play, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'

export class entity_health_t extends entity_t {
  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) {
      this._kill()
      other.h += other.h < 5 ? 1 : 0
      audio_play(audio_sfx_pickup)
    }
  }
}
