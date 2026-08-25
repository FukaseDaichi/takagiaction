import { beforeEach, describe, expect, it, vi } from 'vitest'

// renderer は dom.ts 経由で document と canvas に触るため Node 環境では評価できない
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_quad: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))
// audio は AudioContext をモジュール初期化時に生成するため同様
vi.mock('./audio', () => ({
  audio_play: () => {},
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
  monologue_death: vi.fn(),
  monologue_drone_kill: vi.fn(),
}))
vi.mock('./screen-slash', () => ({ screen_slash: () => {} }))
// 報酬ダイアログは DOM を組む
vi.mock('./boss-reward', () => ({ boss_reward_show: vi.fn() }))

import {
  boss_centre, boss_hitbox, boss_orbit_radius_max, boss_orbit_radius_min,
  boss_orbit_speed, boss_spawn_offset,
} from './boss-model'
import { entity_boss_t } from './entity-boss'
import { entity_player_t } from './entity-player'
import { level_data, level_width, state } from './state'

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
  // ここでは実際の移動そのもの——1 フレームの移動距離の上限と、偏角が
  // 単調に進むこと——を固定し、その 2 つの回帰を検出する
  it('線速度が一定に保たれ、周回角が単調に進む', () => {
    const boss = spawn_boss(20, 20)
    // 1 フレームで動いてよい距離の上限。速度係数の上限 1.3
    // （boss_pick_speed_factor）と、動径方向の合成上限 1.12
    // （boss-model.ts の boss_radius_speed_factor コメント：0.5 なら合成が
    // 基準の 1.12 倍に収まる）を掛ける。角速度を半径に依らない定数にすると、
    // 半径が大きいところ（最大 70）でこれを大きく超える——半径 10 と 70 で
    // 線速度が 7 倍という設計そのものの裏返し
    const max_step = boss_orbit_speed(1) * 1.3 * 1.12 * state.time_elapsed
    let prev_x = boss.x
    let prev_z = boss.z
    let prev_angle = angle(boss)
    let angle_advanced = false
    for (let i = 0; i < 60 * 5; i++) {
      boss._update()
      if (i > 0) {
        // 最初の 1 フレームだけは対象外（生成直後は半径 0 で偏角が不定）
        const step = Math.hypot(boss.x - prev_x, boss.z - prev_z)
        expect(step).toBeLessThanOrEqual(max_step)
      }
      const a = angle(boss)
      let delta = a - prev_angle
      while (delta > Math.PI) { delta -= Math.PI * 2 }
      while (delta < -Math.PI) { delta += Math.PI * 2 }
      // _spin と同じ向きにしか進まない（逆行しない）。角速度 0 の回帰は
      // delta が常に 0 になるので、下の angle_advanced で検出する
      expect(delta * boss._spin).toBeGreaterThanOrEqual(0)
      if (delta !== 0) { angle_advanced = true }
      prev_x = boss.x
      prev_z = boss.z
      prev_angle = a
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
