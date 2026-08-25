import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer は dom.ts 経由で document と canvas に触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  // フェーズ移行のライト色を検証するため引数を記録する。他のテストは
  // _render() を呼ばないので、この変更は他の describe には影響しない
  push_light: vi.fn(),
  push_quad: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
// audio は AudioContext をモジュール初期化時に生成するため同様
vi.mock('./audio', () => ({
  audio_play: () => {},
  audio_music_boss_rage: vi.fn(),
  audio_music_normal: vi.fn(),
  audio_sfx_shoot: undefined,
  audio_sfx_hit: undefined,
  audio_sfx_hurt: undefined,
  audio_sfx_beep: undefined,
  audio_sfx_pickup: undefined,
  audio_sfx_explode: undefined,
}))
vi.mock('./terminal', () => ({ terminal_show_notice: vi.fn() }))
vi.mock('./monologue', () => ({
  monologue_boss_kill: vi.fn(),
  monologue_boss_rage: vi.fn(),
  monologue_death: vi.fn(),
  monologue_drone_kill: vi.fn(),
}))
vi.mock('./screen-flash', () => ({ screen_flash: vi.fn() }))
vi.mock('./screen-slash', () => ({ screen_slash: () => {} }))
// 報酬ダイアログは DOM を組む
vi.mock('./boss-reward', () => ({ boss_reward_show: vi.fn() }))

import { audio_music_boss_rage, audio_music_normal } from './audio'
import {
  boss_bullet_speed, boss_centre, boss_hitbox, boss_homing_life,
  boss_homing_spread, boss_orbit_radius_max, boss_orbit_radius_min,
  boss_orbit_speed, boss_phase_rage, boss_spawn_offset,
} from './boss-model'
import { entity_boss_homing_t, entity_boss_plasma_t, entity_boss_t } from './entity-boss'
import { entity_player_t } from './entity-player'
import { monologue_boss_rage } from './monologue'
import { camera, push_light } from './renderer'
import { screen_flash } from './screen-flash'
import { level_data, level_width, state } from './state'
import { terminal_show_notice } from './terminal'

// タイル座標に壁（値 8）を立てる
function wall(tx: number, tz: number): void {
  level_data[tx + tz * level_width] = 8
}

// 座席タイル（tx, tz）の中心にボスを生成する。game.ts の生成位置の補正と同じ式
function spawn_boss(tx: number, tz: number): entity_boss_t {
  return new entity_boss_t(
    tx * 8 + boss_spawn_offset, 0, tz * 8 + boss_spawn_offset, 0, 45,
  )
}

// _collides は protected。テストはサブクラス経由で呼ぶ（既存の流儀）
class probe_boss_t extends entity_boss_t {
  collides_at(x: number, z: number): boolean {
    return this._collides(x, z)
  }
}

describe('ボスの壁判定', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.kills = 0
    state.boss_alive = 1
    state.boss_levels = []
    vi.clearAllMocks()
    const player = new entity_player_t(8, 0, 8, 5, 18)
    state.entity_player = player
  })

  it('座席（生成時に居た灰皿タイル）は壁でも通過できる', () => {
    wall(20, 20) // 灰皿タイル
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    expect(boss.collides_at(boss.x, boss.z)).toBe(false)
  })

  it('座席以外の壁タイルは通れない', () => {
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    wall(24, 20)
    // 判定の右端が 24 列に届く位置へ
    expect(boss.collides_at(24 * 8 - boss_hitbox + 1, 20 * 8)).toBe(true)
    // 1px 手前なら右端は 23 列に収まり、24 列には届かない
    // （entity.test.ts「右端の判定点が壁に入ると衝突する」と同じ、境界の両側を見る形）
    expect(boss.collides_at(24 * 8 - boss_hitbox - 1, 20 * 8)).toBe(false)
  })

  it('w を正しく使っても四隅だけの走査では中央のタイルを見落とす', () => {
    const boss = new probe_boss_t(
      20 * 8 + 4 - boss_centre, 0, 20 * 8 + 4 - boss_centre, 0, 45,
    )
    // 14px の判定を x = 8n+2, z = 8m+4 に置くと、タイル範囲は
    // 列 {n, n+1, n+2} × 行 {m, m+1, m+2} の 3×3 になる。四隅（w を正しく
    // this.w から取っても）が見るのは (n,m)・(n+2,m)・(n,m+2)・(n+2,m+2) の
    // 4 点だけで、中央のタイル (n+1, m+1) はどの隅にも当たらない。
    // タイル (31,31) はピクセル 248〜255、判定は x 242〜256・z 244〜258
    // なのでちゃんと重なる。四隅だけを見る実装は w を直しても見落とすので、
    // 全域を走査する実装だけが検出できる
    const n = 30
    const m = 30
    const x = n * 8 + 2
    const z = m * 8 + 4
    wall(n + 1, m + 1)
    expect(boss.collides_at(x, z)).toBe(true)
  })
})

