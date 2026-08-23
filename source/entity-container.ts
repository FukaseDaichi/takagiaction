import { entity_t } from './entity'
import { entity_player_t } from './entity-player'
import { equip_screen_show } from './equip-screen'
import { gear_grade, gear_lights } from './equipment'
import type { gear_slot_t } from './equipment'
import { push_light } from './renderer'
import { state } from './state'

// 押収品コンテナ。セントリー（禁煙監視ロボ）が施設内で押収した禁制品を内蔵
// しており、撃破で 30% 落ちる。
//
// 床に落ちる walk-over にしてあるのは、開封で入るポーズのタイミングを
// プレイヤーに選ばせるため。深度 20 では 1 フロアに 3 個落ちるので、撃破の
// 瞬間に自動でダイアログが割り込む形だと戦闘が寸断される。
export class entity_container_t extends entity_t {
  // 中身は落下時に確定させる。代入は生成後に行う — _init() には基底クラスの
  // フィールドしか書けない（entity.ts）
  _slot: gear_slot_t = 'blade'
  _tier = 1

  override _check(other: entity_t): void {
    // smoking: コンテナは撃破位置に落ちるので、本物の喫煙所やダミーの上に
    // 重なりうる。game_running: リザルト表示中だけの除外（entity-yani.ts と
    // 同じ理由）。死亡シーケンス中（state.dying）はまだ 1 のままなので、
    // 死体の除外は game.ts の衝突ループの corpse スキップが担う。
    // equipping: 同じフレームで 2 個踏んだときの二重開封
    if (
      state.game_running && !state.smoking && !state.equipping &&
      other instanceof entity_player_t
    ) {
      this._kill()
      // 触れた瞬間の拾得音は鳴らさない。equip_screen_show() の解錠音
      // （audio_sfx_door）で無音にはならず、開封の当たり音（reveal() の
      // audio_sfx_pickup）と 2 回重ならずに済む
      equip_screen_show(this._slot, this._tier)
    }
  }

  override _render(): void {
    super._render()
    // 予告灯。中身は落ちた時点で確定しているので、等級色で先に見せる。
    // 暗いフロアの向こうに金色が見えたら銘品 — 「あれは取りに行く価値があるか」
    // がフロアを横断する判断になる（docs/gameplay.md「明滅は行き先を意味する」
    // と同じ、1 ビットで判断を作る形）
    const light = gear_lights[gear_grade(this._tier)]
    push_light(this.x, 3, this.z + 4, light[0], light[1], light[2], 0.12)
  }
}
