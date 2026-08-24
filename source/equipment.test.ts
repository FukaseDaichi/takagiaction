import { describe, expect, it } from 'vitest'
import {
  blade_arc, blade_damage, blade_interval, blade_oneshot_all, blade_oneshot_drone,
  blade_oneshot_level, blade_oneshot_spider, blade_reach, drain_floor, gear_grade,
  gear_grades, gear_lights, gear_max_tier, gear_name, gear_roll_center,
  gear_recommend_keep, gear_roll_slot, gear_roll_tier, gear_scrap_value, gear_slots,
  gear_stats, gear_verdict, gear_verdict_labels, patch_drain_bonus, sole_speed_bonus,
} from './equipment'

describe('品目表', () => {
  it('3 系統それぞれに 10 段ぶんの品名がある', () => {
    for (const slot of gear_slots) {
      for (let tier = 1; tier <= gear_max_tier; tier++) {
        expect(gear_name(slot, tier)).toBeTruthy()
      }
    }
  })

  it('品名は系統の中で重複しない', () => {
    for (const slot of gear_slots) {
      const names = []
      for (let tier = 1; tier <= gear_max_tier; tier++) { names.push(gear_name(slot, tier)) }
      expect(new Set(names).size).toBe(gear_max_tier)
    }
  })
})

describe('等級', () => {
  it('10 段を 2 段ずつ 5 等級に丸める', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gear_grade))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('等級は 5 つで、予告灯の色も 5 つある', () => {
    expect(gear_grades.length).toBe(5)
    expect(gear_lights.length).toBe(5)
  })
})

describe('刃物', () => {
  // Lv1 の射程はエンティティ同士の重なり判定 9px とほぼ同じ（触れる距離でしか
  // 当たらない）、Lv10 はセントリーの停止距離 24 そのもの
  it('射程は 9.6 から 24 まで伸びる', () => {
    expect(blade_reach(1)).toBeCloseTo(9.6)
    expect(blade_reach(10)).toBeCloseTo(24)
  })

  it('振り間隔は 0.93 秒から 0.30 秒まで縮む', () => {
    expect(blade_interval(1)).toBeCloseTo(0.93)
    expect(blade_interval(10)).toBeCloseTo(0.3)
  })

  it('半角は ±22° から ±69° まで開く', () => {
    expect(blade_arc(1) * 180 / Math.PI).toBeCloseTo(22.3, 1)
    expect(blade_arc(10) * 180 / Math.PI).toBeCloseTo(68.8, 1)
  })

  // 全段を一撃必殺にするとレア度に載せる軸が残らないので、対象を段で広げる
  it('一撃必殺の対象は Lv5 と Lv9 で広がる', () => {
    expect([1, 4].map(blade_oneshot_level)).toEqual([blade_oneshot_spider, blade_oneshot_spider])
    expect([5, 8].map(blade_oneshot_level)).toEqual([blade_oneshot_drone, blade_oneshot_drone])
    expect([9, 10].map(blade_oneshot_level)).toEqual([blade_oneshot_all, blade_oneshot_all])
  })

  it('一撃にならない相手へのダメージは段そのもの', () => {
    expect(blade_damage(8)).toBe(8)
  })
})

describe('パッシブ', () => {
  // 素の足 128 + 25 = 153 が清掃ドローンの逃走終端速度 150 をちょうど超える
  it('ソール Lv10 は素の足だけで清掃ドローンを追い越させる', () => {
    expect(sole_speed_bonus(10)).toBeCloseTo(25)
    expect(128 + sole_speed_bonus(10)).toBeGreaterThan(150)
    expect(128 + sole_speed_bonus(8)).toBeLessThan(150)
  })

  it('パッチ Lv10 は減少速度を 0.30 引く', () => {
    expect(patch_drain_bonus(10)).toBeCloseTo(0.3)
  })

  it('減算後の下限を持つ', () => {
    expect(drain_floor).toBe(0.15)
  })
})

describe('抽選', () => {
  it('中心は深度で上がり、深度 30 で頭打ちになる', () => {
    expect(gear_roll_center(1)).toBeCloseTo(1.3)
    expect(gear_roll_center(20)).toBeCloseTo(7)
    expect(gear_roll_center(30)).toBeCloseTo(10)
    expect(gear_roll_center(100)).toBeCloseTo(10)
  })

  it('roll の両端が段の両端になる', () => {
    expect(gear_roll_tier(1, 0)).toBe(1)
    expect(gear_roll_tier(1, 0.999999)).toBe(10)
  })

  // どの深度でも全段に非ゼロの重みを残す（深度 1 で最上位が出うることが
  // 「潜る」動機の一部）
  it('深度 1 でも最上位が出る', () => {
    let seen = false
    for (let i = 0; i < 1000; i++) {
      if (gear_roll_tier(1, i / 1000) === 10) { seen = true }
    }
    expect(seen).toBe(true)
  })

  it('深いほど高い段が出やすい', () => {
    const count = (depth: number) => {
      let n = 0
      for (let i = 0; i < 1000; i++) { if (gear_roll_tier(depth, i / 1000) >= 8) { n++ } }
      return n
    }
    expect(count(30)).toBeGreaterThan(count(20))
    expect(count(20)).toBeGreaterThan(count(1))
  })

  it('系統は等確率で 3 つに割れる', () => {
    expect(gear_roll_slot(0)).toBe('blade')
    expect(gear_roll_slot(0.5)).toBe('sole')
    expect(gear_roll_slot(0.99)).toBe('patch')
    expect(gear_roll_slot(1)).toBe('patch') // 境界で配列外に出ない
  })
})

