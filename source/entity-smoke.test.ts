import { beforeEach, describe, expect, it, vi } from 'vitest'

// entity.ts が renderer を import するため、Node 環境ではモックが要る
// （entity-smoking-area.test.ts と同じパターン）。
vi.mock('./renderer', () => ({
  push_sprite: () => {},
  push_light: () => {},
  push_block: () => {},
  camera: { x: 0, y: 0, z: 0, shake: 0 },
}))

import { entity_smoke_t, spawn_smoke } from './entity-smoke'
import { state } from './state'

describe('煙', () => {
  beforeEach(() => {
    state.entities = []
    state.entities_to_kill = []
    state.time_elapsed = 0
  })

  it('spawn_smoke はタイル 38 の煙エンティティを 1 個生成する', () => {
    spawn_smoke(64, 64)
    expect(state.entities.length).toBe(1)
    const smoke = state.entities[0]
    expect(smoke).toBeInstanceOf(entity_smoke_t)
    expect(smoke.s).toBe(38)
  })

  it('上昇し続け、約 2 秒で消える', () => {
    spawn_smoke(64, 64)
    const smoke = state.entities[0]

    state.time_elapsed = 0.5
    smoke._update()
    expect(smoke.y).toBeGreaterThan(0)
    expect(smoke._dead).toBe(false)

    for (let i = 0; i < 4; i++) { smoke._update() } // 累計 2.5 秒
    expect(smoke._dead).toBe(true)
    expect(state.entities_to_kill).toContain(smoke)
  })
})
