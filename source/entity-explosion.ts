import { entity_t } from './entity'
import { push_light } from './renderer'
import { state } from './state'

export class entity_explosion_t extends entity_t {
  private _lifetime = 1

  override _update(): void {
    super._update()
    this._lifetime -= state.time_elapsed
    if (this._lifetime < 0) {
      this._kill()
    }
  }

  override _render(): void {
    push_light(this.x, 4, this.z + 6, 1, 0.7, 0.3, 0.08 * (1 - this._lifetime))
  }
}
