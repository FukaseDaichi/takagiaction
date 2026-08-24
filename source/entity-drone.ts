import { audio_play, audio_sfx_explode } from './audio'
import { entity_t } from './entity'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { spawn_smoke } from './entity-smoke'
import { entity_yani_t } from './entity-yani'
import { monologue_drone_kill } from './monologue'
import { camera, push_light } from './renderer'
import { state } from './state'
import { terminal_show_notice } from './terminal'

// 追いかければ倒せるが、その時間はそのままニコチンの減少（game_tick の定常減少）
// なので、専用のゲージ消費コードは持たない。追うか見逃すかの判断だけを作る。
const drone_sight = 40 // この距離でプレイヤーに気づいて逃走に入る
const drone_release = 64 // ここまで離れると逃走をやめる（ヒステリシス）
const drone_flee_accel = 150 // 終端速度 30px/s。自機の通常歩行（25.6）より速く、
// 走っても追いつけない。倒すには射撃か壁際への追い込みが要る
const drone_wander_accel = 80

// 撃破報酬。ヤニ 30 個をばら撒き、1 個の価値は深度そのものなので合計は深度 × 30。
// 1/4 のフロアに 1 体しか湧かない一点物なので、床の散在（1〜3）や敵ドロップ
// （50% で 1）とは桁を変える。深度で増やすのを価値だけに絞って実体の数を固定
// するのは、深度 10 で 300 個になると拾得音が連射になって潰れることと、
// 300 個を歩いて回収する時間をニコチンの減少で払う形になるため
const drone_yani_count = 30

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
    spawn_particles(this.x, this.z, 3)
  }

  protected override _kill(): void {
    if (this._dead) { return } // 二重加算を防ぐ
    super._kill()
    state.kills++
    // 蜘蛛 1 / セントリー 3 / 自機の死 5 に対して、この破壊を最も大きく揺らす
    camera.shake = 6
    audio_play(audio_sfx_explode)

    // 機体が割れる。爆発光を 1 点に重ねると光が固まって「割れた」感が出ないので、
    // 機体の周囲 6px に 3 発ずらして置く
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      new entity_explosion_t(
        this.x + Math.cos(a) * 6, 0, this.z + Math.sin(a) * 6, 0, 26,
      )
    }
    spawn_particles(this.x, this.z, 24) // 被弾の 3 に対して、砕けた機体は桁を変える
    // 残骸の煙。壊れた機械の絵を 2 秒残す。横にずらすのは、同じ座標だと
    // 横揺れ（entity-smoke の Math.sin(y)）まで一致して 1 つにしか見えないため
    spawn_smoke(this.x - 3, this.z)
    spawn_smoke(this.x + 3, this.z)

    // 撃破報酬: 価値 = 深度のヤニを drone_yani_count 個。回収済みの分は床から
    // 消したものを同じ値で戻すだけなので、深度倍率を掛けず価値 1 で上乗せする
    const count = drone_yani_count + this._collected
    for (let i = 0; i < count; i++) {
      const yani = new entity_yani_t(this.x, 0, this.z, 5, 26)
      yani._value = i < drone_yani_count ? state.depth : 1
      // 等角に割り当ててからゆらぎを足す。完全な乱数だと 30 個では偏って
      // 団子になり、「回収槽が弾けた」形にならない
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
      // 摩擦 5 なので停止までの距離は 速度/5 = 8〜24px。歩いて拾い切れる円盤に散る
      const speed = 40 + Math.random() * 80
      yani.vx = Math.cos(angle) * speed
      yani.vz = Math.sin(angle) * speed
    }

    // HUD はヤニを常設表示しない（docs/gameplay.md「HUD は安全なときに黙る」）ので、
    // 深度で報酬が伸びたことがラン中に分かるのはこの通知だけ。事実はターミナルが、
    // 感情は 2 秒遅れで高木が言う（docs/story.md「声の使い分け」）
    const total = drone_yani_count * state.depth + this._collected
    terminal_show_notice('清掃ドローンの応答が途絶___回収物 ヤニ ' + total + ' が飛散')
    monologue_drone_kill()
  }

  override _render(): void {
    super._render()
    // 非武装の印に敵の赤ではなく寒色。暗いフロアでも見つけて追跡の判断ができる
    push_light(this.x, 2, this.z + 4, 0.2, 0.55, 0.6, 0.4)
  }
}
