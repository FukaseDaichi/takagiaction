import { audio_play, audio_sfx_beep, audio_sfx_pickup } from './audio'
import { reward_available, reward_level } from './boss-reward-model'
import { key_spare, key_swap, keys } from './input'
import { meta, meta_max_level } from './meta'
import { state } from './state'
import { upgrade_rows } from './upgrade-rows'
import './boss-reward.css'

// ボス撃破の報酬。恒久強化 6 本から 1 本を 1 段上げる。
//
// Esc を持たない。「どれか必ず 1 段」なので辞退の経路を作らない。
// 選んだ段は state.boss_levels に積むだけで、meta へ入るのは run_end()。
// 効果がラン中に現れないことは見出しの直下に明記する。

let root: HTMLElement | null = null
let selected = 0

export function boss_reward_show(): void {
  state.paused = 1
  selected = first_available()

  if (!root) {
    root = document.createElement('div')
    root.id = 'br'
    document.body.appendChild(root)
  }
  render()
  root.style.display = 'grid'
  document.addEventListener('keydown', on_key)
  audio_play(audio_sfx_pickup)
}

function available(index: number): boolean {
  const id = upgrade_rows[index].id
  return reward_available(id, meta.levels[id], state.boss_levels)
}

function first_available(): number {
  for (let i = 0; i < upgrade_rows.length; i++) {
    if (available(i)) { return i }
  }
  return 0 // 呼び出し側が reward_any_available で弾いているので到達しない
}

// 上限の行は飛ばす。1 周しても見つからなければ動かさない
function move(step: number): void {
  for (let i = 0; i < upgrade_rows.length; i++) {
    selected = (selected + step + upgrade_rows.length) % upgrade_rows.length
    if (available(selected)) { break }
  }
  render()
}

function on_key(event: KeyboardEvent): void {
  const k = event.key
  if (k === 'ArrowUp' || k === 'ArrowLeft') {
    move(-1)
  } else if (k === 'ArrowDown' || k === 'ArrowRight') {
    move(1)
  } else if (k === 'Enter' && available(selected)) {
    close()
  }
}

function close(): void {
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'
  state.boss_levels.push(upgrade_rows[selected].id)
  audio_play(audio_sfx_beep)
  state.paused = 0
  // ポーズ中も input.ts のハンドラは生きているが _update() は飛ぶので、
  // エッジ検出のフラグだけが取り残される（equip-screen.ts と同じ理由）
  keys[key_spare] = 0
  keys[key_swap] = 0
}

function render(): void {
  let rows = ''
  for (let i = 0; i < upgrade_rows.length; i++) {
    const row = upgrade_rows[i]
    const level = reward_level(row.id, meta.levels[row.id], state.boss_levels)
    const maxed = !available(i)
    const stat = maxed
      ? '<b>MAX</b>'
      : '<b>' + row.value(level) + '</b> → ' +
        '<b style="color:' + row.color + '">' + row.value(level + 1) + '</b>'
    rows += '<div class="br-row' + (i === selected ? ' on' : '') +
      (maxed ? ' maxed' : '') + '" style="color:' + row.color + '">' +
      '<img src="' + row.icon + '" alt="">' +
      '<div class="br-name">' + row.name +
      '<small>' + row.stat + ' ・ Lv. ' + level + ' / ' + meta_max_level[row.id] +
      '</small></div>' +
      '<div class="br-stat">' + stat + '</div>' +
      '</div>'
  }

  root!.innerHTML = '<div class="br-box">' +
    '<div class="br-head">灰皿撤去ユニット 停止</div>' +
    '<div class="br-sub">押収データを 1 件だけ持ち出せる（次の潜行から有効）</div>' +
    rows +
    '<div class="br-keys">[↑↓] 選ぶ　[Enter] 決定</div>' +
    '</div>'
}
