import { audio_play, audio_sfx_explode } from './audio'
import { entity_t } from './entity'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { entity_yani_t } from './entity-yani'
import { camera, push_light } from './renderer'
import { state } from './state'

// 追いかければ倒せるが、その時間はそのままニコチンの減少（game_tick の定常減少）
// なので、専用のゲージ消費コードは持たない。追うか見逃すかの判断だけを作る。
const drone_sight = 40 // この距離でプレイヤーに気づいて逃走に入る
const drone_release = 64 // ここまで離れると逃走をやめる（ヒステリシス）
const drone_flee_accel = 150 // 終端速度 30px/s。自機の通常歩行（25.6）より速く、
// 走っても追いつけない。倒すには射撃か壁際への追い込みが要る
const drone_wander_accel = 80

// 清掃ドローン。吸い殻を回収して回る非武装ロボ。
export class entity_drone_t extends entity_t {
  private _animation_time = 0
  private _select_target_counter = 0
  private _panic_timer = 0 // 被弾後は視界の外でも逃げ続ける残り秒数
  private _fleeing = false
  private _collected = 0 // 回収した吸い殻。撃破時のばら撒きに上乗せされる
  private _target_x = this.x // 基底 constructor が this.x を設定した後に走る
  private _target_z = this.z

  protected override _init(): void {
    this.h = 10 // h は基底フィールドなので初期化子に潰されない
  }

  // entity-yani.ts が回収の接触時に呼ぶ
  _collect(): void {
    this._collected++
  }

  override _update(): void {
    const t = this
    const xd = t.x - state.entity_player!.x
    const zd = t.z - state.entity_player!.z
    const dist = Math.sqrt(xd * xd + zd * zd)

    t._panic_timer -= state.time_elapsed
    t._fleeing =
      t._panic_timer > 0 ||
      dist < drone_sight ||
      (t._fleeing && dist < drone_release)

    if (t._fleeing && dist > 0.1) {
      // プレイヤーの反対方向へ全力
      t.ax = (xd / dist) * drone_flee_accel
      t.az = (zd / dist) * drone_flee_accel
    } else {
      // 回収巡回: 最寄りの吸い殻へ。なければ近傍の乱数地点をうろつく
      t._select_target_counter -= state.time_elapsed
      if (
        t._select_target_counter < 0 ||
        (Math.abs(t._target_x - t.x) < 2 && Math.abs(t._target_z - t.z) < 2)
      ) {
        t._select_target_counter = 0.7
        t._select_target()
      }
      const txd = t._target_x - t.x
      const tzd = t._target_z - t.z
      t.ax = Math.abs(txd) > 2 ? (txd > 0 ? drone_wander_accel : -drone_wander_accel) : 0
      t.az = Math.abs(tzd) > 2 ? (tzd > 0 ? drone_wander_accel : -drone_wander_accel) : 0
    }

    super._update()
    this._animation_time += state.time_elapsed * (t._fleeing ? 2 : 1)
    this.s = 39 + (((this._animation_time * 5) | 0) % 3)
  }

  private _select_target(): void {
    let best: entity_t | null = null
    let best_d = Infinity
    for (const e of state.entities) {
      if (e instanceof entity_yani_t && !e._dead) {
        const d = (e.x - this.x) ** 2 + (e.z - this.z) ** 2
        if (d < best_d) {
          best_d = d
          best = e
        }
      }
    }
    if (best) {
      this._target_x = best.x
      this._target_z = best.z
    } else {
      this._target_x = this.x + (Math.random() - 0.5) * 64
      this._target_z = this.z + (Math.random() - 0.5) * 64
    }
  }

  protected override _did_collide(): void {
    // 壁に当たったまま押し続けないよう、次の更新で目的地を引き直す
    this._select_target_counter = 0
  }

  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    this.vx = from.vx * 0.3
    this.vz = from.vz * 0.3
    this._panic_timer = 2
    spawn_particles(this, 3)
  }

  protected override _kill(): void {
    if (this._dead) { return } // 二重加算を防ぐ
    super._kill()
    state.kills++
    new entity_explosion_t(this.x, 0, this.z, 0, 26)
    camera.shake = 2
    audio_play(audio_sfx_explode)
    // 撃破報酬: ヤニ 5〜10 個 + 回収済みの分を速度付きでまき散らす
    const count = 5 + ((Math.random() * 6) | 0) + this._collected
    for (let i = 0; i < count; i++) {
      const yani = new entity_yani_t(this.x, 0, this.z, 5, 26)
      const angle = Math.random() * Math.PI * 2
      const speed = 24 + Math.random() * 40
      yani.vx = Math.cos(angle) * speed
      yani.vz = Math.sin(angle) * speed
    }
  }

  override _render(): void {
    super._render()
    // 非武装の印に敵の赤ではなく寒色。暗いフロアでも見つけて追跡の判断ができる
    push_light(this.x, 2, this.z + 4, 0.2, 0.55, 0.6, 0.4)
  }
}
