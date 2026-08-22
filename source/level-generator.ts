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
  smoking_area: tile_pos_t // 本物の喫煙所
  dummies: tile_pos_t[] // 灰皿撤去済みの空の喫煙所
  exit: tile_pos_t // 非常口
  spiders: tile_pos_t[]
  sentries: tile_pos_t[]
  health: tile_pos_t[]
  yani: tile_pos_t[] // 床に散在する吸い殻
  drones: tile_pos_t[] // 清掃ドローン。0〜1 体
}

// renderer.ts の max_verts（1024*64 = 65536）から、エンティティのスプライトと
// 喫煙所・非常口のブロックぶんの余裕を引いた値。push_floor = 6 verts /
// push_block = 24 verts なので、輪郭壁だけにしてもタイル数次第では超えうる。
const max_level_verts = 60000

const room_size_min = 5
const room_size_max = 11
const room_place_attempts = 200 // 部屋ごとではなく 1 レベル全体での試行回数
const room_count_floor = 3 // これを下回るシードは棄却して次のシードで作り直す
const layout_attempts = 8
const rng_warmup = 8 // 下の build_layout のコメントを参照
const spawn_min_distance = 8 // 開始地点からの BFS タイル距離。ここより近くには湧かせない

// 深度 1 → 10 でフロアを「狭い浅層」から満寸へ開く進行度。
// 満寸のまま浅い層を出すと、開始から非常口まで常に約 75 タイル歩かされる
// （非常口は最も遠い部屋なので、この距離は深度に依存しない）。
function depth_scale(depth: number): number {
  return Math.min(1, (depth - 1) / 9)
}

// 部屋を置ける正方形の一辺（タイル）。グリッド自体は 64×64 のまま変えない。
// state.ts の level_data もミニマップの ImageData も level_width * level_height の
// 固定長で、可変にすると生成器の外へ波及する。範囲だけ絞れば生成器の中で閉じる。
// 満寸が 62 なのは、輪郭壁のために外周 1 タイルを空けるため（使える内側が 1..62）。
export function level_bounds_side(depth: number): number {
  return Math.round(32 + 30 * depth_scale(depth))
}

// 範囲と部屋数はセットで動かす。範囲だけ縮めると 8〜12 部屋が入りきらず、
// place_rooms() が room_place_attempts を使い切って黙って少ない数を返し、
// 部屋数がシードごとに 3〜8 の間で暴れる（一辺 26 での実測）。
export function room_count_range(depth: number): { min: number, max: number } {
  const t = depth_scale(depth)
  return { min: Math.round(5 + 3 * t), max: Math.round(6 + 6 * t) }
}

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

function place_rooms(depth: number): room_t[] {
  const rooms: room_t[] = []
  const count = room_count_range(depth)
  const target = random_int(count.min, count.max)
  const side = level_bounds_side(depth)
  // 範囲は盤面中央に寄せる。外周 1 タイルは輪郭壁のために空けておく。
  // side = 62 のとき x0 = 1 となり、範囲を導入する前の
  // random_int(1, level_width - w - 2) とタイル単位で一致する。
  const x0 = 1 + ((level_width - 2 - side) >> 1)
  const z0 = 1 + ((level_height - 2 - side) >> 1)

  for (let i = 0; i < room_place_attempts && rooms.length < target; i++) {
    const w = random_int(room_size_min, room_size_max)
    const h = random_int(room_size_min, room_size_max)
    const room: room_t = {
      x: random_int(x0, x0 + side - w - 1),
      z: random_int(z0, z0 + side - h - 1),
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

// 開始タイルから床タイルだけを辿った距離。未到達は -1。
// 部屋の選定はすべてこの距離で行う。添字順やユークリッド距離を混ぜないこと。
export function bfs_distances(tiles: Uint8Array, start: tile_pos_t): Int32Array {
  const dist = new Int32Array(level_width * level_height).fill(-1)
  const queue = [tile_index(start.x, start.z)]
  dist[queue[0]] = 0

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % level_width
    const z = (index / level_width) | 0
    const next = dist[index] + 1

    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!is_floor_tile(tiles, nx, nz)) { continue }
      const n = tile_index(nx, nz)
      if (dist[n] !== -1) { continue }
      dist[n] = next
      queue.push(n)
    }
  }
  return dist
}

// 満寸のフロアの床タイル数（実測平均）。敵の総数を按分する基準。
export const reference_floor_tiles = 1090

// 総数の上限。game.ts のエンティティ衝突判定は O(n²) なので、上限がないと
// フロアが進むほどフレームレートが落ちる。上限があること自体が要件。
const enemy_count_max = 100

