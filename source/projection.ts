// renderer.ts の頂点シェーダに定数として埋まっている view / projection 行列を
// JS で再現し、ワールド座標を CSS ピクセルへ変換する。シェーダ側の計算は
//   gl_Position = r * v * vec4(p + cam, 1)
// で、cam には renderer_end_frame() が (camera.x, camera.y - 10, camera.z - 30) を
// 渡している。GLSL の mat4 リテラルは列優先。renderer.ts 側の行列や cam の
// オフセットを変えるときは、ここも揃えて変えること。
//
// 実行時 import を持たない葉モジュール。Node（Vitest）でモックなしに評価できる。

export function project(
  x: number, y: number, z: number,
  cam_x: number, cam_y: number, cam_z: number,
  view_w: number, view_h: number,
): { x: number, y: number } | null {
  const qx = x + cam_x
  const qy = y + cam_y - 10
  const qz = z + cam_z - 30

  // view 行列 v: X 軸まわり 45° の傾き（0.707）と平行移動 -22.627
  const vy = 0.707 * (qy - qz) - 22.627
  const vz = 0.707 * (qy + qz) - 22.627

  // projection 行列 r: clip = (0.977*qx, 1.303*vy, -vz-2, -vz)
  const w = -vz
  if (w <= 0) { return null }

  return {
    x: (0.977 * qx / w + 1) / 2 * view_w,
    y: (1 - 1.303 * vy / w) / 2 * view_h,
  }
}
