import { entity_t } from './entity'
import { state } from './state'

// 一服完了後の喫煙所から立ちのぼる煙。物理（重力・摩擦・壁判定）は不要なので
// 基底の _update() は呼ばず、上昇と横揺れだけを自前で積分する。
// アトラス 33〜38 の契約の一部（entity-smoking-area.ts と tools/atlas.py を参照）
const smoke_tile = 38
const smoke_lifetime = 2
const smoke_rise_speed = 8

export class entity_smoke_t extends entity_t {
  private _age = 0

  override _update(): void {
    this._age += state.time_elapsed
    this.y += smoke_rise_speed * state.time_elapsed
    this.x += Math.sin(this.y) * 2 * state.time_elapsed
    if (this._age > smoke_lifetime) {
      this._kill()
    }
  }
}

export function spawn_smoke(x: number, z: number): void {
  new entity_smoke_t(x, 0, z, 0, smoke_tile)
}
