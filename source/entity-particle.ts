import { entity_t } from './entity'
import { state } from './state'

export class entity_particle_t extends entity_t {
  private _lifetime = 3

  override _update(): void {
    this.ay = -320

    if (this.y < 0) {
      this.y = 0
      this.vy = -this.vy * 0.96 // 地面で跳ね返る
    }
    super._update()
    this._lifetime -= state.time_elapsed
    if (this._lifetime < 0) {
      this._kill()
    }
  }
}

// entity.ts の _spawn_particles メソッドから移した自由関数。
// 基底クラスが特定のサブクラスを new すると ESM の初期化時に循環して
// TDZ エラーになるため、基底側には置けない。
export function spawn_particles(source: entity_t, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const particle = new entity_particle_t(source.x, 0, source.z, 1, 30)
    particle.vx = (Math.random() - 0.5) * 128
    particle.vy = Math.random() * 96
    particle.vz = (Math.random() - 0.5) * 128
  }
}
