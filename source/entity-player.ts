import {
  audio_music_death, audio_play, audio_sfx_beep, audio_sfx_hit, audio_sfx_hurt,
  audio_sfx_pickup, audio_sfx_shoot, audio_sfx_swing,
} from './audio'
import { boss_centre } from './boss-model'
import { death_cause_nicotine } from './death-screen-model'
import { entity_t } from './entity'
import { entity_boss_t } from './entity-boss'
import { entity_drone_t } from './entity-drone'
import { spawn_particles } from './entity-particle'
import { entity_plasma_t } from './entity-plasma'
import { entity_sentry_t } from './entity-sentry'
import { spawn_slash } from './entity-slash'
import { entity_spider_t } from './entity-spider'
import {
  blade_arc, blade_damage, blade_interval, blade_oneshot_all, blade_oneshot_drone,
  blade_oneshot_level, blade_reach, gear_grade, gear_grades, gear_lights,
  sole_speed_bonus,
} from './equipment'
import { key_down, key_left, key_right, key_shoot, key_spare, key_swap, key_up, keys } from './input'
import { meta, meta_power_factor, meta_speed_factor } from './meta'
import { monologue_death } from './monologue'
import {
  nicotine_stage, player_light_falloff, player_speed, shot_interval, shot_spread,
  swing_interval,
} from './nicotine'
import { camera, push_light } from './renderer'
import { screen_slash } from './screen-slash'
import { state } from './state'
import { terminal_show_notice } from './terminal'

// 振りの踏み込み量。摩擦 5 なので 1 振りで約 5px 前に出る。姿勢の表現と、
// 敵のノックバック（from.vx）の両方をこの 1 つが担う
const swing_lunge = 26

// 弧の中心。判定は原点同士（e.x - t.x）の比較で、敵味方の当たり箱が同じ
// 大きさなので実質は中心同士の比較になる。絵もそれに合わせて当たり箱
// （6x4）の真ん中へ置く
const swing_center_x = 3
const swing_center_z = 2

export class entity_player_t extends entity_t {
  // minimap.ts が自機の向きを 1px で描くために読む
  _angle = Math.PI / 2 // face towards the viewer

  private _bob = 0
  private _frame = 0
  private _swing_dir = 1
  private _last_shot = 0
  private _last_damage = 0

  // _init() は持たない。元の実装は上記フィールドの初期化だけをしていた

  override _update(): void {
    const t = this
    // 死体。入力も物理も止めて、game_tick が y（ドローンの持ち上げ）を書くのに
    // 任せる。基底の _update() を呼ぶと bobbing で書いた y の残差を積分し続けて
    // しまうので、ここで完全に止める。
    // dying だけでなく game_running も見るのは、死体が消えるのは次の load_level()
    // で、リザルト表示中も同じ死体がループに残るため（docs/gameplay.md「死体は
    // 何にも触れない」と同じゲート）。dying を落として run_end() を呼ぶのは同じ
    // フレームなので、game_running を見ないと死体はその場で立ち上がり、リザルトの
    // 裏で歩いて撃てる（発射音と、刃物の決めなら #ds より上に重なる #sl が出る）。
    // この間はエッジ検出のフラグ（E / Tab）も消費されないので、死亡画面が抜ける
    // ときに戻す（death-screen.ts の descend()）
    if (state.dying || !state.game_running) {
      t.ax = t.az = 0
      t.vx = t.vz = 0
      return
    }
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    const smoking = state.smoking === 1
    // 一服中は移動も射撃もできない。無敵にはしない
    const speed = smoking
      ? 0
      : player_speed(stage, meta_speed_factor(), sole_speed_bonus(meta.gear.sole))

    // movement
    t.ax = keys[key_left] ? -speed : keys[key_right] ? speed : 0
    t.az = keys[key_up] ? -speed : keys[key_down] ? speed : 0

    // 一服中は加速度を切るだけでは足りない。基底の _update() が既存の vx / vz を
    // 積分し続けるので、走り込んで触れると摩擦で減速しながら約 4.7px 滑る。
    // エンティティ同士の重なり判定は 9px しかないため、接線方向に滑ると接触が
    // 外れて一服が勝手に中断する。速度そのものを落とす。
    if (smoking) { t.vx = t.vz = 0 }

    // rotation - face the direction of movement, hold still while shooting
    if (!keys[key_shoot] && (t.ax || t.az)) {
      t._angle = Math.atan2(t.az, t.ax)
    }
    t.s = (18 + (((t._angle / Math.PI) * 4 + 10.5) % 8)) | 0

    // bobbing
    t._bob += state.time_elapsed * 1.75 * (Math.abs(t.vx) + Math.abs(t.vz))
    t.y = Math.sin(t._bob) * 0.25

    t._last_damage -= state.time_elapsed
    t._last_shot -= state.time_elapsed

    // 予備の一本: E で 50% 回復。エッジ検出は input.ts と対で、処理したら 0 へ戻す。
    // こっそり浅く吸うだけなので感知器は作動せず（非常口は開かない）、回復も半分止まり。
    // リザルト表示中は上の死体のガードでここまで来ない（terminal_show_notice が
    // 表示中のリザルトの表示チェーンを壊すため、来てはいけない）
    if (keys[key_spare]) {
      keys[key_spare] = 0
      if (!smoking && state.spares_left > 0) {
        state.spares_left--
        state.smoke_count++
        state.nicotine = Math.min(
          state.nicotine_max, state.nicotine + state.nicotine_max * 0.5,
        )
        audio_play(audio_sfx_pickup)
        terminal_show_notice('隠れて一服した（残り ' + state.spares_left + ' 本）')
      }
    }

    // 持ち替え: Tab。刃物を 1 本も持っていないときは持ち替える先が無いので
    // 無視する。死亡画面も Tab を項目切替に使うが、リザルト表示中は上の死体の
    // ガードでここまで来ないので、同じキーが 2 つの意味で同時に効くことはない
    if (keys[key_swap]) {
      keys[key_swap] = 0
      if (meta.gear.blade > 0) {
        state.melee_active = state.melee_active ? 0 : 1
        audio_play(audio_sfx_beep)
      }
    }

    if (!smoking && keys[key_shoot] && t._last_shot < 0) {
      if (state.melee_active) {
        t._swing()
        t._last_shot = swing_interval(stage, blade_interval(meta.gear.blade))
      } else {
        audio_play(audio_sfx_shoot)
        // 元の実装の -0.11..+0.09 と同じ非対称さを保ったまま幅だけ広げる
        const spread = shot_spread(stage)
        new entity_plasma_t(
          t.x, 0, t.z, 0, 26,
          t._angle + Math.random() * spread - spread * 0.55,
        )
        t._last_shot = shot_interval(stage, meta_power_factor())
      }
    }

    super._update()
  }

