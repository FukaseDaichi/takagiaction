// 恒久強化 6 行の表示定義。死亡画面（闇サイト）とボス撃破の報酬ダイアログの
// 両方が読む。同じ強化が 2 つの画面で別の書式になる余地を作らないため、
// 名前・色・フレーバー・効果の書式はここ 1 か所だけが持つ。
//
// 効果の数値は meta.ts の getter（段数を引数で受ける）から引き、式を
// 画面側に書き写さない（docs/meta-progression.md）。

import {
  meta_drain_factor, meta_nicotine_max, meta_power_factor, meta_spare_count,
  meta_speed_factor,
} from './meta'
import type { meta_upgrade_id_t } from './meta'
import { nicotine_stage_normal, player_speed } from './nicotine'

import icon_lung_url from '../m/ui/icon-lung.webp'
import icon_brain_url from '../m/ui/icon-brain.webp'
import icon_nose_url from '../m/ui/icon-nose.webp'
import icon_bullet_url from '../m/ui/icon-bullet.webp'
import icon_cig_url from '../m/ui/icon-cig.webp'
import icon_leg_url from '../m/ui/icon-leg.webp'

export interface upgrade_row_t {
  id: meta_upgrade_id_t
  name: string
  icon: string
  color: string
  flavor: string // 種別の一言。名前の隣に小さく出す
  stat: string // 効果のラベル。「現在値 → 次の段の値」の前に置く
  // 任意の段での効果値。現在値と次段プレビューの両方をこれで出す。
  // 式は meta.ts の getter（段数引数）から引き、画面側に書き写さない。
  // 例外は嗅覚行で、段ごとの解放名という人間向けラベルはここが持つ
  // （meta.ts は真偽値と数値の機構だけを公開する葉モジュールなので、
  // 呼び出し元 1 か所のためにラベルの getter を足さない）
  value: (level: number) => string
}

// 係数の百分率は Math.round を通す（耐性 Lv8 は 1 - meta_drain_factor() が
// 浮動小数の丸め誤差を持ち、100 倍すると 32.00000000000001 になってしまう）
export const upgrade_rows: upgrade_row_t[] = [
  {
    id: 'lung', name: '肺活量', icon: icon_lung_url, color: '#3ac6f0',
    flavor: '吸い方の訓練', stat: '最大ゲージ',
    value: (level) => String(meta_nicotine_max(level)),
  },
  {
    id: 'tolerance', name: 'ニコチン耐性', icon: icon_brain_url, color: '#a86df0',
    flavor: '我慢の訓練', stat: '減少速度',
    value: (level) => '-' + Math.round((1 - meta_drain_factor(level)) * 100) + '%',
  },
  {
    id: 'sniff', name: '嗅覚', icon: icon_nose_url, color: '#3af08a',
    flavor: '利き煙草。段ごとに嗅げるものが増える', stat: '解放',
    // 段ごとに別の能力が解放されるトラックなので、スカラーの「現在値」ではなく
    // その段で解放されるものの名前を出す。効果は累積で前の段の分は消えないが、
    // 行の形（現在値 → 次の段の値）はスカラー向けなので stat を「解放」にして読ませる
    value: (level) => [
      'なし', '位置', 'ゲージ60%以下', '道のり', '非常口', 'ドローン・箱',
    ][level],
  },
  {
    id: 'leg', name: '脚力', icon: icon_leg_url, color: '#f0568c',
    // 百分率ではなく速度そのものを出す（肺活量の「最大ゲージ 130」と同じ流儀）。
    // 基礎値 128 を書き写さないため player_speed() から引く
    flavor: '逃げ足の訓練', stat: '移動速度',
    value: (level) =>
      String(Math.round(player_speed(nicotine_stage_normal, meta_speed_factor(level)))),
  },
  {
    id: 'power', name: '火力', icon: icon_bullet_url, color: '#f0932a',
    flavor: '闇サイトから届く物資', stat: '射撃間隔',
    value: (level) => '-' + Math.round((1 - meta_power_factor(level)) * 100) + '%',
  },
  {
    id: 'spare', name: '予備の一本', icon: icon_cig_url, color: '#f0c93a',
    flavor: '闇サイトから届く物資。浅く吸える [E]', stat: '所持数',
    value: (level) => meta_spare_count(level) + '本',
  },
]
