import { beforeEach, describe, expect, it, vi } from 'vitest'

// ミニマップの描画規約（明滅の速さと霧の扱い）のテスト。
// エンティティは instanceof と 2 つのフィールドしか読まれないので、実体ではなく
// 最小のダミークラスを差し込む。renderer / audio / terminal まで芋づるで
// 引かずに済み、テストがミニマップの規約だけを見るようになる。
// dom.ts は 2D コンテキストのスタブに差し替え、createImageData が返す配列を
// テストから直接読む（putImageData は捨てて構わない）。
const mocks = vi.hoisted(() => {
  class fake_entity_t {
    x: number
    z: number
    constructor(tile_x: number, tile_z: number) {
      this.x = tile_x << 3
      this.z = tile_z << 3
    }
  }
  return {
    smoking_area_t: class extends fake_entity_t { _done = 0; revealed_dummy = 0 },
    exit_t: class extends fake_entity_t {},
    yani_t: class extends fake_entity_t {},
    drone_t: class extends fake_entity_t {},
    container_t: class extends fake_entity_t {},
    pixels: { data: new Uint8ClampedArray(64 * 64 * 4) },
    sniff_el: { style: { display: '' }, textContent: '' },
  }
})

vi.mock('./entity-smoking-area', () => ({ entity_smoking_area_t: mocks.smoking_area_t }))
vi.mock('./entity-exit', () => ({ entity_exit_t: mocks.exit_t }))
// minimap.ts は ./entity-yani を import しない（吸い殻は描かない）。それでも
// モックを残すのは、import と分岐を戻した瞬間に「落ちている吸い殻は Lv5 でも
// ミニマップに出ない」が赤くなるようにするため
vi.mock('./entity-yani', () => ({ entity_yani_t: mocks.yani_t }))
vi.mock('./entity-drone', () => ({ entity_drone_t: mocks.drone_t }))
vi.mock('./entity-container', () => ({ entity_container_t: mocks.container_t }))
vi.mock('./dom', () => ({
  minimap_canvas: {
    getContext: () => ({
      createImageData: () => mocks.pixels,
      putImageData: () => {},
    }),
  },
  sniff_el: mocks.sniff_el,
}))

const { meta } = await import('./meta')
const { minimap_reset, minimap_update } = await import('./minimap')
const { level_data, level_width, state } = await import('./state')

// 明滅の 2 つの速さ。blink_period = 1 秒
const slow_on = 0.35 // 通常の明滅は点灯、倍速は消灯
const slow_off = 0.60 // 通常の明滅は消灯、倍速は点灯

const orange_dim = [238, 153, 0, 255]
const orange_bright = [255, 228, 150, 255]
const green_dim = [0, 220, 120, 255]
const green_bright = [190, 255, 220, 255]
const drone_blue = [140, 200, 240, 255]
const container_green = [150, 230, 200, 255]
const floor_color = [28, 58, 74, 255]

const player_tile = 10
const far_tile = 30 // 自機から 20 タイル。ゲージ満タンの描き込み半径 10 の外
const near_tile = 13 // 自機から 3 タイル。どの段階でも描き込み半径の中
const corridor_z = 32

function pixel(x: number, z: number): number[] {
  const p = (x + z * level_width) * 4
  return Array.from(mocks.pixels.data.slice(p, p + 4))
}

// blink_timer は minimap_update() の中で time_elapsed だけ進む。
// 位相を狙って刻むために、経過時間そのものを差分として渡す
function advance_to(phase: number, from = 0): void {
  state.time_elapsed = phase - from
  minimap_update()
}

beforeEach(() => {
  mocks.pixels.data.fill(0)
  level_data.fill(0)
  // z=32 の横一列だけ床。目標タイル (30,32) は生成器と同じく壁（8）
  for (let x = 1; x < far_tile; x++) { level_data[x + corridor_z * level_width] = 1 }
  level_data[far_tile + corridor_z * level_width] = 8

  meta.levels.sniff = 0
  state.entities.length = 0
  state.entity_player = {
    x: player_tile << 3, z: corridor_z << 3, _angle: 0,
  } as unknown as typeof state.entity_player
  state.game_running = 1
  state.exit_open = 0
  state.nicotine = 100
  state.nicotine_max = 100
  minimap_reset()
})