// 敵の総数。既存の「床タイルごとに random_int(0, 16 - id*2) == 0」は深度 8 で
// 当選率 100%、深度 9 以降で負のレンジになり当選率が非単調に振れる。
// 総数で管理すれば単調性も上限も保証できる。
//
// 床タイル数で按分するのは、フロアの広さが深度で開くため
// （level_bounds_side）。体数を深度だけから決めると、狭い浅い層ほど
// 敵密度が上がり、広さを絞った意味が消える。
//
// 上限は按分のあとに掛ける。先に掛けると、床タイル数が基準を上回るフロアで
// 按分が上限を押し上げ、100 を超えうる。
export function enemy_count(depth: number, floor_tiles: number): number {
  const scaled = (30 + depth * 4) * floor_tiles / reference_floor_tiles
  return Math.min(Math.round(scaled), enemy_count_max)
}

export function sentry_count(depth: number): number {
  return Math.min(1 + Math.floor(depth / 2), 10)
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
  const rooms = place_rooms(depth)
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

  const start = room_center(rooms[0])
  const dist = bfs_distances(tiles, start)

  // 開始部屋からの BFS 距離で部屋を並べる。添字 0 が開始部屋。
  const ranked = rooms
    .map((room) => room_center(room))
    .map((center) => ({ center, d: dist[tile_index(center.x, center.z)] }))
    .filter((entry) => entry.d >= 0)
    .sort((a, b) => a.d - b.d)

  if (ranked.length < room_count_floor) { return null }

  // 深度が上がるほど遠くなる。Math.floor を省くと部屋[3.333] が undefined になり
  // 深度 1 でランが詰む。min を取る前に floor を適用すること。
  const k = Math.min(3 + Math.floor(depth / 3), ranked.length - 1)
  const smoking_area = ranked[k].center

  // 非常口は喫煙所の部屋を除いて最も遠い部屋。除外しないと深度が上がって
  // k が最終部屋を指したとき喫煙所と非常口が同室になる。
  // ranked.length >= 3 かつ k >= 2 なので、この探索は必ず添字 1 以上を返す
  // （= 非常口が開始部屋になることはない）。
  let exit_rank = 0
  for (let i = ranked.length - 1; i >= 1; i--) {
    if (i !== k) { exit_rank = i; break }
  }
  const exit = ranked[exit_rank].center

  // ダミーは開始・喫煙所・非常口を除いた部屋から。
  // 部屋数が足りないときは置ける数だけにする。
  const eligible: number[] = []
  for (let i = 1; i < ranked.length; i++) {
    if (i !== k && i !== exit_rank) { eligible.push(i) }
  }
  // 深度 5 から。深度 1〜4 でダミーを出すと、ミニマップに明滅するオレンジが
  // 複数あって片方はハズレという状態になり、フロアを狭めても探索の空振りだけが
  // 残る。浅い層は明滅するオレンジ 1 点 = 本物にして、明滅をそのまま答えにする。
  const dummy_target = Math.min(Math.floor(depth / 5), 3)
  const dummies: tile_pos_t[] = []
  while (dummies.length < dummy_target && eligible.length > 0) {
    const pick = random_int(0, eligible.length - 1)
    dummies.push(ranked[eligible[pick]].center)
    eligible.splice(pick, 1)
  }

  // 喫煙所・ダミー・非常口はブロックとして立つので当たり判定を壁にする。
  // 見た目はエンティティが毎フレーム push_block() する。レベルジオメトリは
  // renderer_freeze_level_geometry() で焼かれていて後から書き換えられないため、
  // 非常口の「壁 → 床」を静的ジオメトリで表現することはできない。
  for (const p of [smoking_area, exit, ...dummies]) {
    tiles[tile_index(p.x, p.z)] = 8
  }

  // 湧き先の候補。目標地点は直前に壁へ変えたのでここで自然に除外される。
  // 床タイル数も同じ走査で数える（敵の総数の按分に使う）。目標地点を壁へ
  // 変えたあとに数えるので、enemy_count が見る床の数と実際の床が一致する。
  const spawnable: number[] = []
  let floor_tiles = 0
  for (let i = 0; i < dist.length; i++) {
    const t = tiles[i]
    if (t > 0 && t < 8) {
      floor_tiles++
      if (dist[i] >= spawn_min_distance) { spawnable.push(i) }
    }
  }

  // 候補から重複なく取り出す。候補が尽きたら取れた分で打ち切る。
  const take = (count: number): tile_pos_t[] => {
    const out: tile_pos_t[] = []
    for (let i = 0; i < count && spawnable.length > 0; i++) {
      const pick = random_int(0, spawnable.length - 1)
      const index = spawnable[pick]
      spawnable.splice(pick, 1)
      out.push({ x: index % level_width, z: (index / level_width) | 0 })
    }
    return out
  }

  const sentries = take(sentry_count(depth))
  const spiders = take(enemy_count(depth, floor_tiles) - sentries.length)
  const health = take(random_int(2, 4))
  const yani = take(random_int(1, 3)) // 床への散在: 1 フロアあたり 1〜3（設計書）
  // 清掃ドローンは「まれに」= 1/4 のフロアに 1 体。敵予算には数えない（非武装）
  const drones = take(random_int(0, 3) === 0 ? 1 : 0)

  return {
    tiles, rooms, start, smoking_area, dummies, exit,
    spiders, sentries, health, yani, drones,
  }
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
