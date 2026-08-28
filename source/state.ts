import type { entity_t } from './entity'
import type { entity_player_t } from './entity-player'
import type { meta_upgrade_id_t } from './meta'

// 実行時 import を持たないこと。型のみの import はコンパイル時に消えるため、
// このモジュールは依存グラフの葉になり循環参照の起点にならない。

export const level_width = 64
export const level_height = 64

// 非常口に触れてから次のフロアへ切り替わるまでの秒数。降下を予約する側
// （entity-exit.ts）と、残り時間をカウントダウンとして出す側（hud.ts）が
// 共有する。定数の置き場をここにするのは player_hp_max と同じ理由で、
// entity-exit.ts に置くと HUD が hud → entity-exit → entity-player という
// エンティティ側への依存を持つことになるため。
//
// ターミナルの通知が表示に要する時間からは独立させる。以前は
// terminal_show_notice() の戻り値をそのまま積んでいたので、文面を 1 行足す
// だけで降下が 1 秒延び、乗ってから 5 秒以上「何も起きない」時間が続いた。
export const descend_duration = 3

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
  // ポーズ中は 1。ゲーム内で唯一の時間停止で、game_tick が time_elapsed を
  // 0 にしてエンティティの更新と衝突判定を飛ばす。立てるのは押収品コンテナの
  // 開封ダイアログ（equip-screen.ts）とボス撃破の報酬ダイアログ
  // （boss-reward.ts）の 2 つ
  paused: 0,
  // 1 = 刃物を構えている（0 = 銃）。Tab で切り替わるラン状態で、フロアを
  // 跨いでは保持し、run_start() が 0 に戻す
  melee_active: 0,
  exit_open: 0, // 一服完了で 1。非常口が通れるようになる
  // ボスが生きている間は 1。一服を止めているのはこの 1 本だけで、機体の
  // 位置ではない — ボスは座席を離れて周回するので、灰皿が空いて見えても
  // 吸えない（entity-smoking-area.ts のガード。無反応にならないよう
  // monologue_boss_blocked() が理由を言う）。load_level が立て、
  // entity-boss の _kill() が下ろす
  boss_alive: 0,
  // 降下までの残り秒数（0 = 予約なし）。非常口に触れると descend_duration が
  // 入り、game_tick が減らして 0 で next_level() を呼ぶ。terminal のコールバックに
  // 載せると、演出中の別の通知が terminal_cancel() で予約ごと消してしまい
  // フロアが永久に詰む（レビュー Finding 1）
  descend_timer: 0,
  kills: 0,
  yani_run: 0, // このランで得たヤニ。run_end() が meta.yani に合算する
  // ボス撃破で選んだ恒久強化。ヤニ（yani_run）と同じで、run_end() が meta へ
  // 合算するまで meta.levels は書かない。ラン中に直接書くと、毎フレーム
  // meta.levels を読む 4 本（耐性・脚力・火力・嗅覚）だけが先に効いて、
  // 6 本の効き方が不揃いになる
  boss_levels: [] as meta_upgrade_id_t[],
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

  // ボス階の明転（boss-light-model.ts）。load_level が 0 に戻し、game_tick が
  // ボス階でだけ進める。闘技場が広く、通常フロアの霧では遠側のボスが黒く
  // 沈むため（docs/gameplay.md「ボス階」）
  boss_light_elapsed: 0,

  entity_player: null as entity_player_t | null,
  entities: [] as entity_t[],
  entities_to_kill: [] as entity_t[],
}
