import { push_sprite } from './renderer'
import { level_data, level_width, state } from './state'

export class entity_t<TInit = undefined> {
  x: number
  y: number
  z: number
  vx = 0
  vy = 0
  vz = 0
  ax = 0
  ay = 0
  az = 0
  f: number
  s: number
  h = 5

  // game.ts のループが毎フレーム読む（entities のフィルタ前に飛ばすため）
  _dead = false

  constructor(
    x: number,
    y: number,
    z: number,
    friction: number,
    sprite: number,
    init_param?: TInit,
  ) {
    this.x = x
    this.y = y
    this.z = z
    this.f = friction
    this.s = sprite

    this._init(init_param)
    // TInit は _init の引数位置にしか現れないため、TS の生成クラス分散推論では
    // entity_t<TInit> は entity_t<undefined>（= entity_t[] の要素型）と構造的に
    // 不変（invariant）とみなされる。実行時は同一クラスで安全なのでキャストする。
    state.entities.push(this as entity_t)
  }

  // separate _init() method, because "constructor" cannot be uglyfied
  protected _init(init_param?: TInit): void {}

  _update(): void {
    const t = this
    const last_x = t.x
    const last_z = t.z

    // velocity
    t.vx += t.ax * state.time_elapsed - t.vx * Math.min(t.f * state.time_elapsed, 1)
    t.vy += t.ay * state.time_elapsed - t.vy * Math.min(t.f * state.time_elapsed, 1)
    t.vz += t.az * state.time_elapsed - t.vz * Math.min(t.f * state.time_elapsed, 1)

    // position
    t.x += t.vx * state.time_elapsed
    t.y += t.vy * state.time_elapsed
    t.z += t.vz * state.time_elapsed

    // check wall collissions, horizontal
    if (t._collides(t.x, last_z)) {
      t._did_collide()
      t.x = last_x
      t.vx = 0
    }

    // check wall collissions, vertical
    if (t._collides(t.x, t.z)) {
      t._did_collide()
      t.z = last_z
      t.vz = 0
    }
  }

  // テストがサブクラス経由で呼ぶため protected（本番コードからは entity 階層内のみ）
  protected _collides(x: number, z: number): boolean {
    return (
      level_data[(x >> 3) + (z >> 3) * level_width] > 7 || // top left
      level_data[((x + 6) >> 3) + (z >> 3) * level_width] > 7 || // top right
      level_data[((x + 6) >> 3) + ((z + 4) >> 3) * level_width] > 7 || // bottom right
      level_data[(x >> 3) + ((z + 4) >> 3) * level_width] > 7 // bottom left
    )
  }

  // collision against static walls
  protected _did_collide(): void {}

  // collision against other entities
  _check(other: entity_t): void {}

  _receive_damage(from: entity_t, amount: number): void {
    this.h -= amount
    if (this.h <= 0) {
      this._kill()
    }
  }

  protected _kill(): void {
    if (!this._dead) {
      this._dead = true
      // 上の constructor と同じ理由でキャストが必要
      state.entities_to_kill.push(this as entity_t)
    }
  }

  _render(): void {
    const t = this
    push_sprite(t.x - 1, t.y, t.z, t.s)
  }
}
