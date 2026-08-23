import { audio_play, audio_sfx_pickup } from './audio'
import { entity_t } from './entity'
import { entity_drone_t } from './entity-drone'
import { entity_player_t } from './entity-player'
import { push_light } from './renderer'
import { state } from './state'

// 吸い殻。拾うと _value ぶんのヤニが増える。meta への合算は run_end() が行う。
// スプライトは 26（HP バーと同じ白点）を火種に見立て、専用の絵は用意しない
export class entity_yani_t extends entity_t {
  // 1 個あたりの価値。清掃ドローンの撃破ドロップだけが 1 より大きい値を入れる
  // （深度 × 30 を 30 個に割るため。docs/enemies.md「清掃ドローン」）。
  // 代入は生成後に行う — _init() は基底のフィールドにしか書けない（entity.ts）
  _value = 1

  override _check(other: entity_t): void {
    // state.game_running: ニコチン切れの継続ダメージで死ぬと、run_end() は
    // エンティティのループより前（game_tick の冒頭）で state.yani_run を meta へ
    // 合算して保存し終えている。そのあとに増やしても黙って捨てられるだけなので、
    // 拾わせない（entity-exit / entity-smoking-area と同じ理由）
    if (state.game_running && other instanceof entity_player_t) {
      this._kill()
      state.yani_run += this._value
      audio_play(audio_sfx_pickup)
    }

    // 清掃ドローンに回収される。プレイヤーと同フレームで触れたときは
    // 先に処理された側が取る（_dead ガードで二重には数えない）
    else if (!this._dead && other instanceof entity_drone_t) {
      this._kill()
      other._collect()
    }
  }

  override _render(): void {
    super._render()
    // 弱いオレンジの光で、暗い床でも吸い殻の火種として見つけられるようにする
    push_light(this.x, 2, this.z + 4, 1.0, 0.4, 0.1, 0.3)
  }
}
