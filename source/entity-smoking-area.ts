import {
  audio_play, audio_sfx_beep, audio_sfx_door, audio_sfx_exhale,
  audio_sfx_lighter, audio_sfx_pickup,
} from './audio'
import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { spawn_smoke } from './entity-smoke'
import {
  monologue_all_done, monologue_complete, monologue_dummy, monologue_interrupt,
} from './monologue'
import { push_block, push_light, push_sprite } from './renderer'
import {
  complete_beats, ignite_flash_duration, smoke_puffs,
} from './smoking-sequence-model'
import { state } from './state'
import { terminal_show_notice } from './terminal'

// 一服にかかる時間（秒）。この間ずっと触れ続けないと非常口は開かない。
const smoking_duration = 2.5

// アトラス上の割り当て（tools/atlas.py が 33〜38 に焼き込む）。
// 側面タイルは 8/9/17 以外であること — push_block はその3つだけ高さ16にする。
// スタンド灰皿は低い方（高さ8）で描く。
const tile_ashtray_top = 33
const tile_ashtray_side = 34
const tile_removed_top = 35
const tile_removed_side = 36
const tile_sign = 37

export class entity_smoking_area_t extends entity_t {
  // 本物なら true、ダミー（灰皿撤去済み）なら false。
  // サブクラスのフィールド初期化子は基底 constructor（＝ _init）の後に走るので、
  // _init() 経由では渡せない（渡しても undefined で潰される）。生成側が代入する。
  is_real = false

  private _touching = false
  private _was_smoking = false
  private _progress = 0
  // minimap.ts が「残り香が残っているか」（嗅覚の目標になるか）を読むため公開
  _done = false
  private _hp_mark = 0
  private _animation_time = 0
  private _smoke_timer = 0
  // 着火フラッシュの経過秒。負なら非表示
  private _flash_time = -1
  // 完了後の因果タイムライン（感知器 → 防災扉）の経過秒。負なら停止中
  private _complete_elapsed = -1
  // 中断直後の 1 フレームは touching が真のままなので、何もせず再武装だけ
  // 抑止するためのフラグ。接触が切れるまで解除しない（_advance 参照）。
  private _needs_release = false

  override _check(other: entity_t): void {
    if (other instanceof entity_player_t) { this._touching = true }
  }

  // ダミーだと開示済みか。minimap が灰色化に使う
  get revealed_dummy(): boolean {
    return this._done && !this.is_real
  }

  // game_tick は「エンティティ i の _update → i より後ろとの衝突判定 → i の _render」
  // の順に回す。i より前のエンティティからの _check は i の反復より先に済んでいるので、
  // _render の時点で _touching はこのフレームの接触結果として完成している。
  // エンティティの添字順に依存せず判定できるのはここだけ。
  override _render(): void {
    this._animation_time += state.time_elapsed

    // 一服完了後の本物は煙を出し続ける。「もう吸える場所ではない」ではなく
    // 「たった今誰かが吸った」ことが見た目で分かる
    if (this._done && this.is_real) {
      this._smoke_timer -= state.time_elapsed
      if (this._smoke_timer <= 0) {
        this._smoke_timer = 0.5
        spawn_smoke(this.x + 4, this.z + 4)
      }
    }

    // 完了後の因果タイムライン: 吸う → 感知される → 扉が動く、を耳で追わせる。
    // game_running が落ちたら進めない — リザルト表示中の terminal_show_notice() は
    // death_screen_show() が止めたターミナルの表示チェーンを再び動かしてしまう。
    // dying も見る — 死亡シーケンスの 3 秒間は game_running がまだ 1 のままなので
    // （run_end() は 3 秒後）、見ないと感知器の通知が「救護ドローンを派遣」の
    // 表示チェーンを潰す
    if (this._complete_elapsed >= 0 && state.game_running && !state.dying) {
      const elapsed_before = this._complete_elapsed
      this._complete_elapsed += state.time_elapsed
      const beats = complete_beats(elapsed_before, this._complete_elapsed)
      if (beats.detector) {
        audio_play(audio_sfx_beep)
        terminal_show_notice('煙を感知___非常口のロックが解除された')
      }
      if (beats.door) {
        audio_play(audio_sfx_door)
        this._complete_elapsed = -1 // 終端。以後このタイムラインは動かない
      }
    }

    // 着火フラッシュ。_advance が立てた次のフレームから 0.3 秒だけ強く光る
    if (this._flash_time >= 0) {
      this._flash_time += state.time_elapsed
      if (this._flash_time >= ignite_flash_duration) { this._flash_time = -1 }
    }

    const revealed = this.revealed_dummy
    push_block(
      this.x, this.z,
      revealed ? tile_removed_top : tile_ashtray_top,
      revealed ? tile_removed_side : tile_ashtray_side,
    )
    // 標識は灰皿の右脇。開示後は撤去告知の貼り紙に変わる
    push_sprite(this.x + 9, 0, this.z + 1, revealed ? tile_removed_side : tile_sign)
    if (!revealed) {
      push_light(
        this.x + 4, 4, this.z + 12,
        1.0, 0.6, 0.1,
        this._flash_time >= 0 ? 0.012
          : this._done ? 0.08
            : 0.03 + Math.sin(this._animation_time * 3) * 0.01,
      )
    }

    const touching = this._touching
    this._touching = false

    // 接触が切れたら再武装の待ちを解除する。中断直後は _progress が 0 に
    // 戻っているため、ここで待たせておかないと同じ場所に立ったまま
    // 次のフレームで即座に再武装してしまう（レビュー Finding 2）。
    if (!touching) {
      this._needs_release = false
    }

    let smoking = false
    // state.game_running: ラン終了後に terminal_show_notice() を呼ぶと、run_end() が
    // death_screen_show() で止めたターミナルの表示チェーンを再び動かしてしまう
    // （レビュー Finding 1）。state.dying: 死亡シーケンス中（game_running はまだ 1）に
    // 死体が一服を始めない・中断のセリフを出さないため。
    // state.boss_alive: ボス階の灰皿にはボスが居座っている。倒すまで
    // 吸わせない（docs/gameplay.md「ボス階」）
    if (touching && !this._done && !this._needs_release &&
        state.game_running && !state.dying && !state.boss_alive) {
      if (this.is_real) {
        smoking = this._advance()
      } else {
        this._take_dummy()
      }
    }

    // 移動と射撃のロック。自分が持っていたロックだけを解放する
    if (smoking) {
      state.smoking = 1
    } else if (this._was_smoking) {
      state.smoking = 0
    }
    this._was_smoking = smoking
  }

