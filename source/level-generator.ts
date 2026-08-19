import { array_rand, random_int, random_seed } from './random'
import { level_height, level_width } from './state'

// このモジュールは renderer / dom / audio を import しない。
// それらはモジュール初期化時に canvas.getContext() や document.getElementById() を
// 実行するため Node 環境で評価できない。1000 シード検証をモックなしで回すための分割。

export interface tile_pos_t {
  x: number // タイル座標
  z: number
}

export interface room_t {
  x: number // 左上のタイル座標
  z: number
  w: number
  h: number
}

export interface level_layout_t {
  tiles: Uint8Array
  rooms: room_t[]
  start: tile_pos_t
}

// renderer.ts の max_verts（1024*64 = 65536）から、エンティティのスプライトと
// 喫煙所・非常口のブロックぶんの余裕を引いた値。push_floor = 6 verts /
// push_block = 24 verts なので、輪郭壁だけにしてもタイル数次第では超えうる。
const max_level_verts = 60000

const room_count_min = 8
const room_count_max = 12
const room_size_min = 5
const room_size_max = 11
const room_place_attempts = 200 // 部屋ごとではなく 1 レベル全体での試行回数
const room_count_floor = 3 // これを下回るシードは棄却して次のシードで作り直す
const layout_attempts = 8
const rng_warmup = 8 // 下の build_layout のコメントを参照

function tile_index(x: number, z: number): number {
  return x + z * level_width
}

function room_center(room: room_t): tile_pos_t {
  return { x: room.x + (room.w >> 1), z: room.z + (room.h >> 1) }
}

// 1 タイル以上空ける = 片方を 1 タイル膨らませた矩形が重ならないこと
function rooms_overlap(a: room_t, b: room_t): boolean {
  return !(
    a.x + a.w + 1 <= b.x ||
    b.x + b.w + 1 <= a.x ||
    a.z + a.h + 1 <= b.z ||
    b.z + b.h + 1 <= a.z
  )
}

function place_rooms(): room_t[] {
  const rooms: room_t[] = []
  const target = random_int(room_count_min, room_count_max)

  for (let i = 0; i < room_place_attempts && rooms.length < target; i++) {
    const w = random_int(room_size_min, room_size_max)
    const h = random_int(room_size_min, room_size_max)
    // 外周 1 タイルは輪郭壁のために空けておく
    const room: room_t = {
      x: random_int(1, level_width - w - 2),
      z: random_int(1, level_height - h - 2),
      w,
      h,
    }
    if (!rooms.some((other) => rooms_overlap(room, other))) {
      rooms.push(room)
    }
  }
  return rooms
}

function carve_floor(tiles: Uint8Array, x: number, z: number): void {
  if (x < 1 || x >= level_width - 1 || z < 1 || z >= level_height - 1) { return }
  // 床のバリエーション抽選は既存の PNG 版と同じ重み
  tiles[tile_index(x, z)] =
    array_rand([1, 1, 1, 1, 1, 3, 3, 2, 5, 5, 5, 5, 5, 5, 7, 7, 6])
}

function carve_room(tiles: Uint8Array, room: room_t): void {
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      carve_floor(tiles, x, z)
    }
  }
}

// 幅 2 の L 字通路。横に掘ってから縦に掘る。
// 横の区間は行 from.z / from.z+1、縦の区間は列 to.x / to.x+1 なので、
// 両者は (to.x, from.z) を共有して必ずつながる。
function carve_corridor(tiles: Uint8Array, from: tile_pos_t, to: tile_pos_t): void {
  const step_x = from.x < to.x ? 1 : -1
  for (let x = from.x; x !== to.x + step_x; x += step_x) {
    carve_floor(tiles, x, from.z)
    carve_floor(tiles, x, from.z + 1)
  }
  const step_z = from.z < to.z ? 1 : -1
  for (let z = from.z; z !== to.z + step_z; z += step_z) {
    carve_floor(tiles, to.x, z)
    carve_floor(tiles, to.x + 1, z)
  }
}

function is_floor_tile(tiles: Uint8Array, x: number, z: number): boolean {
  if (x < 0 || x >= level_width || z < 0 || z >= level_height) { return false }
  const t = tiles[tile_index(x, z)]
  return t > 0 && t < 8
}

// 床に隣接する非床タイルだけを壁にする。「非床を全部壁にする」と
// 2800〜3400 タイルぶんの push_block になって頂点バッファが溢れる。
function build_walls(tiles: Uint8Array): void {
  const walls: number[] = []

  for (let z = 0; z < level_height; z++) {
    for (let x = 0; x < level_width; x++) {
      if (is_floor_tile(tiles, x, z)) { continue }
      let adjacent = false
      for (let dz = -1; dz <= 1 && !adjacent; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && is_floor_tile(tiles, x + dx, z + dz)) {
            adjacent = true
            break
          }
        }
      }
      if (adjacent) { walls.push(tile_index(x, z)) }
    }
  }

  // 走査しながら書き込むと読み手が混乱するので、収集してから書く
  for (const index of walls) {
    tiles[index] = random_int(0, 5) < 4 ? 8 : random_int(8, 17)
  }
}

// renderer.ts の push_floor / push_block が積む頂点数。
// 定数を変えるときは renderer.ts と必ず一緒に見ること。
export function level_vert_cost(tiles: Uint8Array): number {
  let cost = 0
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (t > 7) { cost += 24 } else if (t > 0) { cost += 6 }
  }
  return cost
}

function build_layout(depth: number, seed: number): level_layout_t | null {
  random_seed(seed)

  // random.ts の LCG は seed 直後の数回の出力がシードと強く相関する。
  // これを捨てないと、1 ラン内の連続する深度（run_seed + depth * 7919）で
  // 最初の部屋の幅と x 座標がほぼ同じ値に張り付き、部屋数も 1 種類に固定される。
  // 8 回捨てると部屋数 8〜12 がほぼ一様に散る（実測）。
  // random.ts 自体は変えない。random.test.ts が旧実装との出力一致を固定していて、
  // レベル生成の再現性がそこに乗っているため。
  for (let i = 0; i < rng_warmup; i++) { random_int(0, 1) }

  const tiles = new Uint8Array(level_width * level_height)
  const rooms = place_rooms()
  if (rooms.length < room_count_floor) { return null }

  for (const room of rooms) { carve_room(tiles, room) }

  // 一本鎖でつなぐので連結性は構築上保証される
  for (let i = 0; i + 1 < rooms.length; i++) {
    carve_corridor(tiles, room_center(rooms[i]), room_center(rooms[i + 1]))
  }

  // 袋小路だけだと引き返しが単調になるため、ループを 1〜2 本足す
  const shortcuts = random_int(1, 2)
  for (let i = 0; i < shortcuts; i++) {
    const a = random_int(0, rooms.length - 1)
    const b = random_int(0, rooms.length - 1)
    if (a !== b) {
      carve_corridor(tiles, room_center(rooms[a]), room_center(rooms[b]))
    }
  }

  build_walls(tiles)

  return { tiles, rooms, start: room_center(rooms[0]) }
}

export function generate_level(depth: number, seed: number): level_layout_t {
  for (let attempt = 0; attempt < layout_attempts; attempt++) {
    const layout = build_layout(depth, seed + attempt * 104729)
    if (layout && level_vert_cost(layout.tiles) <= max_level_verts) {
      return layout
    }
  }
  // 8 シード連続で条件を満たさないのは配置パラメータが壊れているとき。
  // 壊れたレベルを静かに返すより落とす。
  throw new Error('level generation failed')
}
