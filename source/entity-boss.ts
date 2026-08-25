import { audio_play, audio_sfx_explode } from './audio'
import {
  boss_arm_angles, boss_bullet_speed, boss_centre, boss_fire_step, boss_hitbox,
  boss_hp, boss_phase, boss_phase_rage, boss_spin_rate, boss_volleys,
} from './boss-model'
import { boss_reward_show } from './boss-reward'
import { reward_any_available } from './boss-reward-model'
import { entity_t } from './entity'
import { entity_container_t } from './entity-container'
import { entity_explosion_t } from './entity-explosion'
import { spawn_particles } from './entity-particle'
import { entity_player_t } from './entity-player'
import { gear_roll_slot, gear_roll_tier } from './equipment'
import { meta } from './meta'
import { monologue_boss_kill } from './monologue'
import { camera, push_light, push_quad } from './renderer'
import { level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

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

  // 最大 HP。_init() が h に代入した値をそのまま覚える。フィールド初期化子は
  // 基底 constructor（_init() を含む）の後に走るので、この順で正しい
  // （entity_sentry_t._target_x = this.x と同じ手）
  _hp_max = this.h
  // 現在のフェーズ。1 = 前半、2 = 激昂
  private _phase = 1

  // 掃引した総角度。常に増える。発射はこれで刻むので、回転の向きを含めない
  private _swept = 0

  // 座席。判定と絵が共有する中心の、生成時の位置（＝灰皿タイルの中心）。
  // 周回はここを原点にする。フィールド初期化子は基底 constructor の後に
  // 走るので this.x を読める（entity_sentry_t._target_x と同じ手）
  _home_x = this.x + boss_centre
  _home_z = this.z + boss_centre
  // 座席のタイル座標。灰皿は壁タイルとして立っているので、免除しないと
  // 生まれた瞬間から壁の中にいることになる。非常口も同じタイル値（8）を
  // 持つのでタイル値では区別できず、位置で覚える
  _home_tx = (this.x + boss_centre) >> 3
  _home_tz = (this.z + boss_centre) >> 3

  protected override _init(): void {
    this.h = boss_hp(state.depth)
    this.w = boss_hitbox
  }

  override _update(): void {
    const t = this
    const swept_before = t._swept
    t._swept += boss_spin_rate(t._phase) * state.time_elapsed
    // 砲塔の向き。フレームを跨いで持つ状態は _swept だけで足りる
    const facing = t._swept * t._spin

    const volleys = boss_volleys(swept_before, t._swept, boss_fire_step(t._phase))
    for (let v = 0; v < volleys; v++) {
      for (const angle of boss_arm_angles(facing, t._arms)) {
        t._spawn_bullet(angle)
      }
    }

    // 基底の _update() は呼ばない。動かないので積分が要らないうえ、
    // 灰皿タイルは壁なので毎フレーム _collides() が真になる
  }

  // 判定と絵が共有する中心から、銃口の半径だけ離して 1 発出す。
  // 中から出すと、生まれた次のフレームで _collides() が壁を返して弾が
  // 即座に消える。弾の判定は 6×4 なので、タイルから抜けるには x で 7・
  // z で 6 の余裕が要る。半径 10 なら最悪の角度（斜め 45°）でも成分が
  // 7.07 になり、必ずどちらかの軸で抜ける
  private _spawn_bullet(angle: number): void {
    const t = this
    const mx = t.x + boss_centre + Math.cos(angle) * boss_muzzle
    const mz = t.z + boss_centre + Math.sin(angle) * boss_muzzle
    // 弾の y は 0。ビュー行列は 45° 傾いているので y は画面上で奥行きに
    // 化け、砲口の高さ（14）に出すと絵が当たり判定（x/z のみ）から
    // 1 タイルぶんずれる。弾を避け続ける戦いなので、砲口の高さより
    // 絵と判定の一致を取る（自機も他の弾もすべて y = 0）
    const bullet = new entity_boss_plasma_t(mx - 3, 0, mz - 2, 0, boss_bullet_tile)
    const speed = boss_bullet_speed(t._phase)
    bullet.vx = Math.cos(angle) * speed
    bullet.vz = Math.sin(angle) * speed
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

  // 判定 14×14 が覆うタイル範囲を走査する。基底の実装は x・x+6・z・z+4 の
  // 四隅を見る 6×4 固定で this.w を読まないため、ボスには使えない。
  // 四隅だけを見る形にもできない — 14px は最大 3 タイル列にまたがるので、
  // 真ん中の列にある壁を見落とす
  protected override _collides(x: number, z: number): boolean {
    const t = this
    const tx1 = (x + t.w) >> 3
    const tz1 = (z + t.w) >> 3
    for (let tz = z >> 3; tz <= tz1; tz++) {
      for (let tx = x >> 3; tx <= tx1; tx++) {
        if (tx === t._home_tx && tz === t._home_tz) { continue }
        if (level_data[tx + tz * level_width] > 7) { return true }
      }
    }
    return false
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
    // 単発だと蜘蛛・セントリー・清掃ドローンの撃破と同じ音になり、シェイク 8
    // （ラン最大）に音が追いつかない。新しい音色は増やさず、既存の explode を
    // 時間差で 3 発重ねて連続爆発に聞かせる。0.09 秒刻みはアタック＋サステイン
    // （約 32ms）より十分後ろに置いて前の打鍵と分離させつつ、リリース
    // （約 0.5 秒）の中に収めて重なりを保つ間隔
    audio_play(audio_sfx_explode)
    audio_play(audio_sfx_explode, false, 0.09)
    audio_play(audio_sfx_explode, false, 0.18)

    // 事実はターミナルが即時に、感情は 2 秒遅れて高木が言う（docs/story.md「声の使い分け」）
    terminal_show_notice('灰皿撤去ユニットの応答が途絶___区画の封鎖を解除')
    monologue_boss_kill()

    drop_container(cx, cz)

    if (reward_any_available(meta.levels, state.boss_levels)) {
      boss_reward_show()
    } else {
      // 6 本すべてが上限。まだ意味が残っている報酬は装備の段だけなので、
      // コンテナをもう 1 個落とす
      drop_container(cx + 10, cz)
    }
  }
}

export class entity_boss_plasma_t extends entity_t {
  // 速度は生成側（entity_boss_t._spawn_bullet）が vx/vz に直接代入する。
  // フェーズで弾速が変わるので、_init() の引数 1 本では足りない

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