  // 戻り値は「吸い続けているか」。完了・中断のフレームでは false になり、
  // 次のフレームから移動と射撃が戻る。
  private _advance(): boolean {
    const player = state.entity_player!

    // 着火。ライターの音とフラッシュは吸い始めの 1 フレームだけ
    if (this._progress === 0) {
      this._hp_mark = player.h
      audio_play(audio_sfx_lighter)
      this._flash_time = 0
    }

    // 被弾で中断。進捗は 0 に戻るが _done は立てないので吸い直せる。
    // 中断で喫煙所を消費すると非常口が永久に開かず、ゲージが尽きるまで
    // 何もできない詰み状態が発生する。
    if (player.h < this._hp_mark) {
      this._progress = 0
      this._flash_time = -1
      // 一服中は自機の速度を強制的にゼロにしている。接触が切れるまで
      // 再武装させないと、動けないまま押さえ込まれ続けて詰む。
      this._needs_release = true
      monologue_interrupt()
      return false
    }

    const progress_before = this._progress
    this._progress += state.time_elapsed
    // 吸引中の煙。高木の位置から立ちのぼる（魂の煙・完了後の煙と同じ見た目 =
    // 世界観の追加説明が要らない）
    for (let i = smoke_puffs(progress_before, this._progress); i > 0; i--) {
      spawn_smoke(player.x, player.z)
    }
    // 吸っている間ずっと回復するので「吸えた時間に比例」が自然に満たされる。
    // 2.5 秒で満タンになる速度。中断が事故ではなく判断のグラデーションになる。
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + (state.nicotine_max / smoking_duration) * state.time_elapsed,
    )

    if (this._progress >= smoking_duration) {
      this._complete()
      return false
    }
    return true
  }

  private _complete(): void {
    const player = state.entity_player!
    this._done = true
    state.smoke_count++
    state.nicotine = state.nicotine_max
    player.h = Math.min(player.h + 1, 5)
    // 開通は演出を待たない。ここを遅らせると完了直後の死亡や降下との
    // 相互作用が生まれ、演出のためにコアループへ摩擦を足すことになる
    state.exit_open = 1
    // 吐き出し。感知器の音と通知は _render のタイムライン（0.8 秒後）が出す。
    // 煙の軌道は生成位置から決定的なので、同座標に 3 つ出すと重なって
    // 1 つにしか見えない。x をずらして生成する
    audio_play(audio_sfx_exhale)
    for (let i = 0; i < 3; i++) { spawn_smoke(player.x - 3 + i * 3, player.z) }
    this._complete_elapsed = 0
    monologue_complete()
  }

  // ダミーは回復手段ではなく「歩いた時間の損」。5% は深度 21 なら 2.7 秒ぶんで、
  // 実質ゼロ。回復ではなくペナルティとして設計されている。
  private _take_dummy(): void {
    this._done = true
    state.dummy_count++
    state.nicotine = Math.min(
      state.nicotine_max,
      state.nicotine + state.nicotine_max * 0.05,
    )
    audio_play(audio_sfx_pickup)
    // このフロアの喫煙所（本物 + ダミー）が全部 _done なら、ハズレ告知の
    // 代わりに「もう無い」を出して非常口へ向かわせる。この状態では本物で
    // 一服済み（＝非常口が開いている）ので文言と状況が矛盾しない。
    // 本物側（_complete）では分岐しない — 誘導はロック解除通知が担う。
    if (state.entities.every(
      (e) => !(e instanceof entity_smoking_area_t) || e._done,
    )) {
      monologue_all_done()
    } else {
      monologue_dummy()
    }
  }
}
