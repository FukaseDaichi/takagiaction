// 一服演出の時間割。DOM も WebGL も触らない純関数のみを置き、
// Node（Vitest）でモックなしに評価できることが条件（death-sequence-model.ts と同じ扱い）。
// 経過時間は entity-smoking-area.ts がフレーム駆動で進め、ビートの発火判定だけをここが持つ。
//
// 時間割（docs/gameplay.md「一服」）:
//   着火: ライターの音 + 灰皿の 0.3 秒フラッシュ（entity-smoking-area._advance が行う）
//   吸引: 進捗 0.6 秒ごとに高木の位置から煙 1 つ
//   完了 t=0: 吐息 + 煙 3 つ
//   完了 t=0.8s: 感知器の音 + ロック解除通知
//   完了 t=1.5s: 防災扉の駆動音（タイムラインの終端）

export const ignite_flash_duration = 0.3

// 吸引中に煙が湧く時刻（一服の進捗秒）。完了（2.5 秒）の手前まで 0.6 秒ごと。
// 時刻を式（0.6n）から求めると二進浮動小数の割り算で 1 フレームずれうるので、
// death-sequence-model.ts の smoke_times と同じく表と直接比較する
const puff_times = [0.6, 1.2, 1.8, 2.4]

const detector_at = 0.8
const door_at = 1.5

export function smoke_puffs(before: number, after: number): number {
  // (before, after] に入った湧き時刻の数。フレームが粗くても取りこぼさない
  return puff_times.filter((t) => before < t && after >= t).length
}

export interface complete_beats_t {
  detector: boolean // 感知器の音 + ロック解除通知を出す
  door: boolean // 防災扉の駆動音を鳴らす（タイムラインの終端）
}

export function complete_beats(before: number, after: number): complete_beats_t {
  return {
    detector: before < detector_at && after >= detector_at,
    door: before < door_at && after >= door_at,
  }
}