describe('ボスの周回', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.boss_alive = 1
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  function radius(boss: entity_boss_t): number {
    const dx = boss.x + boss_centre - boss._home_x
    const dz = boss.z + boss_centre - boss._home_z
    return Math.sqrt(dx * dx + dz * dz)
  }

  // 座席から見た偏角。radius() と同じ中心を使う
  function angle(boss: entity_boss_t): number {
    return Math.atan2(
      boss.z + boss_centre - boss._home_z, boss.x + boss_centre - boss._home_x,
    )
  }

  it('毎フレーム位置が動く', () => {
    const boss = spawn_boss(20, 20)
    const x0 = boss.x
    const z0 = boss.z
    for (let i = 0; i < 30; i++) { boss._update() }
    expect(boss.x !== x0 || boss.z !== z0).toBe(true)
  })

  it('座席からの距離が目標半径の帯の中に収まる', () => {
    const boss = spawn_boss(20, 20)
    for (let i = 0; i < 60 * 30; i++) {
      boss._update()
      // 下限は「寄っていく途中」があるので 0 から許すが、上限は超えない
      expect(radius(boss)).toBeLessThanOrEqual(boss_orbit_radius_max + 1)
    }
  })

  it('十分な時間で座席から離れる（灰皿に居座り続けない）', () => {
    const boss = spawn_boss(20, 20)
    let max_r = 0
    for (let i = 0; i < 60 * 30; i++) {
      boss._update()
      max_r = Math.max(max_r, radius(boss))
    }
    expect(max_r).toBeGreaterThan(boss_orbit_radius_min)
  })

  // 半径だけを見る上のテストは、角速度を半径に依らない定数にしても
  // （周回せず座席から一直線に出入りするだけでも）通ってしまう。
  // ここでは実際の移動そのもの——接線方向の速さの上限と、偏角が単調に
  // 進むこと——を固定し、その 2 つの回帰を検出する
  it('線速度が一定に保たれ、周回角が単調に進む', () => {
    const boss = spawn_boss(20, 20)
    // 線速度の上限（速度係数の上限 1.3 を掛けた値）。周回角の変化量 Δθ と
    // 「更新前」の半径 r（更新後の next ではない）から接線方向の速さ
    // r * |Δθ| / dt を求めると、正しい実装では r >= 10 のとき厳密にこの
    // 上限に等しく（boss_orbit_omega が ω = v/r を返すため r*ω = v）、
    // r < 10 ではそれより小さい（下限で割るため）。座標の移動距離
    // （Math.hypot の差分）を「合成上限 1.12」のような近似係数で抑える
    // やり方だと、_move() が角度の計算に「更新後」の半径 next を使う関係で
    // r ≈ 10 付近では正しい実装でも近似式をわずかに超え、実測で約 3% の
    // 頻度で誤って赤くなった。この量なら近似ではなく等式で抑えられる
    const max_tangential = boss_orbit_speed(1) * 1.3
    let prev_angle = angle(boss)
    let prev_radius = radius(boss)
    let angle_advanced = false
    for (let i = 0; i < 60 * 5; i++) {
      boss._update()
      const a = angle(boss)
      let delta = a - prev_angle
      while (delta > Math.PI) { delta -= Math.PI * 2 }
      while (delta < -Math.PI) { delta += Math.PI * 2 }
      // 更新前の半径 prev_radius を使う（更新後の半径だと next 基準の
      // ずれが乗る）。浮動小数の丸め用に極小の余裕だけ足す
      const tangential_speed = prev_radius * Math.abs(delta) / state.time_elapsed
      expect(tangential_speed).toBeLessThanOrEqual(max_tangential + 1e-6)
      // _spin と同じ向きにしか進まない（逆行しない）。角速度 0 の回帰は
      // delta が常に 0 になるので、下の angle_advanced で検出する
      // （接線速度の上限だけでは ω = 0 を検出できない——半径方向だけの
      // 動きは常にこの上限の半分以下に収まるため）
      expect(delta * boss._spin).toBeGreaterThanOrEqual(0)
      if (delta !== 0) { angle_advanced = true }
      prev_angle = a
      prev_radius = radius(boss)
    }
    expect(angle_advanced).toBe(true)
  })

  it('壁に囲まれていても壁の中へ入らない', () => {
    // 座席の周りを壁で囲む。判定 14px はタイル 3 列ぶんあるので、静止位置
    // （半径 0）だけで座席の前後左右 1 タイルへ既にはみ出す。中心 1 タイル
    // だけ空けると静止位置自体が壁にめり込んでしまうため、はみ出す 3×3 を
    // まるごと空け、壁の輪はその外側 1 タイルに置く
    for (let tz = 18; tz <= 22; tz++) {
      for (let tx = 18; tx <= 22; tx++) {
        if (tx >= 19 && tx <= 21 && tz >= 19 && tz <= 21) { continue }
        wall(tx, tz)
      }
    }
    const boss = spawn_boss(20, 20)
    // フィールド初期化子で一度決まるだけで書き換わらない。ループの外で 1 回
    // 見れば足りる（毎回同じ結果になる値をループ内で見ても検出力が増えない）
    expect(boss._home_tx).toBe(20)
    for (let i = 0; i < 60 * 10; i++) {
      boss._update()
      // 座席タイル (20, 20) は元から床（壁にしていない）なので免除は要らない。
      // 判定が及ぶタイルはすべて素の床であるはず——壁の輪へ食い込んでいない
      const tx1 = (boss.x + boss.w) >> 3
      const tz1 = (boss.z + boss.w) >> 3
      for (let tz = boss.z >> 3; tz <= tz1; tz++) {
        for (let tx = boss.x >> 3; tx <= tx1; tx++) {
          expect(level_data[tx + tz * level_width]).toBeLessThan(8)
        }
      }
    }
  })
})

