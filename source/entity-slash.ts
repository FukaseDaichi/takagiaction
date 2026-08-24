import { entity_t } from './entity'
import { push_light, push_quad, push_sprite } from './renderer'
import {
  slash_duration, slash_head_angle, slash_head_time, slash_quads,
} from './slash-model'
import { state } from './state'

// 薙ぎの弧。物理も衝突も持たない絵だけのエンティティで、判定は振った瞬間に
// entity-player の _swing() が済ませている。形は slash-model.ts が持つ

// 腰の高さ。床（y=0）に置くと床の板と z-fight する
const slash_y = 3

// 光は帯の中ほどに置く。刃先側だけが等級色に染まり、後端は環境光の青に
// 沈むので、明暗の勾配が「振り抜いた向き」を語る
const slash_light_y = 6
const slash_light_radius = 0.7

// 1 振り 1 灯だけ。max_lights は 16 で、フロアの灯りと自機の灯りが先に
// 積まれるため、薙ぎが複数灯を取るとレベル側の光が落ちる
const slash_light_falloff = 0.09
const slash_light_gain = 2.2

export class entity_slash_t extends entity_t {
  _angle = 0
  _arc = 0
  _reach = 0
  // 1 振りごとに反転する掃引の向き（±1）
  _dir = 1
  // 刃の等級色（equipment.ts の gear_lights）。レア度が振りの光で読める
  _tint: readonly [number, number, number] = [1, 1, 1]

  private _age = 0

  override _update(): void {
    this._age += state.time_elapsed
    if (this._age > slash_duration) { this._kill() }
  }

  override _render(): void {
    const t = this
    for (const q of slash_quads(t._angle, t._arc, t._reach, t._dir, t._age)) {
      push_quad(
        t.x + q.ax, slash_y, t.z + q.az,
        t.x + q.bx, slash_y, t.z + q.bz,
        t.x + q.cx, slash_y, t.z + q.cz,
        t.x + q.dx, slash_y, t.z + q.dz,
        0, 1, 0, q.tile,
      )
    }

    const head = slash_head_angle(t._angle, t._arc, t._dir, t._age)
    const cos = Math.cos(head)
    const sin = Math.sin(head)
    // 切っ先の点。射程が 9.6px しかない最低段では帯がごく小さいので、
    // 6px のスプライト 1 枚があるかないかで「振った」が読めるかが変わる。
    // 渡り切ったら消して、残光だけにする
    if (t._age < slash_head_time) {
      push_sprite(t.x + cos * t._reach - 1, slash_y, t.z + sin * t._reach, t.s)
    }
    push_light(
      t.x + cos * t._reach * slash_light_radius,
      slash_light_y,
      t.z + sin * t._reach * slash_light_radius,
      t._tint[0] * slash_light_gain,
      t._tint[1] * slash_light_gain,
      t._tint[2] * slash_light_gain,
      slash_light_falloff,
    )
  }
}

// entity_t のコンストラクタは init_param を 1 つしか取らず、サブクラスの
// フィールドは基底コンストラクタの後に define されるため _init() では書けない
// （docs/architecture.md）。spawn_particles と同じ形で、生成後に代入する
export function spawn_slash(
  x: number, z: number,
  angle: number, arc: number, reach: number, dir: number,
  tint: readonly [number, number, number],
): entity_slash_t {
  const slash = new entity_slash_t(x, 0, z, 0, 26)
  slash._angle = angle
  slash._arc = arc
  slash._reach = reach
  slash._dir = dir
  slash._tint = tint
  return slash
}
