import { beforeEach, describe, expect, it, vi } from 'vitest'

// entity.ts → renderer.ts → dom.ts は document と canvas に触るため、
// Node 環境では import 時点で落ちる。renderer を差し替えて評価を防ぐ。
// vi.mock は Vitest が巻き上げるので位置に関係なく効くが、
// 何を回避しているかが読めるよう import の前に置く。
vi.mock('./renderer', () => ({
  push_sprite: () => {},
}))

import { entity_t } from './entity'
import { level_data, level_width, state } from './state'

// テスト用にタイル座標 (tx, tz) を壁にする
function set_wall(tx: number, tz: number): void {
  level_data[tx + tz * level_width] = 8
}

// _collides は protected。本番コードにテスト用の口を開けたくないので、
// テスト内のサブクラスから覗く。
class entity_probe_t extends entity_t {
  probe_collides(x: number, z: number): boolean {
    return this._collides(x, z)
  }
}

describe('entity_t の壁衝突', () => {
  beforeEach(() => {
    level_data.fill(1) // すべて床
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
  })

  it('床の上では衝突しない', () => {
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('壁タイルの上では衝突する', () => {
    set_wall(2, 2) // ワールド座標 16..23
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(true)
  })

  it('右端の判定点が壁に入ると衝突する', () => {
    set_wall(3, 2) // ワールド座標 24..31
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    // x=18 なら右端 x+6=24 がタイル 3 に入る
    expect(e.probe_collides(18, 16)).toBe(true)
    // x=16 なら右端 x+6=22 でタイル 2 に収まる
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('下端の判定点が壁に入ると衝突する', () => {
    set_wall(2, 3) // ワールド座標 24..31
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    // z=20 なら下端 z+4=24 がタイル 3 に入る
    expect(e.probe_collides(16, 20)).toBe(true)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('タイル値 7 は床なので衝突しない', () => {
    level_data[2 + 2 * level_width] = 7
    const e = new entity_probe_t(16, 0, 16, 0, 0)
    expect(e.probe_collides(16, 16)).toBe(false)
  })

  it('生成すると state.entities に登録される', () => {
    const e = new entity_t(0, 0, 0, 0, 0)
    expect(state.entities).toContain(e)
  })

  it('致死ダメージで entities_to_kill に入り _dead が立つ', () => {
    const e = new entity_t(0, 0, 0, 0, 0)
    e._receive_damage(e, 99)
    expect(e._dead).toBe(true)
    expect(state.entities_to_kill).toContain(e)
  })
})
