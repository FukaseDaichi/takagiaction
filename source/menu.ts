import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { canvas, terminal_el } from './dom'
import {
  meta, meta_buy, meta_drain_factor, meta_max_level, meta_nicotine_max,
  meta_power_factor, meta_sniff_distance, meta_sniff_threshold,
  meta_spare_count, meta_upgrade_cost,
} from './meta'
import type { meta_upgrade_id_t } from './meta'
import { terminal_hide, terminal_show } from './terminal'

// 自席の端末から繋がる愛煙家の闇サイト。吸い殻（禁制品）を送ると
// 物資（火力・予備の一本）や怪しい訓練プログラム（肺活量・耐性・嗅覚）が
// 届く、という理屈で全項目を説明する（docs/story.md）。
// terminal_el の見た目をそのまま使うが、購入のたびに全文をタイピングし直すと
// 操作感が悪いので、メニューは DOM を直接組むクリック式にする。

interface menu_item_t {
  id: meta_upgrade_id_t
  name: string
  // 現在レベルまでの累積効果。段ごとの増分ではなく「今この行を持っていると
  // 何が起きるか」を書く。購入判断はこの 1 行だけが根拠になるので、Lv0 でも
  // 何が手に入るのかが分かる文にする
  describe: (level: number) => string
}

// 効果値は meta.ts の getter から引く。式を書き写すと、meta.ts 側の調整が
// meta.test.ts だけを更新してメニューの数字を古いまま取り残す。
// describe は常に現在レベルで呼ばれるので、引数なしでも getter で足りる。
// 係数の百分率は Math.round を通す（耐性の全強化は 1 - meta_drain_factor() が
// 浮動小数の丸め誤差で 0.30000000000000004 になり、100 倍すると
// 30.000000000000004 と表示されてしまう）
const menu_items: menu_item_t[] = [
  { id: 'lung', name: '肺活量', describe: () => '最大ゲージ ' + meta_nicotine_max() },
  {
    id: 'tolerance', name: 'ニコチン耐性',
    describe: () => '減少速度 -' + Math.round((1 - meta_drain_factor()) * 100) + '%',
  },
  {
    id: 'sniff', name: '嗅覚',
    describe: (lv) => lv === 0
      ? '未取得（ゲージ低下時に残り香の方向が分かるようになる）'
      : 'ゲージ' + Math.round(meta_sniff_threshold(lv) * 100) + '%以下で方向' +
        (meta_sniff_distance() ? '＋距離' : ''),
  },
  {
    id: 'power', name: '火力',
    describe: () => '射撃間隔 -' + Math.round((1 - meta_power_factor()) * 100) + '%',
  },
  {
    id: 'spare', name: '予備の一本',
    describe: () => 'ラン中 ' + meta_spare_count() + ' 回まで隠れて一服できる [E]',
  },
]

export function menu_show(on_start: () => void): void {
  canvas.style.opacity = '0.3'
  terminal_show()
  menu_render(on_start)
}

function menu_row(html: string, on_click?: () => void, dim = false): HTMLDivElement {
  const row = document.createElement('div')
  row.innerHTML = '&gt; ' + html
  if (on_click) {
    row.onclick = on_click
    // dim（残高不足）の行は meta_buy() が false を返すのでクリックしても何も
    // 起きない。ポインタまで出すと押せる行だと誤解させるので出さない
    if (!dim) { row.style.cursor = 'pointer' }
  }
  if (dim) { row.style.opacity = '0.4' }
  return row
}

function menu_render(on_start: () => void): void {
  terminal_el.innerHTML = ''
  terminal_el.appendChild(menu_row('闇サイト「Y-EXCHANGE」 接続確立'))
  terminal_el.appendChild(menu_row('ヤニ残高: ' + meta.yani))
  if (!meta.persistent) {
    terminal_el.appendChild(
      menu_row('警告: ストレージ利用不可。強化はこのセッション限りで消える'),
    )
  }
  terminal_el.appendChild(menu_row(' '))

  for (const item of menu_items) {
    const level = meta.levels[item.id]
    const maxed = level >= meta_max_level[item.id]
    const cost = meta_upgrade_cost(level)
    const label = item.name + ' Lv' + level + '/' + meta_max_level[item.id] +
      '（' + item.describe(level) + '） ' +
      (maxed ? 'MAX' : '[ヤニ ' + cost + ' で強化]')
    if (maxed) {
      terminal_el.appendChild(menu_row(label))
    } else {
      terminal_el.appendChild(menu_row(label, () => {
        if (meta_buy(item.id)) {
          audio_play(audio_sfx_pickup)
          menu_render(on_start)
        }
      }, meta.yani < cost))
    }
  }

  terminal_el.appendChild(menu_row(' '))
  terminal_el.appendChild(menu_row('[降下開始]', () => {
    audio_play(audio_sfx_beep)
    terminal_el.innerHTML = ''
    terminal_hide()
    canvas.style.opacity = '1'
    on_start()
  }))
}
