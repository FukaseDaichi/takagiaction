// 薙ぎの弧の形。renderer.ts の push_quad は 4 隅の座標をそのまま取るので、
// スプライトの billboard 制約（回転もスケールもできない）の外側で、地面に
// 寝かせた三日月を実ジオメトリとして組める。ここが返すのは自機を原点とした
// ワールドオフセットだけで、実行時 import を持たない葉モジュール。
// Node（Vitest）でモックなしに評価でき、形の検証もそこで済む

// 弧を角度方向に何枚の板へ割るか。1 振り 6 枚 = 36 頂点で、64k の頂点
// バッファに対して無視できる
export const slash_segments = 6

// 刃先が弧を渡り切るまで（秒）。判定は振った瞬間に敵を 1 周するので、
// ここを長くすると「死んでから斬られた」に見える。3 フレームに抑えて
// 絵と判定のずれを 50ms 以下にする
export const slash_head_time = 0.05

// 残光が消えるまで（秒）
export const slash_duration = 0.14

// アトラスの空きタイル。42 が押収品コンテナで、43 以降は未使用だった
export const slash_tile_core = 43
export const slash_tile_glow = 44

// 三日月のえぐり量。射程に対する内周の食い込みの比率。外周は刃先が通る円
// そのままに保ち、内側だけを膨らませることで「弧を薙いだ」形にする
const slash_band = 0.55

// 帯の太さの分布。sin の山を使い、中ほどを最も太く、両端を細くする。
// 引数の下駄（0.05 / 0.98）が両端の太さを決める — 刃先側を後端より薄く
// することで、切っ先が尖り、後ろに尾を引く三日月になる。
// どちらも 0 にしないのは、太さ 0 の板は面積が消えて描かれないため
function band_shape(s: number): number {
  return Math.pow(Math.sin(Math.PI * (0.05 + 0.93 * s)), 0.8)
}

export type slash_quad_t = {
  ax: number, az: number // 外周・後端
  bx: number, bz: number // 外周・先端
  cx: number, cz: number // 内周・後端
  dx: number, dz: number // 内周・先端
  tile: number
}

// 刃先の進み具合（0..1）。ease-out にして抜き際に速く走らせ、端で止める。
// 等速だと「なぞった」に見えて、振り抜いた感じが出ない
function head_progress(age: number): number {
  const t = Math.min(1, age / slash_head_time)
  return 1 - (1 - t) * (1 - t)
}

// 後端の進み具合（0..1）。刃先が端に着いてから追いつき始めるので、帯は
// 伸びきったあと縮んで消える。シェーダが a<0.8 を discard する（半透明を
// 持てない）ため、この縮みがフェードの代わりになる
function tail_progress(age: number): number {
  const span = slash_duration - slash_head_time
  return Math.max(0, Math.min(1, (age - slash_head_time) / span))
}

// 弧の上の角度。u = 0 が振り出しの端、u = 1 が振り抜いた端
function arc_angle(angle: number, arc: number, dir: number, u: number): number {
  return angle + dir * arc * (u * 2 - 1)
}

export function slash_head_angle(
  angle: number, arc: number, dir: number, age: number,
): number {
  return arc_angle(angle, arc, dir, head_progress(age))
}

export function slash_quads(
  angle: number, arc: number, reach: number, dir: number, age: number,
): slash_quad_t[] {
  if (age > slash_duration) { return [] }

  const head = head_progress(age)
  const tail = tail_progress(age)
  if (head - tail < 1e-6) { return [] }

  const width = (s: number): number => reach * slash_band * band_shape(s)

  const quads: slash_quad_t[] = []
  for (let i = 0; i < slash_segments; i++) {
    const s_a = i / slash_segments
    const s_b = (i + 1) / slash_segments
    const a = arc_angle(angle, arc, dir, tail + (head - tail) * s_a)
    const b = arc_angle(angle, arc, dir, tail + (head - tail) * s_b)
    const r_a = reach - width(s_a)
    const r_b = reach - width(s_b)

    quads.push({
      ax: Math.cos(a) * reach, az: Math.sin(a) * reach,
      bx: Math.cos(b) * reach, bz: Math.sin(b) * reach,
      cx: Math.cos(a) * r_a, cz: Math.sin(a) * r_a,
      dx: Math.cos(b) * r_b, dz: Math.sin(b) * r_b,
      // 刃先が渡っている間だけ先頭 2 枚を明るいコアにする。渡り切ったら
      // 全部が残光に落ちる
      tile: head < 1 && i >= slash_segments - 2 ? slash_tile_core : slash_tile_glow,
    })
  }
  return quads
}