describe('追尾弾', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.boss_alive = 1
    state.boss_levels = []
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  function homing(): entity_boss_homing_t[] {
    return state.entities.filter(
      (e): e is entity_boss_homing_t => e instanceof entity_boss_homing_t && !e._dead,
    )
  }

  it('掃引が刻みをまたぐと 2 発出る', () => {
    const boss = spawn_boss(20, 20)
    // 掃引が boss_homing_step を越えるまで回す
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    expect(homing().length).toBe(2)
    // 2 発の進行方向の開きが boss_homing_spread のちょうど 2 倍（片側の
    // 偏角の合計）であることを固定する。式から `* 2` を落とす回帰が
    // 入ると、ここが半分の値になって赤くなる
    const [a, b] = homing()
    const angle_a = Math.atan2(a.vz, a.vx)
    const angle_b = Math.atan2(b.vz, b.vx)
    expect(angle_b - angle_a).toBeCloseTo(boss_homing_spread * 2, 6)
  })

  it('掃射よりずっと少ない頻度で出る', () => {
    const boss = spawn_boss(20, 20)
    for (let i = 0; i < 60 * 6; i++) { boss._update() }
    const sweep = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t && !(e instanceof entity_boss_homing_t),
    ).length
    // 単純な不等号だと boss_homing_step を boss_fire_step と同じ値に
    // 変えた回帰が「32 < 32」の同数ぎりぎりで検出されてしまう。4 倍しても
    // なお下回ることを見て、頻度差に余裕を持たせて固定する
    expect(homing().length * 4).toBeLessThan(sweep)
  })

  it('自機のほうへ曲がる', () => {
    const boss = spawn_boss(20, 20)
    // 自機を +z の遠方に置く。弾は生成時に自機方向を向くので、
    // ここでは自機を動かして「曲がる」ことを見る
    state.entity_player!.x = 20 * 8
    state.entity_player!.z = 20 * 8 + 200
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    const bullet = homing()[0]
    const before = bullet.vz
    // 初弾は生成時に自機方向（+z 側）を向くはず。自機は座席から見て
    // z が常に +196±70 の範囲にいるので、周回のどの位置で撃たれても
    // vz は必ず正になる（base が反転・0 になる回帰はここで負になり赤くなる）
    expect(before).toBeGreaterThan(0)
    const z0 = bullet.z
    // 自機を反対側へ動かす
    state.entity_player!.z = 20 * 8 - 200
    for (let i = 0; i < 30; i++) { bullet._update() }
    expect(bullet.vz).toBeLessThan(before)
    // 曲がるだけでなく実際に飛んでいることも見る。super._update() が
    // 抜けて積分が止まる回帰は、曲がっても位置が変わらず赤くならない
    expect(bullet.z).not.toBe(z0)
  })

  it('寿命で消える', () => {
    const boss = spawn_boss(20, 20)
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    const bullet = homing()[0]
    state.time_elapsed = boss_homing_life + 0.1
    bullet._update()
    expect(bullet._dead).toBe(true)
  })

  it('撃破で掃射と一緒に消える', () => {
    const boss = spawn_boss(20, 20)
    let guard = 0
    while (homing().length === 0 && guard++ < 60 * 60) { boss._update() }
    expect(homing().length).toBeGreaterThan(0)
    boss._receive_damage(boss, boss._hp_max)
    expect(homing().length).toBe(0)
  })
})

