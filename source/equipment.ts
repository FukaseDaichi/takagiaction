// 装備の数値モデル。押収品コンテナから出る 3 系統 × 10 段のテーブルと、
// 効果の式・抽選・ヤニ換算・等級への丸めを持つ。
//
// 実行時 import を一切持たない葉モジュールで、Node（Vitest）でモックなしに
// 評価できることがこのモジュールの条件（meta.ts / nicotine.ts と同じ扱い）。
// 画像も DOM も知らない — アイコンの静的 import は equip-screen.ts が持つ。

export const gear_slots = ['blade', 'sole', 'patch'] as const
export type gear_slot_t = (typeof gear_slots)[number]

export const gear_max_tier = 10

// 品名は闇サイトの怪しい通販文体（docs/story.md「全体のトーン」）。
// 笑いどころは大仰な商品名と実物のみすぼらしさのギャップにあり、名前が強く
// なるほど実物も本当に強くなる、という一貫性で成立させる。MK-II / FINAL DRAG
// のような疑似スペック・英字の商品名は日本語化しない（同じ規約）。
// 添字 0 が段 1。
const gear_names: Record<gear_slot_t, string[]> = {
  blade: [
    '錆びたカッター',
    '折れたヤニ落とし',
    '換気ダクト用スクレーパー',
    '業務用 灰かき棒〈研磨済〉',
    '【訳あり】禁制品解体ナイフ',
    '旧世紀製 葉巻カッター',
    '【業物】ヤニ落とし・改',
    '【業物】単分子ヤニ落とし MK-II',
    '【銘品】監視ロボ解体用 大鉈',
    '【銘品】FINAL DRAG',
  ],
  sole: [
    '片方だけの安全靴',
    '廃品回収業者のサンダル',
    '静音ソール〈中古〉',
    '配管工の作業靴',
    '【訳あり】巡回員用 高速ソール',
    '反重力インソール〈体験版〉',
    '【業物】密輸業者のブーツ',
    '【業物】慣性キャンセラ内蔵ソール',
    '【銘品】監視ロボ振り切り用 加速脚',
    '【銘品】ASH RUNNER',
  ],
  patch: [
    '期限切れのニコチンガム',
    '使いかけの禁煙パッチ（逆用）',
    '業務用ニコチンパッチ〈弱〉',
    '密造ニコチンパッチ',
    '【訳あり】徐放型パッチ〈治験品〉',
    '旧世紀製 ニコチン点滴パック',
    '【業物】経皮ニコチン供給器 MK-II',
    '【業物】皮下埋込式ニコチンリザーバ',
    '【銘品】血中濃度定常化ユニット',
    '【銘品】ETERNAL SMOKER',
  ],
}

export function gear_name(slot: gear_slot_t, tier: number): string {
  return gear_names[slot][tier - 1]
}

// 数値は 10 段のまま、見せ方だけを 5 等級に丸める。10 色は画面上で区別
// できない。色は death-screen.ts の強化行が既に使っているパレットから採り、
// 新しい色語彙を増やさない
export const gear_grades = [
  { name: '並品', color: '#8a8a8a' },
  { name: '上物', color: '#3af08a' },
  { name: '特上', color: '#3ac6f0' },
  { name: '業物', color: '#a86df0' },
  { name: '銘品', color: '#f0c93a' },
] as const

export function gear_grade(tier: number): number {
  return (tier - 1) >> 1
}

// 落下したコンテナの予告灯。gear_grades の色を push_light() の RGB に写す。
// 暗いフロアの向こうに金色の光が見えたら銘品、という 1 色で「取りに行く
// 価値があるか」の判断を作る
export const gear_lights: [number, number, number][] = [
  [0.54, 0.54, 0.54],
  [0.23, 0.94, 0.54],
  [0.23, 0.78, 0.94],
  [0.66, 0.43, 0.94],
  [0.94, 0.79, 0.23],
]

// --- 刃物 ---

// Lv1 の 9.6px はエンティティ同士の重なり判定 9px とほぼ同じで「触れる距離」
// でしか当たらない。Lv10 の 24px はセントリーの停止距離そのもので、詰めきった
// セントリーにちょうど届く上限になる（docs/enemies.md）
export function blade_reach(tier: number): number {
  return 8 + 1.6 * tier
}

export function blade_interval(tier: number): number {
  return 1 - 0.07 * tier
}

// 薙ぎの半角（ラジアン）。Lv1 ±22° 〜 Lv10 ±69°
export function blade_arc(tier: number): number {
  return 0.3 + 0.09 * tier
}

// 一撃必殺の解放段。全段を一撃にするとレア度に載せる軸が残らない
// （一撃必殺より強い撃破は存在しない）ので、対象のほうを段で広げる
export const blade_oneshot_spider = 0
export const blade_oneshot_drone = 1
export const blade_oneshot_all = 2

