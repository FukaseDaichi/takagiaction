import { describe, expect, it } from 'vitest'
import {
  death_cause_nicotine, death_message, format_run_time, is_new_record,
  ds_idle_descend, ds_idle_gear, ds_idle_record, ds_initial_state,
  ds_item_layer, ds_part_count, ds_part_layer, ds_reduce,
} from './death-screen-model'
import type { ds_state_t } from './death-screen-model'

describe('生存時間の表示', () => {
  it('mm:ss で秒は 2 桁にする', () => {
    expect(format_run_time(0)).toBe('0:00')
    expect(format_run_time(59.9)).toBe('0:59')
    expect(format_run_time(767)).toBe('12:47')
  })

  it('負値は 0:00 に丸める', () => {
    expect(format_run_time(-1)).toBe('0:00')
  })
})

describe('死因メッセージ', () => {
  // 赤い状態パネルを消したので、死因の区別が残るのは見出しだけになる
  it('敵に殺されたときは既定の見出しを返す', () => {
    expect(death_message(0)).toBe('死亡したよ、高木。')
  })

  it('ニコチン切れは別の見出しで死因が分かる', () => {
    expect(death_message(death_cause_nicotine)).toBe('ニコチン、限界です。')
  })
})

describe('ニューレコード判定', () => {
  it('旧ベストを超えたら更新', () => {
    expect(is_new_record(21, 15)).toBe(true)
  })

  it('同値は更新ではない', () => {
    expect(is_new_record(15, 15)).toBe(false)
  })

  it('下回ったら更新ではない', () => {
    expect(is_new_record(9, 15)).toBe(false)
  })

  // 初回のランで 1F に届いただけの記録を「更新」として祝うと演出の意味が薄れる
  it('旧ベスト 0（未プレイ）では更新にしない', () => {
    expect(is_new_record(1, 0)).toBe(false)
    expect(is_new_record(99, 0)).toBe(false)
  })
})

// テストごとに開始状態を組み立てる。入場シーケンスが終わった直後（busy = false）
// を既定にする
function idle(over: Partial<ds_state_t> = {}): ds_state_t {
  return { ...ds_initial_state(), busy: false, ...over }
}

