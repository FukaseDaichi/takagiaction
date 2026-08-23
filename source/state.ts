import type { entity_t } from './entity'
import type { entity_player_t } from './entity-player'

// 実行時 import を持たないこと。型のみの import はコンパイル時に消えるため、
// このモジュールは依存グラフの葉になり循環参照の起点にならない。

export const level_width = 64
export const level_height = 64

// 自機の HP 上限。load_level() が自機を生成する値であり、HUD の HP ブロック数と
// 死亡画面の「n / 5」も同じ数字を読む。定数の置き場をここにするのは、
// entity-player.ts に置くと死亡画面が
// death-screen → entity-player → game → death-screen の循環に入るため
export const player_hp_max = 5

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
  // 押収品コンテナの開封ダイアログ中は 1。ゲーム内で唯一のポーズで、
  // game_tick が time_elapsed を 0 にしてエンティティの更新と衝突判定を飛ばす
  // （equip-screen.ts が立てて下ろす）
  equipping: 0,
  exit_open: 0, // 一服完了で 1。非常口が通れるようになる
  // 降下までの残り秒数（0 = 予約なし）。非常口に触れると通過演出の長さが入り、
  // game_tick が減らして 0 で next_level() を呼ぶ。terminal のコールバックに
  // 載せると、演出中の別の通知が terminal_cancel() で予約ごと消してしまい
  // フロアが永久に詰む（レビュー Finding 1）
  descend_timer: 0,
  kills: 0,
  yani_run: 0, // このランで得たヤニ。run_end() が meta.yani に合算する
  spares_left: 0, // 予備の一本の残数。run_start() が強化レベルから設定する
  run_time: 0, // このランの経過秒数。game_tick が game_running 中のみ加算する
  smoke_count: 0, // 一服の回数。喫煙所での完了と予備の一本の使用で 1 ずつ増える
  dummy_count: 0, // 踏んだダミーの数。_take_dummy は _done ガードで同一個体 1 度しか走らない
  death_cause: 0, // 0 = 敵、1 = ニコチン切れ。_receive_withdrawal_damage が死亡時に立てる
  // 死亡シーケンス（death-sequence-model.ts）。dying はプレイヤーの _kill() が立て、
  // game_tick が death_elapsed を進めてビートを発火し、3 秒後に run_end() を呼ぶ。
  // シーケンス中も死体を描き続けるため、自機は _dead にしない
  dying: 0,
  death_elapsed: 0,

  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
