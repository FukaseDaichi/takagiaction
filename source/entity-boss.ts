import { audio_play, audio_sfx_explode } from './audio'
import {
  boss_arm_angles, boss_bullet_speed, boss_hp, boss_spin_rate, boss_volleys,
} from './boss-model'
import { entity_t } from './entity'
import { entity_container_t } from './entity-container'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { entity_player_t } from './entity-player'
import { gear_roll_slot, gear_roll_tier } from './equipment'
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
// 本体の足元の高さ。灰皿ブロック（高さ 8）の上に立つので全高 20 になり、
// 「灰皿に座り込んだ大型機」が一目で読める。衝突判定は x/z だけなので
// これは見た目専用の値（弾は y = 0 に出す。理由は _update()）
const boss_body_y = 8
// 当たり判定の一辺。見た目だけ大きくして既定の 9 のまま残すと、輪郭に
// 撃った弾がすり抜ける
const boss_hitbox = 14
// 判定・絵・銃口が共有する中心の、entity.x/z からの距離。game.ts の AABB は
// [x, x+w] なので、中心は半辺のところにある。3 つが別々の中心を持つと
// 「絵の左上に撃った弾がすり抜け、右下の素の床で当たる」ことになり、
// w を広げた意味が消える
export const boss_centre = boss_hitbox / 2
// 生成位置の補正。上の中心を灰皿タイル（8×8）の中心 = tile * 8 + 4 に重ねる
// ための戻し量で、game.ts が生成時に足す
export const boss_spawn_offset = 4 - boss_centre
// 銃口の半径。共有の中心から測る。中から出すと、生まれた次のフレームで
// _collides() が壁を返して弾が即座に消える。弾の判定は 6×4 なので、
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

  protected override _init(): void {
    this.h = boss_hp(state.depth)
    this.w = boss_hitbox
  }

  override _update(): void {
    const t = this
    const swept_before = t._swept
    t._swept += boss_spin_rate * state.time_elapsed
    // 砲塔の向き。フレームを跨いで持つ状態は _swept だけで足りる
    const facing = t._swept * t._spin

    const volleys = boss_volleys(swept_before, t._swept)
    for (let v = 0; v < volleys; v++) {
      for (const angle of boss_arm_angles(facing, t._arms)) {
        // 判定と絵が共有する中心から、銃口の半径だけ離して出す。
        // 弾の判定は 6×4 なので、その中心を銃口に合わせる
        const mx = t.x + boss_centre + Math.cos(angle) * boss_muzzle
        const mz = t.z + boss_centre + Math.sin(angle) * boss_muzzle
        // 弾の y は 0。ビュー行列は 45° 傾いているので y は画面上で奥行きに
        // 化け、砲口の高さ（14）に出すと絵が当たり判定（x/z のみ）から
        // 1 タイルぶんずれる。弾を避け続ける戦いなので、砲口の高さより
        // 絵と判定の一致を取る（自機も他の弾もすべて y = 0）
        new entity_boss_plasma_t(mx - 3, 0, mz - 2, 0, boss_bullet_tile, angle)
      }
    }

    // 基底の _update() は呼ばない。動かないので積分が要らないうえ、
    // 灰皿タイルは壁なので毎フレーム _collides() が真になる
  }

  override _render(): void {
    const t = this
    // push_sprite() の中身を、6 ではなく boss_size で組み直したもの。
    // 判定と同じ中心（灰皿タイルの中心）に立たせる
    const half = boss_size / 2
    const x = t.x + boss_centre - half
    const z = t.z + boss_centre
    const y = boss_body_y
    const tilt = 3 + (camera.z + z) / 12
    push_quad(
      x, y + boss_size, z,
      x + boss_size, y + boss_size, z,
      x, y, z + tilt,
      x + boss_size, y, z + tilt,
      0, 0, 1, t.s,
    )
    // ライトを持つのは本体だけ。弾は full-bright で描くので光を要らない。
    // 板の法線は +z なので、面と同じ奥行きに置くと拡散項（頂点シェーダの
    // dot(n, lp - p)）が 0 になって自分の光で照らせない。半身ぶん手前に
    // 出すのは entity-sentry.ts の弾と同じ
    push_light(x + half, y + half, z + half, 1.2, 0.4, 0.2, 0.05)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    super._receive_damage(from, amount)
    // ノックバックを受けない。据え置きの砲台であることが被弾の反応で読める
    // （docs/enemies.md「被弾のノックバックは硬さの表現である」）
    // 中心は entity.x/z から boss_centre ぶん離れている（_render() と同じ理由）
    spawn_particles(this.x + boss_centre, this.z + boss_centre, 3)
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

    // 残弾を消す。消さないと、勝った直後に流れ弾で一服が中断され
    // （docs/gameplay.md「一服」）、勝利の実感が濁る
    for (const e of state.entities) {
      if (e instanceof entity_boss_plasma_t) { e._expire() }
    }

    // 中心は entity.x/z から boss_centre ぶん離れている（_render() と同じ理由）。
    // 撃破演出はラン中で最も大きくする。序列は 蜘蛛 1 < セントリー 3 <
    // 銘品 4 < 自機の死 5 < 清掃ドローン 6 < ボス 8 で、docs/enemies.md の
    // 1 本の尺度に載せる。爆発を 1 点に重ねると光が固まって「割れた」感が
    // 出ないので、機体の周囲にずらして 5 発置く（ドローンの 3 発と同じ理屈）
    const cx = this.x + boss_centre
    const cz = this.z + boss_centre
    for (const [dx, dz] of [[0, 0], [7, 4], [-7, -4], [0, 9], [0, -9]]) {
      new entity_explosion_t(cx + dx, 0, cz + dz, 0, 26)
    }
    spawn_particles(cx, cz, 32)
    camera.shake = 8
    audio_play(audio_sfx_explode)

    drop_container(cx, cz)
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

// 押収品コンテナを 1 個落とす。段は 2 回引いて高いほうを採る（best-of-2）。
// 段を底上げする専用テーブルを持たせると「段の抽選は深度で重み付けられる」
// （docs/equipment.md）が壊れる。best-of-2 なら重み付けの形はそのままで
// 期待値だけ上がるので、深く潜るほど良い装備という関係が保たれる
function drop_container(x: number, z: number): void {
  const container = new entity_container_t(x, 0, z, 5, 42)
  container._slot = gear_roll_slot(Math.random())
  container._tier = Math.max(
    gear_roll_tier(state.depth, Math.random()),
    gear_roll_tier(state.depth, Math.random()),
  )
}
