import { audio_play, audio_sfx_hit } from './audio'
import { entity_t } from './entity'
import { entity_sentry_t } from './entity-sentry'
import { entity_spider_t } from './entity-spider'
import { push_light } from './renderer'

export class entity_plasma_t extends entity_t {
  protected override _init(angle?: number): void {
    const speed = 96
    this.vx = Math.cos(angle!) * speed
    this.vz = Math.sin(angle!) * speed
  }

  override _render(): void {
    super._render()
    push_light(this.x, 4, this.z + 6, 0.9, 0.2, 0.1, 0.04)
  }

  protected override _did_collide(): void {
    this._kill()
  }

  override _check(other: entity_t): void {
    if (other instanceof entity_spider_t || other instanceof entity_sentry_t) {
      audio_play(audio_sfx_hit)
      other._receive_damage(this, 1)
      this._kill()
    }
  }
}
