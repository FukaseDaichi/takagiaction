import {
  nicotine_stage_edgy, nicotine_stage_limit, nicotine_stage_withdrawal,
} from './nicotine'

// HUD の表示条件。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（death-screen-model.ts と同じ扱い）。
//
// HUD の設計は「安全なときは黙り、危険が近づくほど喋る」。常設はタバコ（ゲージ）と
// ミニマップだけで、他は判断が要る瞬間だけ現れる。**表示されていること自体が警告**
// なので、ラベルを付けずに済む。何が出るかの判断はすべてこのモジュールに集める。

// 百分率。通常帯（60% 超）では出さない。一服中は通常帯でも出して、回復量を
// 数字で見せる（一服は 2.5 秒の固定時間で、その間プレイヤーに操作権がない）
export function hud_percent_visible(stage: number, smoking: number): boolean {
  return stage >= nicotine_stage_edgy || smoking !== 0
}

// 予備の一本の [E]。離脱症状帯に入ったら「いま使え」の合図として点灯する
export function hud_spare_urgent(stage: number): boolean {
  return stage >= nicotine_stage_withdrawal
}

// 満タンに戻ってから HP を隠すまでの猶予（秒）。即座に消すと、回復した瞬間に
// 目的の表示が消えて「回復できたのか」の確認ができない
export const hp_reveal_hold = 3

export interface hp_reveal_t {
  visible: boolean
  hold: number // 残り猶予（秒）。0 で非表示に落ちる
}

export function hp_reveal_idle(): hp_reveal_t {
  return { visible: false, hold: 0 }
}

// 削られている間と限界帯では出し続け、満タンに戻ったら hp_reveal_hold 秒で消す。
// 限界帯を条件に含めるのは、ゲージ 0% では次に減るのが HP そのものだから
// （2 秒ごとに 1 減る、docs/gameplay.md）。最初の被弾を待つと手遅れになる。
export function hp_reveal_step(
  prev: hp_reveal_t, hp: number, hp_max: number, stage: number, dt: number,
): hp_reveal_t {
  if (hp < hp_max || stage === nicotine_stage_limit) {
    return { visible: true, hold: hp_reveal_hold }
  }
  const hold = prev.hold - dt
  return hold > 0 ? { visible: true, hold } : { visible: false, hold: 0 }
}

// 武器スロット。刃物を 1 本も持っていない間は出さない（持ち替える先が無い）。
// 構えている側がラン中に行動を変えられる値なので、常設の除外規約
// （所持ヤニ・撃破数などは出さない）には触れない
export function hud_weapon_visible(blade_tier: number): boolean {
  return blade_tier > 0
}

// 非常口の通過カウントダウンに出す整数の秒。残り時間をそのまま切り捨てると
// 予約した瞬間（残り 3.0）に「3」ではなく「2」から始まり、最後の 1 秒が
// 「0」になる。切り上げると 3 → 2 → 1 が 1 秒ずつ均等に出て、0 は出ない。
export function descend_seconds(timer: number): number {
  return Math.max(1, Math.ceil(timer))
}