  override _render(): void {
    this._frame++
    // 死体は点滅させない（致命打の直後は被弾点滅の 2 秒が残っている）。
    // dying だけでなく game_running も見るのは _update() と同じゲートで、死体は
    // 次の load_level() まで残るため。しかもその _update() が止まることで
    // _last_damage が減らなくなるので、被弾死の 2 秒は時間で解けずリザルト表示中
    // ずっと凍結する。dying だけを見ると死体は最後まで点滅し続ける
    if (
      state.dying || !state.game_running ||
      this._last_damage < 0 || this._frame % 6 < 4
    ) {
      super._render()
    }
    // 視界は falloff で縮める。RGB を下げても暖色が減って青く沈むだけで、
    // 見える範囲はフラグメントシェーダの霧と環境光が決めている
    const stage = nicotine_stage(state.nicotine, state.nicotine_max)
    push_light(this.x, 4, this.z + 6, 1, 0.5, 0, player_light_falloff(stage))
  }

  // 薙ぎ。振るたびに敵を 1 周する。敵は最大 100 体で振り間隔は 0.3〜0.9 秒
  // あるので、O(n) の走査は問題にならない
  private _swing(): void {
    const t = this
    const tier = meta.gear.blade
    const reach = blade_reach(tier)
    const arc = blade_arc(tier)
    const oneshot = blade_oneshot_level(tier)
    const grade = gear_grade(tier)

    // 1 振りごとに掃引の向きを反転させる。右薙ぎ→左薙ぎと交互になることで、
    // 連打が「同じ判子を押し続ける」ではなく「振り続けている」に見える
    t._swing_dir = -t._swing_dir

    // 踏み込み。判定より前に足すのが要点で、敵はノックバックを from.vx から
    // 読むため（entity-spider.ts ほか）、これが無いと立ち止まって振ったときに
    // 速度 0 が入り、斬った相手がその場で固定される
    t.vx += Math.cos(t._angle) * swing_lunge
    t.vz += Math.sin(t._angle) * swing_lunge

    let hit = false
    let finisher = false
    for (const e of state.entities) {
      if (e._dead) { continue }
      const spider = e instanceof entity_spider_t
      const drone = e instanceof entity_drone_t
      const sentry = e instanceof entity_sentry_t
      const boss = e instanceof entity_boss_t
      if (!spider && !drone && !sentry && !boss) { continue }

      // 中心（entity.x/z + w/2）の差で測る。原点の差のままだと w が等しい
      // 相手（蜘蛛・清掃ドローン・セントリーはすべて既定の 9）では中心の差と
      // 一致するので変わらないが、w が違うボス（14）だと中心が原点からずれる
      // ぶんだけ、近づく向きによって実際の距離を過大／過小評価してしまう
      const dx = (e.x + e.w / 2) - (t.x + t.w / 2)
      const dz = (e.z + e.w / 2) - (t.z + t.w / 2)
      if (dx * dx + dz * dz > reach * reach) { continue }

      // 角度差を -π..π に畳んでから半角と比べる（生の引き算だと 2π を
      // またぐ位置で符号が反転して、真正面が範囲外になる）
      const raw = Math.atan2(dz, dx) - t._angle
      if (Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw))) > arc) { continue }

      // ボスはどの項にも現れない。刃物 Lv9 以上の「硬さを無視して一撃で
      // 落とす」がボスに効くと、耐久で作った戦いが丸ごと消える。通常の
      // blade_damage() は通すので、刃物ビルドが締め出されることはない
      const kills =
        spider ||
        (drone && oneshot >= blade_oneshot_drone) ||
        (sentry && oneshot >= blade_oneshot_all)
      // 一撃必殺に専用の即死経路を作らない。3 体すべてに実装が要るうえ、
      // _kill() の中のドロップ処理（ヤニ 50%、コンテナ 30%、カメラシェイク、
      // 爆発）を通らなくなる
      e._receive_damage(t, kills ? 999 : blade_damage(tier))
      hit = true
      // 刃は弾より派手に散らす。敵側の 3〜5 個に上乗せする（数を抑えるのは
      // パーティクルが寿命 3 秒のエンティティで、二次の衝突ループに乗るため）。
      // entity.x/z が中心から + w/2 だけずれているのは全員共通（上の reach 判定
      // と同じ）。ボスは既定の w=9（半分 4.5）より大きい w=14（半分 7 =
      // boss_centre）で、_render() など他の場所もすでにその中心を使っているため、
      // ここも合わせて補正する。蜘蛛・清掃ドローン・セントリーは角のまま
      // （4.5 ぶん動かす変更にはしない）
      const px = boss ? e.x + boss_centre : e.x
      const pz = boss ? e.z + boss_centre : e.z
      spawn_particles(px, pz, 4)
      // 決めは清掃ドローンとセントリーに絞る。蜘蛛は全段が一撃で落とすので
      // （docs/equipment.md）、雑魚で出すと光りっぱなしになる
      if (kills && !spider) { finisher = true }
    }

    // 空振り＝風切りだけ、当たり＝風切り＋当たり、撃破＝さらに撃破音。
    // この 3 段が耳だけで読めることが要件。無条件に当たり音を鳴らすと、耳が
    // 常に「当たった」と言い続け、唯一重要な情報を運ばなくなる
    audio_play(audio_sfx_swing)
    if (hit) { audio_play(audio_sfx_hit) }
    if (finisher) { screen_slash(gear_grades[grade].color) }

    spawn_slash(
      t.x + swing_center_x, t.z + swing_center_z,
      t._angle, arc, reach, t._swing_dir, gear_lights[grade],
    )
  }

  // 死＝死亡シーケンスの開始（docs/gameplay.md「死亡シーケンス」）。
  // super._kill() は呼ばない — _dead にするとフレーム末尾でエンティティから
  // 除去されて死体が消える。run_end() は game_tick が 3 秒後に呼ぶ。
  // 一度死んだらもう死なない: state.dying が二重呼び出しを遮断し（二重に走ると
  // 姿勢がもう一段跳ねる）、game_running がリザルト表示中の再開を止める。
  // 死体は load_level まで残るので、止めないと敵に押されるたびシーケンスが
  // 走り直し、表示中のリザルトに通知と BGM の落としが割り込む
  protected override _kill(): void {
    if (state.dying || !state.game_running) { return }
    state.dying = 1
    state.death_elapsed = 0
    this.y = 10
    this.z += 5
    camera.shake = 5 // 倒れた衝撃の一発。以降は 0.9/frame の減衰に任せる
    audio_music_death()
    monologue_death(state.death_cause)
  }

  override _receive_damage(from: entity_t, amount: number): void {
    // 死体は傷つかない（敵が乗ってきても hurt 音を鳴らさない）。シーケンス中も
    // リザルト表示中も、死体が消えるのは次のフロアを読み込むときだけ
    if (state.dying || !state.game_running) { return }
    if (this._last_damage < 0) {
      audio_play(audio_sfx_hurt)
      super._receive_damage(from, amount)
      this._last_damage = 2
    }
  }

  // ニコチン切れ（ゲージ 0%）の継続ダメージ。被弾ではないので
  // _receive_damage() の 2 秒の無敵を通さない。通してしまうと
  // 2 秒ごとのダメージが無敵とちょうど拮抗して不規則になる。
  _receive_withdrawal_damage(): void {
    audio_play(audio_sfx_hurt)
    this.h -= 1
    if (this.h <= 0) {
      // 死因の記録は _kill() より前。run_end() がこの値を死亡画面に渡す
      state.death_cause = death_cause_nicotine
      this._kill()
    }
  }
}