describe('フェーズ移行', () => {
  beforeEach(() => {
    level_data.fill(1)
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 1 / 60
    state.game_running = 1
    state.dying = 0
    state.depth = 5
    state.kills = 0
    state.boss_alive = 1
    state.boss_levels = []
    camera.shake = 0
    vi.clearAllMocks()
    state.entity_player = new entity_player_t(8, 0, 8, 5, 18)
  })

  it('HP 半分で閃光・シェイク 7・通知・セリフが 1 度ずつ走る', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2)

    expect(screen_flash).toHaveBeenCalledTimes(1)
    expect(camera.shake).toBe(7)
    expect(terminal_show_notice).toHaveBeenCalledTimes(1)
    // 呼び出し回数だけだと文言が自由に drift する。移行の通知文だけ固定する
    // （撃破の通知は Task 9 の変更ではないので触らない）
    expect(terminal_show_notice).toHaveBeenCalledWith('灰皿撤去ユニット___出力制限を解除')
    expect(monologue_boss_rage).toHaveBeenCalledTimes(1)
    // 激昂でBGMのレートも上げる（_enter_rage() の配線）
    expect(audio_music_boss_rage).toHaveBeenCalledTimes(1)
  })

  it('半分を割ってさらに削っても 2 度目は走らない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2)
    vi.clearAllMocks()
    boss._receive_damage(boss, 1)
    boss._receive_damage(boss, 1)

    expect(screen_flash).not.toHaveBeenCalled()
    expect(monologue_boss_rage).not.toHaveBeenCalled()
  })

  it('半分より上では走らない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max / 2 - 1)
    expect(screen_flash).not.toHaveBeenCalled()
  })

  it('撃破のフレームでは移行しない', () => {
    const boss = spawn_boss(20, 20)
    boss._receive_damage(boss, boss._hp_max)
    expect(screen_flash).not.toHaveBeenCalled()
    // 撃破のシェイクは 8（移行の 7 で上書きされていないこと）
    expect(camera.shake).toBe(8)
    // 戦いが終わったので通常BGMへ戻る（_kill() の配線）
    expect(audio_music_normal).toHaveBeenCalledTimes(1)
  })

  it('移行の瞬間に衝撃波が一斉に出る', () => {
    const boss = spawn_boss(20, 20)
    const before = state.entities.filter(
      (e): e is entity_boss_plasma_t => e instanceof entity_boss_plasma_t,
    )
    boss._receive_damage(boss, boss._hp_max / 2)
    const after = state.entities.filter(
      (e): e is entity_boss_plasma_t => e instanceof entity_boss_plasma_t,
    )
    // spawn_particles() は entities に粒子も積むが、entity_boss_plasma_t では
    // ないので instanceof の絞り込みには混ざらない。差分で今回生まれた分だけを見る
    const shockwave = after.filter((e) => !before.includes(e))
    expect(shockwave.length).toBe(12)

    // 速さ: 激昂の弾速で出ていること。_phase の代入がループより前に無いと、
    // 撃射時点ではまだ前半のフェーズのままで、この値が boss_bullet_speed(1)
    // （56）になって赤くなる
    const rage_speed = boss_bullet_speed(boss_phase_rage)
    for (const bullet of shockwave) {
      expect(Math.hypot(bullet.vx, bullet.vz)).toBeCloseTo(rage_speed, 6)
    }

    // 向き: 12 発が 2π を 12 等分した角度と 1 対 1 で一致すること（「全方向へ
    // 一斉放出」の定義そのもの）。単純に隣接差を見る形は atan2 の巻き戻り
    // （±π 境界）で壊れやすいので、両辺を [0, 2π) へ正規化し、円周上の距離
    // （巻き戻りを跨いだ側も見る）でどの目標角に対応するかを 1 発ごとに
    // 消し込みながら判定する
    const two_pi = Math.PI * 2
    const step = two_pi / 12
    const normalize = (a: number) => ((a % two_pi) + two_pi) % two_pi
    const remaining_targets = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    for (const bullet of shockwave) {
      const angle = normalize(Math.atan2(bullet.vz, bullet.vx))
      let matched = -1
      for (const k of remaining_targets) {
        const diff = Math.abs(angle - step * k)
        // 0 と 2π の境界を跨ぐ組は素の差が大きく出るので、円周上の短い方を取る
        if (Math.min(diff, two_pi - diff) < 1e-6) {
          matched = k
          break
        }
      }
      expect(matched).not.toBe(-1)
      remaining_targets.delete(matched)
    }
    // 12 通りすべてが 1 発ずつに埋まったこと（重複や欠けがないこと）
    expect(remaining_targets.size).toBe(0)
  })

  it('移行後は掃射が速くなる', () => {
    const slow = spawn_boss(20, 20)
    for (let i = 0; i < 60; i++) { slow._update() }
    const slow_count = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length

    state.entities = []
    const fast = spawn_boss(20, 20)
    fast._receive_damage(fast, fast._hp_max / 2)
    state.entities = state.entities.filter((e) => e instanceof entity_boss_t)
    for (let i = 0; i < 60; i++) { fast._update() }
    const fast_count = state.entities.filter(
      (e) => e instanceof entity_boss_plasma_t,
    ).length

    expect(fast_count).toBeGreaterThan(slow_count)
  })

  it('移行後はライトの色と強度が激昂の固定値に切り替わる', () => {
    const boss = spawn_boss(20, 20)

    // 位置（x/y/z）は周回で動くので見ない。色と強度（末尾 4 引数）だけを
    // 固定値で比較する — 「変わった」だけでは、別の値に化けた回帰を拾えない
    boss._render()
    const before = vi.mocked(push_light).mock.calls.at(-1)!
    expect(before.slice(3)).toEqual([1.2, 0.4, 0.2, 0.05])

    boss._receive_damage(boss, boss._hp_max / 2)
    boss._render()
    const after = vi.mocked(push_light).mock.calls.at(-1)!
    expect(after.slice(3)).toEqual([1.6, 0.2, 0.1, 0.04])
  })
})