describe('死亡画面の状態機械', () => {
  it('初期状態は idle・地下へ戻るにフォーカス・入場中は busy', () => {
    const s = ds_initial_state()
    expect(s.mode).toBe('idle')
    expect(s.focus).toBe(ds_idle_descend)
    expect(s.panel).toBe('none')
    expect(s.busy).toBe(true)
  })

  it('busy 中はどのキーも状態を変えない', () => {
    const s = idle({ busy: true })
    for (const key of ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown']) {
      const r = ds_reduce(s, key)
      expect(r.state).toBe(s)
      expect(r.action).toBe('none')
    }
  })

  it('Tab で強化モードへ入り、先頭の部位を選ぶ', () => {
    const r = ds_reduce(idle(), 'Tab')
    expect(r.state.mode).toBe('upgrade')
    expect(r.state.focus).toBe(0)
  })

  it('Tab をもう一度押すと idle へ戻り、地下へ戻るへフォーカスが載る', () => {
    const r = ds_reduce(idle({ mode: 'upgrade', focus: 3 }), 'Tab')
    expect(r.state.mode).toBe('idle')
    expect(r.state.focus).toBe(ds_idle_descend)
  })

  it('idle の矢印は 3 項目を巡回する', () => {
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'ArrowDown').state.focus)
      .toBe(ds_idle_gear)
    // 末尾から前へ回り込む
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'ArrowUp').state.focus)
      .toBe(ds_idle_descend)
  })

  it('強化モードの矢印は 6 部位を解剖順に巡回する', () => {
    expect(ds_reduce(idle({ mode: 'upgrade', focus: 5 }), 'ArrowDown').state.focus).toBe(0)
    expect(ds_reduce(idle({ mode: 'upgrade', focus: 0 }), 'ArrowUp').state.focus)
      .toBe(ds_part_count - 1)
  })

  it('← ↑ と → ↓ は同じ向きに動く', () => {
    const s = idle({ mode: 'upgrade', focus: 2 })
    expect(ds_reduce(s, 'ArrowLeft').state.focus).toBe(ds_reduce(s, 'ArrowUp').state.focus)
    expect(ds_reduce(s, 'ArrowRight').state.focus).toBe(ds_reduce(s, 'ArrowDown').state.focus)
  })

  it('idle の Enter は、フォーカス位置ごとに違うことをする', () => {
    expect(ds_reduce(idle({ focus: ds_idle_record }), 'Enter').state.panel).toBe('record')
    expect(ds_reduce(idle({ focus: ds_idle_gear }), 'Enter').state.panel).toBe('gear')
    expect(ds_reduce(idle({ focus: ds_idle_descend }), 'Enter').action).toBe('descend')
  })

  it('強化モードの Enter は購入を要求する（状態は動かない）', () => {
    const s = idle({ mode: 'upgrade', focus: 2 })
    const r = ds_reduce(s, 'Enter')
    expect(r.action).toBe('buy')
    expect(r.state.focus).toBe(2)
    expect(r.state.mode).toBe('upgrade')
  })

  // Esc は「1 段戻る」。この 3 段の順序がこの画面の操作の背骨になる
  it('Esc はパネル → 強化モード → 降下 の順に 1 段ずつ戻る', () => {
    const opened = idle({ mode: 'upgrade', focus: 2, panel: 'record' })
    const closed = ds_reduce(opened, 'Escape')
    expect(closed.state.panel).toBe('none')
    expect(closed.state.mode).toBe('upgrade') // 強化モードは維持される
    expect(closed.action).toBe('none')

    const collapsed = ds_reduce(closed.state, 'Escape')
    expect(collapsed.state.mode).toBe('idle')
    expect(collapsed.action).toBe('none')

    expect(ds_reduce(collapsed.state, 'Escape').action).toBe('descend')
  })

  it('パネル表示中は Esc 以外を受け付けない', () => {
    const s = idle({ panel: 'record' })
    for (const key of ['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const r = ds_reduce(s, key)
      expect(r.state).toBe(s)
      expect(r.action).toBe('none')
    }
  })

  it('知らないキーは何もしない', () => {
    const s = idle()
    expect(ds_reduce(s, 'a').state).toBe(s)
  })
})

describe('強調階層', () => {
  it('強化モードでは選択部位だけが active、残りは dim', () => {
    const s = idle({ mode: 'upgrade', focus: 3 })
    expect(ds_part_layer(s, 3)).toBe('active')
    expect(ds_part_layer(s, 0)).toBe('dim')
  })

  // idle で部位を inactive にすると、この画面の主役が沈んでしまう。
  // 触れないが「押せそう」に見えている必要がある
  it('idle では部位はどれも dim で、active にはならない', () => {
    const s = idle()
    for (let i = 0; i < ds_part_count; i++) { expect(ds_part_layer(s, i)).toBe('dim') }
  })

  it('idle では選択項目が active、残りは dim', () => {
    const s = idle({ focus: ds_idle_gear })
    expect(ds_item_layer(s, ds_idle_gear)).toBe('active')
    expect(ds_item_layer(s, ds_idle_record)).toBe('dim')
  })

  it('強化モードでは記録確認と装備確認が inactive へ落ちる', () => {
    const s = idle({ mode: 'upgrade', focus: 0 })
    expect(ds_item_layer(s, ds_idle_record)).toBe('inactive')
    expect(ds_item_layer(s, ds_idle_descend)).toBe('inactive')
  })

  it('パネル表示中は部位も項目もすべて inactive', () => {
    const s = idle({ panel: 'gear' })
    expect(ds_part_layer(s, 0)).toBe('inactive')
    expect(ds_item_layer(s, ds_idle_descend)).toBe('inactive')
  })
})
