import {
  audio_music_boss_rage, audio_music_normal, audio_play, audio_sfx_explode,
} from './audio'
import {
  boss_arm_angles, boss_bullet_speed, boss_centre, boss_fire_step, boss_hitbox,
  boss_homing_count, boss_homing_life, boss_homing_speed, boss_homing_spread,
  boss_homing_step, boss_homing_turn, boss_homing_turn_rate,
  boss_hp, boss_orbit_omega, boss_orbit_speed,
  boss_phase, boss_phase_rage, boss_pick_radius, boss_pick_speed_factor,
  boss_radius_step, boss_spin_rate, boss_volleys, boss_wander_interval,
  boss_wander_retry_min,
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
import { monologue_boss_kill, monologue_boss_rage } from './monologue'
import { camera, push_light, push_quad } from './renderer'
import { screen_flash } from './screen-flash'
import { level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

// 灰皿撤去ユニット。深度が 5 の倍数のフロアで、中央の灰皿の上に生まれる。
// 倒すまで一服できない（entity-smoking-area.ts が state.boss_alive を見る）。
//
// 据え置きではなく、床から低く浮いた機体である。浮いている高さは柱より
// 低いので、柱は依然として遮蔽として効く。この像が要るのは、灰皿ブロック
// （壁タイル）の上に居られることと、柱（壁タイル）は越えられないことを
// 同時に成立させる唯一の読み方だから。
//
// 砲口が等角に並んだまま全体が回り、掃引が一定角度進むごとに全砲口から
// 1 発ずつ吐く。加えて座席を中心に周回するので、柱の陰（安全地帯）は
// 「回る」だけでなく「動く」。自機は陰を追い続けることになり、回りながら
// 撃ち返す形は docs/gameplay.md「操作」の後退射撃そのもので、膠着が
// 構造的に起きない。

// 見た目の一辺（ワールド単位）。通常スプライトの 2 倍。push_sprite() は
// 6 固定で拡大できないので、entity-slash.ts と同じく push_quad() を直に呼ぶ
const boss_size = 12
// 本体の足元の高さ。灰皿ブロック（高さ 8）と同じ高さで浮くので、座席に
// 居るときは「灰皿に座り込んだ大型機」に、離れたときは「低く浮いて動く
// 大型機」に読める。衝突判定は x/z だけなのでこれは見た目専用の値
// （弾は y = 0 に出す。理由は _spawn_bullet()）
const boss_body_y = 8
// 銃口の半径。共有の中心から測る。中から出すと、生まれた次のフレームで
// _collides() が壁を返して弾が即座に消える。弾の判定は 6×4 なので、
// タイルから抜けるには x で 7・z で 6 の余裕が要る。半径 10 なら最悪の角度
// （斜め 45°）でも成分が 7.07 になり、必ずどちらかの軸で抜ける
const boss_muzzle = 10
const boss_bullet_tile = 46
const boss_homing_tile = 49
// 移行の瞬間に全方向へ一斉放出する本数。_arms に依らない固定値にする。
// 深度で変わると掃射の一部に見え、事件として読めない
const boss_shockwave_count = 12

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

  // 周回の目標。周回角と半径そのものは位置から毎フレーム導くので持たない。
  // 別に持つと、柱に塞がれて動けなかったフレームで持っている角と実際の
  // 位置がずれ、抜けた瞬間に飛ぶ
  private _radius_target = boss_pick_radius(Math.random())
  private _speed_factor = boss_pick_speed_factor(Math.random())
  private _wander_timer = boss_wander_interval

  protected override _init(): void {
    this.h = boss_hp(state.depth)
    this.w = boss_hitbox
  }

  override _update(): void {
    const t = this
    t._move()

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

    const homing = boss_volleys(swept_before, t._swept, boss_homing_step)
    for (let v = 0; v < homing; v++) { t._spawn_homing() }

    // 基底の _update() は呼ばない。加速度で動かさないので積分が要らず、
    // 壁は _move() が専用の _collides() で自分で見る
  }

  // 座席を中心に回りながら、目標半径へ寄る。柱には衝突して滑る
  private _move(): void {
    const t = this
    const dt = state.time_elapsed
    const speed = boss_orbit_speed(t._phase) * t._speed_factor

    t._wander_timer -= dt
    if (t._wander_timer <= 0) { t._repick(boss_wander_interval) }

    // 半径は生の値のまま渡す。ここで下限に丸めると、丸めた値が
    // boss_radius_step() の「現在地」になり、生成直後（半径 0）に
    // 下限まで 1 フレームで飛ぶ。下限保護は boss_orbit_omega() 自身が
    // 持つので、ここで重ねてクランプしない
    const dx = t.x + boss_centre - t._home_x
    const dz = t.z + boss_centre - t._home_z
    const radius = Math.sqrt(dx * dx + dz * dz)
    const angle = Math.atan2(dz, dx) +
      boss_orbit_omega(speed, radius) * t._spin * dt
    const next = boss_radius_step(radius, t._radius_target, speed, dt)

    const nx = t._home_x + Math.cos(angle) * next - boss_centre
    const nz = t._home_z + Math.sin(angle) * next - boss_centre

    // 全体が塞がれていても、x だけ / z だけなら通れることが多い。基底の
    // _update() と同じ滑りで、擦りながら回り込む動きがこれで出る
    if (!t._collides(nx, nz)) {
      t.x = nx
      t.z = nz
    } else if (!t._collides(nx, t.z)) {
      t.x = nx
    } else if (!t._collides(t.x, nz)) {
      t.z = nz
    } else {
      // どちらの軸でも通れない。専用の脱出挙動は作らず、目標を引き直して
      // 次のフレームに別の半径を試す
      t._repick(boss_wander_retry_min)
    }
  }

  private _repick(interval: number): void {
    const t = this
    t._radius_target = boss_pick_radius(Math.random())
    t._speed_factor = boss_pick_speed_factor(Math.random())
    t._wander_timer = interval
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

  // 自機の方向へ、左右へ開いて 2 発。掃射と同じ銃口の半径から出す
  // （中から出すと生まれた次のフレームで壁判定に消える）
  private _spawn_homing(): void {
    const t = this
    const player = state.entity_player
    if (!player) { return }
    const base = Math.atan2(
      player.z - (t.z + boss_centre), player.x - (t.x + boss_centre),
    )
    const speed = boss_homing_speed(t._phase)
    for (let i = 0; i < boss_homing_count; i++) {
      // 本数の中央を 0 にずらして左右対称に開く
      const angle = base +
        (i - (boss_homing_count - 1) / 2) * boss_homing_spread * 2
      const mx = t.x + boss_centre + Math.cos(angle) * boss_muzzle
      const mz = t.z + boss_centre + Math.sin(angle) * boss_muzzle
      const bullet = new entity_boss_homing_t(mx - 3, 0, mz - 2, 0, boss_homing_tile)
      bullet.vx = Math.cos(angle) * speed
      bullet.vz = Math.sin(angle) * speed
    }
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
    // 出すのは entity-sentry.ts の弾と同じ。
    // 激昂では赤く明るくする。HP バーを持たないので、これが「後半に入って
    // いる」ことの恒常的な印になる
    const rage = t._phase === boss_phase_rage
    push_light(
      x + half, y + half, z + half,
      rage ? 1.6 : 1.2, rage ? 0.2 : 0.4, rage ? 0.1 : 0.2, rage ? 0.04 : 0.05,
    )
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
    // ノックバックを受けない。浮いていても軽くはないことが被弾の反応で
    // 読める（docs/enemies.md「被弾のノックバックは硬さの表現である」）
    // 中心は entity.x/z から boss_centre ぶん離れている（_render() と同じ理由）
    spawn_particles(this.x + boss_centre, this.z + boss_centre, 3)

    // 撃破のフレームでは移行させない（_kill() が既に走っていて、移行の
    // シェイク 7 が撃破の 8 を上書きしてしまう）
    if (!this._dead && this._phase !== boss_phase_rage &&
        boss_phase(this.h, this._hp_max) === boss_phase_rage) {
      this._enter_rage()
    }
  }

  // 激昂へ移る。HP バーを持たないので、この 1 回の演出が「半分削った」の
  // 合図を兼ねる
  private _enter_rage(): void {
    const t = this
    t._phase = boss_phase_rage
    const cx = t.x + boss_centre
    const cz = t.z + boss_centre

    audio_music_boss_rage()
    screen_flash()
    // 序列は 蜘蛛 1 < セントリー 3 < 銘品 4 < 自機の死 5 < 清掃ドローン 6 <
    // フェーズ移行 7 < ボス撃破 8。揺れの大きさがそれ自体「何が起きたか」の
    // 合図なので、この 7 つは 1 つの尺度として一緒に見る（docs/enemies.md）
    camera.shake = 7
    spawn_particles(cx, cz, 16)

    for (let i = 0; i < boss_shockwave_count; i++) {
      t._spawn_bullet((i * Math.PI * 2) / boss_shockwave_count)
    }

    // 事実はターミナルが即時に、感情は 2 秒遅れて高木が言う（docs/story.md
    // 「声の使い分け」）。ボス自身は喋らない — 声は 2 つに保つ
    terminal_show_notice('灰皿撤去ユニット___出力制限を解除')
    monologue_boss_rage()
  }

  override _check(other: entity_t): void {
    // 触れば削られる。座席に居る間は灰皿へ詰めること自体が塞がれ、離れて
    // からは動く脅威になる
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
    // （docs/gameplay.md「一服」）、勝利の実感が濁る。
    // 追尾弾は entity_boss_plasma_t の派生なので、この 1 本の判定で
    // 掃射と一緒に拾える
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
    // 戦いが終わったので通常BGMへ戻す。報酬ダイアログは通常BGMの上で出る
    audio_music_normal()

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

  // ライトを積まない。同時に最大 40 発以上飛ぶので max_lights = 16 を超え、
  // 光る弾と光らない弾が混ざる。代わりにタイル 46 を full-bright 規則
  // （r>0.95 && g>0.25 && b==0）を満たす色で焼いてあり、ライトも霧も通さず
  // 全弾が等しく明るく見える（tools/boss_tiles.py）。弾幕は全部見えることが
  // 要件なので、これは妥協ではなく正しい経路。派生の追尾弾（タイル 49）
  // も別の full-bright 規則に乗るので同じ理由が当てはまる

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

// 追尾弾。掃射（entity_boss_plasma_t）の派生にしてあるのは、撃破時の
// 残弾掃除がその 1 本の instanceof で走っているため。壁で消える・接触で
// 1 ダメージという性質も共通で、素直に is-a である
export class entity_boss_homing_t extends entity_boss_plasma_t {
  private _life = boss_homing_life

  override _update(): void {
    const t = this
    t._life -= state.time_elapsed
    if (t._life <= 0) {
      // 掃射は直進なのでいずれ壁に届いて消えるが、追尾弾は自機を追って
      // 曲がり続けるため、開けた場所では壁に届かないまま溜まりうる。
      // O(n²) の衝突ループに乗る弾の数を抑える意味もある
      t._expire()
      return
    }
    const player = state.entity_player
    // 死体を追わない。死亡シーケンス中に弾が寄ってくると演出が濁る
    if (player && !state.dying) {
      const [vx, vz] = boss_homing_turn(
        t.vx, t.vz,
        player.x - t.x, player.z - t.z,
        boss_homing_turn_rate, state.time_elapsed,
      )
      t.vx = vx
      t.vz = vz
    }
    // 基底（entity_t）の _update() が積分と壁判定をやる。摩擦 0 なので
    // 速度はそのまま乗る
    super._update()
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
