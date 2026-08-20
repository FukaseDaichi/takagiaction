import type { entity_t } from './entity'
import type { entity_player_t } from './entity-player'

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

  // ラン状態。entity-smoking-area / entity-player / game / minimap / hud の
  // 複数モジュールから読み書きされるため、葉モジュールであるここに置く。
  depth: 0, // 到達フロア深度。最初のフロアが 1
  run_seed: 0, // ラン開始時に引く。フロアのシードは run_seed + depth * 7919
  nicotine: 100,
  nicotine_max: 100,
  smoking: 0, // 一服中は 1。移動と射撃をロックする
  exit_open: 0, // 一服完了で 1。非常口が通れるようになる
  kills: 0,

  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