export function blade_oneshot_level(tier: number): number {
  if (tier >= 9) { return blade_oneshot_all }
  if (tier >= 5) { return blade_oneshot_drone }
  return blade_oneshot_spider
}

// 一撃にならない相手へのダメージ。自機のプラズマ 1 発 = 1 ダメージが基準なので、
// Lv8 の刃はセントリー（20 発）を 3 振りで落とす
export function blade_damage(tier: number): number {
  return tier
}

// --- パッシブ ---

// player_speed() の戻り値に加算する。素の足 128 + 25 = 153 が清掃ドローンの
// 逃走終端速度 150 をちょうど超えるので、脚力 Lv4 とは別の「ドローン狩り解禁」
// ルートになる（docs/meta-progression.md「強化テーブル」）
export function sole_speed_bonus(tier: number): number {
  return 2.5 * tier
}

// ニコチン減少速度から減算する。乗算にすると深いほど効きが増してインフレ
// するが、加算は深いほど相対効果が薄れて自己減衰する
export function patch_drain_bonus(tier: number): number {
  return 0.03 * tier
}

// 減算後の下限。深度 1 × 耐性 Lv10 × パッチ Lv10 で 0.30 なので現状は効かないが、
// 耐性側を将来触ったときに 0 を割ってゲージが減らなくなる（＝中核の問いが
// 消える）のを止める
export const drain_floor = 0.15

// --- 抽選 ---

// 段の中心。深度 30 で頭打ちにするのは、それ以上は到達者がほぼいない帯で
// 式を伸ばしても挙動の差が観測されないため
export function gear_roll_center(depth: number): number {
  return 1 + 9 * Math.min(depth, 30) / 30
}

// 中心のまわりに 1/(1+距離²) で重みを置く。裾がゼロにならないので、
// どの深度でも全段が出うる（深度 1 で最上位 0.6%）。段を深度でハードに切ると、
// 浅い層の宝箱が「開ける前から中身の幅が分かる」ものになる。
// roll は 0〜1。抽選の乱数は呼び出し側が渡す（テストのため）
export function gear_roll_tier(depth: number, roll: number): number {
  const center = gear_roll_center(depth)
  const weights: number[] = []
  let total = 0
  for (let tier = 1; tier <= gear_max_tier; tier++) {
    const d = tier - center
    const w = 1 / (1 + d * d)
    weights.push(w)
    total += w
  }
  let acc = 0
  for (let i = 0; i < gear_max_tier; i++) {
    acc += weights[i] / total
    if (roll < acc) { return i + 1 }
  }
  return gear_max_tier
}

export function gear_roll_slot(roll: number): gear_slot_t {
  const index = (roll * gear_slots.length) | 0
  return gear_slots[Math.min(index, gear_slots.length - 1)]
}

// 手元に残さなかったほうがヤニに化ける。既存の強化価格曲線
// 15 + 10lv + 5lv²（meta.ts）の二次項をそのまま使う。最上位 500 は
// 深度 17 の清掃ドローン 1 体ぶんで、収束後の宝箱が「ドローンよりは小さい
// 確実な収入」に落ち着く帯になる
export function gear_scrap_value(tier: number): number {
  return 5 * tier * tier
}

// --- 差分行 ---

// 開封ダイアログが現在の装備と並べて出す行。rank は「大きいほうが良い」で
// 統一してあり（振り間隔だけ符号を反転させてある）、比較する側は軸ごとの
// 向きを知らなくてよい
export interface gear_stat_t {
  label: string
  text: string
  rank: number
}

const blade_oneshot_texts = ['蜘蛛', '＋ドローン', '全部']

export function gear_stats(slot: gear_slot_t, tier: number): gear_stat_t[] {
  if (slot === 'blade') {
    const interval = blade_interval(tier)
    const arc = blade_arc(tier)
    const oneshot = blade_oneshot_level(tier)
    return [
      { label: '射程', text: blade_reach(tier).toFixed(1), rank: blade_reach(tier) },
      { label: '振り間隔', text: interval.toFixed(2) + ' 秒', rank: -interval },
      { label: '薙ぎ半角', text: '±' + Math.round(arc * 180 / Math.PI) + '°', rank: arc },
      { label: '一撃', text: blade_oneshot_texts[oneshot], rank: tier },
    ]
  }
  if (slot === 'sole') {
    const bonus = sole_speed_bonus(tier)
    return [{ label: '移動速度', text: '+' + bonus.toFixed(1), rank: bonus }]
  }
  const bonus = patch_drain_bonus(tier)
  return [{ label: 'ニコチン減少', text: '−' + bonus.toFixed(2) + ' /秒', rank: bonus }]
}
