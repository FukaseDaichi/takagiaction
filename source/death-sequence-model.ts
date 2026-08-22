// 死亡シーケンスの時間割。DOM も WebGL も触らない純関数のみを置き、
// Node（Vitest）でモックなしに評価できることが条件（death-screen-model.ts と同じ扱い）。
// 経過時間は game_tick が state.death_elapsed で進め、各ビートの発火判定だけをここが持つ。
//
// 時間割（docs/gameplay.md「死亡シーケンス」）:
//   0.0s 倒れる（姿勢変更・カメラ揺れ・BGM テープストップは entity-player._kill が行う）
//   0.2s〜1.8s 魂の煙が 0.4 秒間隔で立ちのぼる
//   0.5s 高木の最期のひとこと（遅延は death_line_delay、発話は _kill 時に予約）
//   1.2s ターミナル「救護ドローンを派遣」
//   1.8s ドローンの光が降りてきて、死体が浮き上がりはじめる
//   1.8s〜3.0s 白フェード
//   3.0s run_end() → 死亡画面

export const death_duration = 3
export const death_line_delay = 0.5
// BGM のテープストップ（回転落ち）の長さ。audio_music_death() が参照する
export const death_tape_stop_duration = 1.5

const notice_at = 1.2
const lift_at = 1.8
// 魂の煙が出る時刻。0.2 から 0.4 秒ごと、持ち上げの 1.8 秒まで。時刻を式
// （0.2 + 0.4n）から求めると 0.6 と 1.4 が二進で表せず 1 フレーム遅れるので、
// 数え上げではなくこの表と直接比較する
const smoke_times = [0.2, 0.6, 1.0, 1.4, lift_at]

// 死体の高さ。倒れた姿勢の 10 から、持ち上げ開始後に 60 まで直線で上がる
const body_y_rest = 10
const body_y_lifted = 60

// ドローンの光の高さ。0.4 秒で 120 から 40 へ降りて、そこに留まる
const drone_y_start = 120
const drone_y_hover = 40
const drone_descend_duration = 0.4

export interface death_beats_t {
  smoke: number // このフレームで湧かせる煙の数
  notice: boolean // ターミナル通知をこのフレームで出す
  done: boolean // シーケンス終了（run_end を呼ぶ）
}

export function death_beats(before: number, after: number): death_beats_t {
  return {
    // (before, after] に入った湧き時刻の数。フレームが粗くても取りこぼさない
    smoke: smoke_times.filter((t) => before < t && after >= t).length,
    notice: before < notice_at && after >= notice_at,
    done: before < death_duration && after >= death_duration,
  }
}

export function death_body_y(elapsed: number): number {
  const progress = Math.max(0, Math.min(1, (elapsed - lift_at) / (death_duration - lift_at)))
  return body_y_rest + (body_y_lifted - body_y_rest) * progress
}

export function death_drone_y(elapsed: number): number | null {
  if (elapsed < lift_at) { return null }
  const progress = Math.min(1, (elapsed - lift_at) / drone_descend_duration)
  return drone_y_start + (drone_y_hover - drone_y_start) * progress
}

// 白フェード。持ち上げ開始から終端へ直線で 0 → 1。「降りてきた白い光に
// 包まれて運ばれた」の完結で、機体を描かない表現（上記）は変えない
export function death_fade_opacity(elapsed: number): number {
  return Math.max(0, Math.min(1, (elapsed - lift_at) / (death_duration - lift_at)))
}
