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
//   3.0s run_end() → 死亡画面

export const death_duration = 3
export const death_line_delay = 0.5
// BGM のテープストップ（回転落ち）の長さ。audio_music_death() が参照する
export const death_tape_stop_duration = 1.5

const notice_at = 1.2
const lift_at = 1.8
const smoke_first_at = 0.2
const smoke_interval = 0.4

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

// (before, after] に含まれる煙の湧き時刻の数。持ち上げ開始後は湧かない
function smoke_count_until(t: number): number {
  const capped = Math.min(t, lift_at)
  if (capped < smoke_first_at) { return 0 }
  return Math.floor((capped - smoke_first_at) / smoke_interval) + 1
}

export function death_beats(before: number, after: number): death_beats_t {
  return {
    smoke: smoke_count_until(after) - smoke_count_until(before),
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
