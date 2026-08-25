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

import { boss_centre, boss_hitbox } from './boss-model'
import { entity_boss_t } from './entity-boss'
import { entity_player_t } from './entity-player'
import { level_data, level_width, state } from './state'

// タイル座標に壁（値 8）を立てる
function wall(tx: number, tz: number): void {
  level_data[tx + tz * level_width] = 8
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
