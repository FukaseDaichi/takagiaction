import type { entity_t } from './entity'

// 実行時 import を持たないこと。型のみの import はコンパイル時に消えるため、
// このモジュールは依存グラフの葉になり循環参照の起点にならない。

export const level_width = 64
export const level_height = 64

// 中身を書き換えるのみで再代入されないため const で公開できる
export const level_data = new Uint8Array(level_width * level_height)

// モジュール境界を越えて再代入されるものはオブジェクトのプロパティにする。
// ESM では import した束縛そのものに代入できない。
export const state = {
  time_elapsed: 0,
  game_running: 0,
  current_level: 0,
  cpus_total: 0,
  cpus_rebooted: 0,
  // Task 5 で entity_player_t | null に狭める
  entity_player: null as entity_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