describe('ヤニ換算', () => {
  it('既存の強化価格曲線の二次項 5lv² そのもの', () => {
    expect([1, 5, 10].map(gear_scrap_value)).toEqual([5, 125, 500])
  })
})

describe('差分行', () => {
  it('刃物は 4 行、パッシブは 1 行', () => {
    expect(gear_stats('blade', 5).length).toBe(4)
    expect(gear_stats('sole', 5).length).toBe(1)
    expect(gear_stats('patch', 5).length).toBe(1)
  })

  // rank は「大きいほうが良い」で統一する。振り間隔だけ符号を反転させて
  // 揃えてあるので、比較側は符号の向きを知らなくてよい
  it('rank は段が上がると必ず上がる', () => {
    for (const slot of gear_slots) {
      const low = gear_stats(slot, 3)
      const high = gear_stats(slot, 9)
      for (let i = 0; i < low.length; i++) {
        expect(high[i].rank).toBeGreaterThan(low[i].rank)
      }
    }
  })

  // 「一撃」の rank は段そのものではなく一撃必殺の解放段（blade_oneshot_level）
  // を使う。段 9 と段 10 はどちらも blade_oneshot_all で表示テキストが
  // 変わらないので、rank も並んで色が付かないのが正しい
  it('一撃の rank は解放段が同じ段どうしで並び、解放段をまたぐと上がる', () => {
    const tier9 = gear_stats('blade', 9)[3]
    const tier10 = gear_stats('blade', 10)[3]
    expect(tier9.label).toBe('一撃')
    expect(tier9.rank).toBe(tier10.rank)

    const tier4 = gear_stats('blade', 4)[3]
    const tier5 = gear_stats('blade', 5)[3]
    expect(tier5.rank).toBeGreaterThan(tier4.rank)
  })
})

describe('開封の判定', () => {
  it('未所持は新規、上は強化、下は格下、並びは同格', () => {
    expect(gear_verdict(0, 5)).toBe('new')
    expect(gear_verdict(4, 7)).toBe('up')
    expect(gear_verdict(8, 3)).toBe('down')
    expect(gear_verdict(6, 6)).toBe('same')
  })

  // 判定は段だけで決まってよい。段が全順序で上位が下位の完全な上位互換だから
  // 成り立つ性質なので、差分行の rank と食い違わないことを全組み合わせで見る
  it('強化と判定した組は、差分行がひとつも悪化しない', () => {
    for (const slot of gear_slots) {
      for (let owned = 1; owned <= gear_max_tier; owned++) {
        for (let tier = 1; tier <= gear_max_tier; tier++) {
          const verdict = gear_verdict(owned, tier)
          const prev = gear_stats(slot, owned)
          const next = gear_stats(slot, tier)
          for (let i = 0; i < next.length; i++) {
            if (verdict === 'up') {
              expect(next[i].rank).toBeGreaterThanOrEqual(prev[i].rank)
            } else if (verdict === 'down') {
              expect(next[i].rank).toBeLessThanOrEqual(prev[i].rank)
            } else {
              expect(next[i].rank).toBe(prev[i].rank)
            }
          }
        }
      }
    }
  })
})

describe('推奨', () => {
  it('良いほうを残す — 強化と新規は手元に、格下は転売', () => {
    expect(gear_recommend_keep('new')).toBe(true)
    expect(gear_recommend_keep('up')).toBe(true)
    expect(gear_recommend_keep('down')).toBe(false)
  })

  // 同格は装備も転売額も一致するので、どちらかを勧めると嘘になる
  it('同格は推奨を持たない', () => {
    expect(gear_recommend_keep('same')).toBe(null)
  })

  // 推奨を持たない根拠そのもの。決めたあとの結末は（残る装備の段, 増えるヤニ）で、
  // 入れ替えれば (この品, 旧品のヤニ)、転売すれば (旧品, この品のヤニ) になる。
  // 2 つが完全に一致する組はちょうど同格だけ、を両向きで押さえる — 一致する組が
  // ほかにもあれば、そこで出している推奨が嘘になる
  it('結末が完全に一致する組は、推奨を持たない組とちょうど一致する', () => {
    for (let owned = 0; owned <= gear_max_tier; owned++) {
      for (let tier = 1; tier <= gear_max_tier; tier++) {
        const identical = tier === owned &&
          gear_scrap_value(owned) === gear_scrap_value(tier)
        expect(gear_recommend_keep(gear_verdict(owned, tier)) === null).toBe(identical)
      }
    }
  })
})

describe('判定語', () => {
  it('4 つの判定すべてに語がある', () => {
    for (const verdict of ['new', 'up', 'same', 'down'] as const) {
      expect(gear_verdict_labels[verdict].length).toBeGreaterThan(0)
    }
  })
})
