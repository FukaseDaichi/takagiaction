// 死亡画面の表示ロジック。DOM を触らない純関数のみを置き、Node（Vitest）で
// モックなしに評価できることが条件（meta.ts と同じ扱い）。実行時 import を
// 一切持たない。

export const death_cause_nicotine = 1

// run_end() が組み立てて death_screen_show() に渡す。state を直接読ませない
// のは、死亡画面の表示中に次のランが state を書き換えても表示が変わらないため。
// 獲得ヤニの内訳は持たない。run_end() が先に meta.yani へ合算し、
// 画面には合算後の残高だけを出す（内訳表示は無い）
export interface run_result_t {
  depth: number
  kills: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  // 更新前のベスト深度。run_end() は meta.best_depth を先に更新してから
  // この画面を出すので、控えておかないと記録更新を判定できない
  best_depth_before: number
}

export function format_run_time(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

// 死因は見出し 1 行だけが担う。体調パネル（赤い箱）を消したので、ここが
// 画面で唯一の「敵に殺されたのか、ゲージが尽きたのか」の出どころになる。
// 2 行目の励ましは、死を 2 回説明することになるため置かない
export function death_message(cause: number): string {
  return cause === death_cause_nicotine ? 'ニコチン、限界です。' : '死亡したよ、高木。'
}

// 旧ベストが 0（＝未プレイ）のときは出さない。初回のランで 1F に届いただけの
// 記録を「更新」として祝うと、演出そのものの意味が薄れる
export function is_new_record(depth: number, best_before: number): boolean {
  return best_before > 0 && depth > best_before
}

// --- 状態機械 ---
//
// 画面の状態はこの 1 オブジェクトに閉じる。death-screen.ts は返ってきた
// 状態と直前の状態を比べて class を当てるだけで、分岐を持たない。

export type ds_mode_t = 'idle' | 'upgrade'
export type ds_panel_t = 'none' | 'record' | 'gear'
export type ds_layer_t = 'active' | 'dim' | 'inactive'
// 状態の変化では表せない副作用だけを action にする。パネルの開閉は状態が
// 語るので action を持たない
export type ds_action_t = 'none' | 'descend' | 'buy'

// idle のフォーカス位置。地下へ戻るを既定にするので末尾に置く
export const ds_idle_record = 0
export const ds_idle_gear = 1
export const ds_idle_descend = 2
export const ds_idle_count = 3

export const ds_part_count = 6

export interface ds_state_t {
  mode: ds_mode_t
  focus: number // idle: 0..2、upgrade: 0..5（body_parts の添字）
  panel: ds_panel_t
  busy: boolean // 入場シーケンスと強化演出の再生中
  // 記録確認 / 装備確認は読むデータが無ければ項目ごと出さない。出していない
  // 項目へ矢印でフォーカスが乗ると Enter で空のパネルが開いてしまうので、
  // 巡回の対象かどうかを状態として持つ。このモジュールは実行時 import を
  // 持たない葉なので、meta や今回のリザルトを自分では読めない ―
  // 表示側（death_screen_show）が計算した結果をここへ載せてもらう
  has_record: boolean
  has_gear: boolean
}

export interface ds_result_t {
  state: ds_state_t
  action: ds_action_t
}

// 既定のフォーカスが「地下へ戻る」なのは、この画面の最終的なメインアクション
// だから。開いた瞬間に「地下へ戻れる」が読めることを最優先する。
// busy = true で始めるのは入場シーケンスが終わるまで入力を捨てるため
export function ds_initial_state(has_record: boolean, has_gear: boolean): ds_state_t {
  return {
    mode: 'idle', focus: ds_idle_descend, panel: 'none', busy: true, has_record, has_gear,
  }
}

// idle のその項目が、この回に出ているか。地下へ戻るは常に出ている
function ds_idle_shown(state: ds_state_t, index: number): boolean {
  if (index === ds_idle_record) { return state.has_record }
  if (index === ds_idle_gear) { return state.has_gear }
  return true
}

// 矢印 1 回ぶんの移動先。idle では出ていない項目を飛ばす。地下へ戻るが必ず
// 出ている以上、1 周ぶん回せば必ず止まれる
function ds_step(state: ds_state_t, delta: number): number {
  if (state.mode === 'upgrade') {
    return (state.focus + ds_part_count + delta) % ds_part_count
  }
  let next = state.focus
  for (let i = 0; i < ds_idle_count; i++) {
    next = (next + ds_idle_count + delta) % ds_idle_count
    if (ds_idle_shown(state, next)) { break }
  }
  return next
}

export function ds_reduce(state: ds_state_t, key: string): ds_result_t {
  const stay: ds_result_t = { state, action: 'none' }
  // 演出の途中で状態が動くと、収納と展開が同時に走って読めなくなる
  if (state.busy) { return stay }

  // パネルは矢印も Tab も奪わない。開いている間の出口は Esc だけ
  if (state.panel !== 'none') {
    return key === 'Escape'
      ? { state: { ...state, panel: 'none' }, action: 'none' }
      : stay
  }

  const to_idle: ds_result_t = {
    state: { ...state, mode: 'idle', focus: ds_idle_descend }, action: 'none',
  }

  if (key === 'Tab') {
    return state.mode === 'upgrade'
      ? to_idle
      : { state: { ...state, mode: 'upgrade', focus: 0 }, action: 'none' }
  }

  // Esc は「1 段戻る」。パネル（上で処理済み）→ 強化モード → 降下 の順
  if (key === 'Escape') {
    return state.mode === 'upgrade' ? to_idle : { state, action: 'descend' }
  }

  // 出ている項目が地下へ戻る 1 つだけなら移動先が自分自身になる。状態を
  // 変えずに返して、意味のない決定音と再描画を出さない
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    const next = ds_step(state, -1)
    return next === state.focus ? stay : { state: { ...state, focus: next }, action: 'none' }
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    const next = ds_step(state, 1)
    return next === state.focus ? stay : { state: { ...state, focus: next }, action: 'none' }
  }

  if (key === 'Enter') {
    if (state.mode === 'upgrade') { return { state, action: 'buy' } }
    if (state.focus === ds_idle_record) {
      return { state: { ...state, panel: 'record' }, action: 'none' }
    }
    if (state.focus === ds_idle_gear) {
      return { state: { ...state, panel: 'gear' }, action: 'none' }
    }
    return { state, action: 'descend' }
  }

  return stay
}

// 強化アイコンの強調階層。idle で dim に留めるのは、触れないが「押せそう」に
// 見えている必要があるため — この 6 個がこの画面の主役で、inactive まで
// 落とすと Tab を押す動機が画面から消える
export function ds_part_layer(state: ds_state_t, index: number): ds_layer_t {
  if (state.panel !== 'none') { return 'inactive' }
  if (state.mode !== 'upgrade') { return 'dim' }
  return state.focus === index ? 'active' : 'dim'
}

// 記録確認 / 装備確認 / 地下へ戻る の強調階層
export function ds_item_layer(state: ds_state_t, index: number): ds_layer_t {
  if (state.panel !== 'none' || state.mode === 'upgrade') { return 'inactive' }
  return state.focus === index ? 'active' : 'dim'
}
