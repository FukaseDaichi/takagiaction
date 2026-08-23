import {
  boss_arm_angles, boss_bullet_speed, boss_hp, boss_spin_rate, boss_volleys,
} from './boss-model'
import { entity_t } from './entity'
import { spawn_particles } from './entity-particle'
import { entity_player_t } from './entity-player'
import { camera, push_light, push_quad } from './renderer'
import { state } from './state'

// 灰皿撤去ユニット。深度が 5 の倍数のフロアで、中央の灰皿の上に居座る。
// 倒すまで一服できない（entity-smoking-area.ts が state.boss_alive を見る）。
//
// 砲口が等角に並んだまま全体が回り、掃引が一定角度進むごとに全砲口から
// 1 発ずつ吐く。回転しているので柱の陰（安全地帯）も一緒に回り、自機は
// ボスの周りを同じ向きに回り続けることになる。回りながら撃ち返す形は
// docs/gameplay.md「操作」の後退射撃そのもので、膠着が構造的に起きない。

// 見た目の一辺（ワールド単位）。通常スプライトの 2 倍。push_sprite() は
// 6 固定で拡大できないので、entity-slash.ts と同じく push_quad() を直に呼ぶ
const boss_size = 12
// 灰皿ブロック（高さ 8）の上に立たせる。全高 20 になり、「灰皿に座り込んだ
// 大型機」が一目で読める。衝突判定は x/z だけなので、この高さは見た目専用
const boss_base_y = 8
// 当たり判定の一辺。見た目だけ大きくして既定の 9 のまま残すと、輪郭に
// 撃った弾がすり抜ける
const boss_hitbox = 14
// 銃口の半径。灰皿タイル（8×8）の中心から測る。中から出すと、生まれた次の
// フレームで _collides() が壁を返して弾が即座に消える。弾の判定は 6×4 なので、
// タイルから抜けるには x で 7・z で 6 の余裕が要る。半径 10 なら最悪の角度
// （斜め 45°）でも成分が 7.07 になり、必ずどちらかの軸で抜ける
const boss_muzzle = 10
const boss_bullet_tile = 46

export class entity_boss_t extends entity_t {
  // 生成側が代入する — _init() には基底クラスのフィールドしか書けない
  // （entity-container.ts の _slot と同じ理由）
  _spin = 1
  _arms = 2

  // 掃引した総角度。常に増える。発射はこれで刻むので、回転の向きを含めない
  private _swept = 0
  private _angle = 0

  protected override _init(): void {
    this.h = boss_hp(state.depth)
    this.w = boss_hitbox
  }

  override _update(): void {
    const t = this
    const swept_before = t._swept
    t._swept += boss_spin_rate * state.time_elapsed
    t._angle = t._swept * t._spin

    const volleys = boss_volleys(swept_before, t._swept)
    for (let v = 0; v < volleys; v++) {
      for (const angle of boss_arm_angles(t._angle, t._arms)) {
        // 灰皿タイルの中心（t.x + 4）から銃口の半径だけ離して出す。
        // 弾の判定は 6×4 なので、その中心を銃口に合わせる
        const mx = t.x + 4 + Math.cos(angle) * boss_muzzle
        const mz = t.z + 4 + Math.sin(angle) * boss_muzzle
        new entity_boss_plasma_t(mx - 3, boss_base_y, mz - 2, 0, boss_bullet_tile, angle)
      }
    }

    // 基底の _update() は呼ばない。動かないので積分が要らないうえ、
    // 灰皿タイルは壁なので毎フレーム _collides() が真になる
  }

  override _render(): void {
    const t = this
    // push_sprite() の中身を、6 ではなく boss_size で組み直したもの
    const tilt = 3 + (camera.z + t.z) / 12
    const x = t.x - (boss_size - 6) / 2
    const y = boss_base_y
    push_quad(
      x, y + boss_size, t.z,
      x + boss_size, y + boss_size, t.z,
      x, y, t.z + tilt,
      x + boss_size, y, t.z + tilt,
      0, 0, 1, t.s,
    )
    // ライトを持つのは本体だけ。弾は full-bright で描くので光を要らない
    push_light(t.x + 3, y + 6, t.z + 6, 1.2, 0.4, 0.2, 0.05)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    // ノックバックを受けない。据え置きの砲台であることが被弾の反応で読める
    // （docs/enemies.md「被弾のノックバックは硬さの表現である」）
    spawn_particles(this, 3)
  }

  override _check(other: entity_t): void {
    // 灰皿に近づけない。生きている間は接触そのものが壁になる
    if (other instanceof entity_player_t) {
      other._receive_damage(this, 1)
    }
  }

  protected override _kill(): void {
    if (this._dead) { return } // 二重加算を防ぐ
    super._kill()
    state.kills++
    state.boss_alive = 0
  }
}

export class entity_boss_plasma_t extends entity_t {
  protected override _init(angle: number): void {
    this.vx = Math.cos(angle) * boss_bullet_speed
    this.vz = Math.sin(angle) * boss_bullet_speed
  }

  // ライトを積まない。同時に最大 26 発飛ぶので max_lights = 16 を超え、
  // 光る弾と光らない弾が混ざる。代わりにタイル 46 を full-bright 規則
  // （r>0.95 && g>0.25 && b==0）を満たす色で焼いてあり、ライトも霧も通さず
  // 全弾が等しく明るく見える（tools/boss_tiles.py）。弾幕は全部見えることが
  // 要件なので、これは妥協ではなく正しい経路

  // 撃破時にボスがまとめて消すための入口。_kill() は protected なので
  // 兄弟クラスからは呼べない
  _expire(): void {
    this._kill()
  }

  protected override _did_collide(): void {
    this._kill()
  }

  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) {
      other._receive_damage(this, 1)
      this._kill()
    }
  }
}