describe('ミニマップの明滅', () => {
  it('嗅覚が指す喫煙所は、未探索でも霧を抜けて描かれる', () => {
    meta.levels.sniff = 1
    state.nicotine = 25 // しきい値 30% 以下 → 発動
    state.entities.push(
      new mocks.smoking_area_t(far_tile, corridor_z) as never,
    )

    advance_to(0.1)

    expect(pixel(far_tile, corridor_z)).toEqual(orange_bright)
    // 隣のタイルは霧のまま。嗅覚が晴らすのは目標の 1 ピクセルだけで、
    // 経路は自分の足で開くしかない
    expect(pixel(far_tile - 1, corridor_z)[3]).toBe(0)
  })

  it('嗅覚が指す喫煙所は倍速で明滅する（通常の明滅と位相が食い違う）', () => {
    meta.levels.sniff = 1
    state.nicotine = 25
    state.entities.push(
      new mocks.smoking_area_t(far_tile, corridor_z) as never,
    )

    advance_to(slow_on)
    expect(pixel(far_tile, corridor_z)).toEqual(orange_dim)

    advance_to(slow_off, slow_on)
    expect(pixel(far_tile, corridor_z)).toEqual(orange_bright)
  })

  it('嗅覚が指していない未訪問の喫煙所は通常の速さで明滅する', () => {
    // 嗅覚なし。自機のすぐ隣なので探索済みになる
    state.entities.push(
      new mocks.smoking_area_t(near_tile, corridor_z) as never,
    )

    advance_to(slow_on)
    expect(pixel(near_tile, corridor_z)).toEqual(orange_bright)

    advance_to(slow_off, slow_on)
    expect(pixel(near_tile, corridor_z)).toEqual(orange_dim)
  })

  it('ゲージがしきい値を超えると点は消える（痕跡を残さない）', () => {
    meta.levels.sniff = 1
    state.nicotine = 25
    state.entities.push(
      new mocks.smoking_area_t(far_tile, corridor_z) as never,
    )

    advance_to(0.1)
    expect(pixel(far_tile, corridor_z)).toEqual(orange_bright)

    // 一服してゲージが戻ると嗅覚は切れる。minimap_explored を立てていないので
    // 点はその場で消え、探索済みにもならない
    state.nicotine = 100
    advance_to(0.2, 0.1)
    expect(pixel(far_tile, corridor_z)[3]).toBe(0)
  })

  it('嗅覚 Lv4 は開通済みの非常口も霧を抜けて倍速で明滅させる', () => {
    meta.levels.sniff = 4
    state.nicotine = 50 // Lv2 以降のしきい値 60% 以下
    state.exit_open = 1
    state.entities.push(new mocks.exit_t(far_tile, corridor_z) as never)

    advance_to(slow_on)
    expect(pixel(far_tile, corridor_z)).toEqual(green_dim)

    advance_to(slow_off, slow_on)
    expect(pixel(far_tile, corridor_z)).toEqual(green_bright)
  })

  it('嗅覚が発動していなければ未探索の喫煙所は描かれない', () => {
    meta.levels.sniff = 5
    state.nicotine = 100 // しきい値の外
    state.entities.push(
      new mocks.smoking_area_t(far_tile, corridor_z) as never,
    )

    advance_to(0.1)

    expect(pixel(far_tile, corridor_z)[3]).toBe(0)
  })
})

// 霧の中の床タイル。どちらも自機から描き込み半径 10 の外
const drone_tile = far_tile - 1
const container_tile = far_tile - 3

describe('ミニマップの収入系（嗅覚 Lv5）', () => {
  it('清掃ドローンと押収品コンテナは霧の中でも点灯する（しきい値を見ない）', () => {
    meta.levels.sniff = 5
    state.nicotine = 100 // 生存系のしきい値の外。収入系はここを通さない
    state.entities.push(
      new mocks.drone_t(drone_tile, corridor_z) as never,
      new mocks.container_t(container_tile, corridor_z) as never,
    )

    advance_to(0.1)

    expect(pixel(drone_tile, corridor_z)).toEqual(drone_blue)
    expect(pixel(container_tile, corridor_z)).toEqual(container_green)
  })

  it('嗅覚 Lv4 では収入系は点灯しない', () => {
    meta.levels.sniff = 4
    state.entities.push(
      new mocks.drone_t(drone_tile, corridor_z) as never,
      new mocks.container_t(container_tile, corridor_z) as never,
    )

    advance_to(0.1)

    expect(pixel(drone_tile, corridor_z)[3]).toBe(0)
    expect(pixel(container_tile, corridor_z)[3]).toBe(0)
  })

  it('落ちている吸い殻は Lv5 でもミニマップに出ない', () => {
    // ドローン 1 体の撃破で 30 個以上が同じ場所へ散るため、点が面になって
    // 生存系の明滅を覆い隠す（docs/meta-progression.md「ミニマップの 1 点は 1 つの機会を指す」）。
    // 探索済みのタイルでも床の色のままで、点は増えない
    meta.levels.sniff = 5
    state.entities.push(
      new mocks.yani_t(drone_tile, corridor_z) as never,
      new mocks.yani_t(near_tile, corridor_z) as never,
    )

    advance_to(0.1)

    expect(pixel(drone_tile, corridor_z)[3]).toBe(0)
    expect(pixel(near_tile, corridor_z)).toEqual(floor_color)
  })
})
