# 最高深度スコアの可視化とニューレコード演出 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 死亡画面のリザルトに最高深度を常時表示し、記録を更新したランではニューレコード演出を出す。

**Architecture:** 判定は `death-screen-model.ts` の純関数 `is_new_record()` が持ち、Vitest でモックなしにテストする。`run_end()` が更新前のベスト深度を `run_result_t.best_depth_before` に載せて渡す。演出のバナーは `render()` の `innerHTML` 再構築の外（`#ds` の兄弟）に置き、キー入力でアニメーションが再生し直されないようにする。

**Tech Stack:** TypeScript + Vite + Vitest。DOM は素の `innerHTML`、演出は CSS keyframes。新しい依存は追加しない。

## Global Constraints

- 設計書は `docs/superpowers/specs/2026-08-24-new-record-design.md`。実装がこれと食い違ったら設計書が正
- 後方互換レイヤーを作らない。置き換えたコードは消す（AGENTS.md）
- 現在の要件を完全に満たす最もシンプルな実装を選ぶ。使う予定のないオプションを足さない（AGENTS.md）
- Python を使う場合は必ず `uv run python` 経由（AGENTS.md）。この計画では使わない
- プレイ中の HUD は変更しない。変更は死亡画面に閉じる
- 発動条件は `best_before > 0 && depth > best_before`。旧ベスト 0（未プレイ）では出さない
- 効果音は既存の `audio_sfx_pickup` を使う。`sound-effects.ts` に instrument を追加しない
- 色は既存パレットに合わせる。強調の金色は `#ffd24a`、オレンジは `#ffaa2b`（`.ds-title` と同色）
- ブランチは `feat/new-record`（作成済み）

---

### Task 1: 判定ロジックとデータ受け渡し

`is_new_record()` を純関数として足し、`run_end()` が更新前のベスト深度を結果に載せる。ここまでで画面表示は変わらないが、判定は完全にテストできる。

**Files:**
- Modify: `source/death-screen-model.ts`
- Modify: `source/death-screen-model.test.ts`
- Modify: `source/game.ts:78-95`（`run_end()`）

**Interfaces:**
- Consumes: なし（このタスクが起点）
- Produces:
  - `run_result_t.best_depth_before: number` — 更新前のベスト深度
  - `is_new_record(depth: number, best_before: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`source/death-screen-model.test.ts` の import を差し替える。

```ts
import {
  condition_texts, death_cause_nicotine, death_message, format_run_time,
  is_new_record,
} from './death-screen-model'
```

ファイル末尾に追加する。

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run source/death-screen-model.test.ts
```

期待: `is_new_record` が export されていないため失敗する。

- [ ] **Step 3: `death-screen-model.ts` に判定を実装する**

`run_result_t` に `best_depth_before` を足す。`hp` の下に追加する。

```ts
export interface run_result_t {
  depth: number
  kills: number
  run_time: number
  smoke_count: number
  dummy_count: number
  death_cause: number // 0 = 敵、death_cause_nicotine = ニコチン切れ
  nicotine_ratio: number // 死亡時の残量比 0..1
  hp: number // 死亡時の HP（0..5）
  // 更新前のベスト深度。run_end() は meta.best_depth を先に更新してから
  // この画面を出すので、控えておかないと記録更新を判定できない
  best_depth_before: number
}
```

`condition_texts()` の下に追加する。

```ts
// 旧ベストが 0（＝未プレイ）のときは出さない。初回のランで 1F に届いただけの
// 記録を「更新」として祝うと、演出そのものの意味が薄れる
export function is_new_record(depth: number, best_before: number): boolean {
  return best_before > 0 && depth > best_before
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run source/death-screen-model.test.ts
```

期待: 全件 PASS。

- [ ] **Step 5: `run_end()` が更新前の値を渡すようにする**

`source/game.ts` の `run_end()` 内、`meta.yani += state.yani_run` の次の行を置き換える。

置き換え前:

```ts
  meta.best_depth = Math.max(meta.best_depth, state.depth)
  meta_save()
  death_screen_show({
    depth: state.depth,
    kills: state.kills,
    run_time: state.run_time,
    smoke_count: state.smoke_count,
    dummy_count: state.dummy_count,
    death_cause: state.death_cause,
    nicotine_ratio: state.nicotine / state.nicotine_max,
    hp: Math.max(0, state.entity_player!.h),
  }, run_start)
```

置き換え後:

```ts
  // 更新前のベストを控えてから代入する。死亡画面は meta.best_depth を
  // 更新後の値として読むため、控えないと記録更新を判定できない
  const best_depth_before = meta.best_depth
  meta.best_depth = Math.max(best_depth_before, state.depth)
  meta_save()
  death_screen_show({
    depth: state.depth,
    kills: state.kills,
    run_time: state.run_time,
    smoke_count: state.smoke_count,
    dummy_count: state.dummy_count,
    death_cause: state.death_cause,
    nicotine_ratio: state.nicotine / state.nicotine_max,
    hp: Math.max(0, state.entity_player!.h),
    best_depth_before,
  }, run_start)
```

- [ ] **Step 6: 型チェックと全テストを走らせる**

```bash
npm run typecheck && npm test
```

期待: 型エラーなし。テストは既存 163 件 + 新規 4 件がすべて PASS。

- [ ] **Step 7: コミット**

```bash
git add source/death-screen-model.ts source/death-screen-model.test.ts source/game.ts
git commit -m "feat: ニューレコード判定と更新前ベスト深度の受け渡しを追加する"
```

---

### Task 2: リザルトに最高深度行を出す

「今回の記録」パネルに `最高深度` 行を足す。更新の有無に関わらず常時表示し、更新時は金色 + `NEW` バッジ + `21 F ← 15 F` の対比にする。

**Files:**
- Modify: `source/death-screen.ts`（import、`record_row()`、`render()` の記録パネル）
- Modify: `source/death-screen.css`（記録行の強調スタイル）
- Modify: `source/main.ts`（確認用の一時コード。Step 6 で必ず戻す）

**Interfaces:**
- Consumes: `is_new_record(depth, best_before)`、`run_result_t.best_depth_before`（Task 1）
- Produces: CSS クラス `ds-record-row.record` / `ds-record-prev` / `ds-record-new`

- [ ] **Step 1: `is_new_record` を import する**

`source/death-screen.ts` の import を差し替える。

```ts
import {
  condition_texts, death_message, format_run_time, is_new_record,
} from './death-screen-model'
```

- [ ] **Step 2: `record_row()` にクラス引数を足す**

置き換え前:

```ts
function record_row(icon: string, label: string, value: string): string {
  return '<div class="ds-record-row"><img src="' + icon + '" alt="">' +
    label + '<b>' + value + '</b></div>'
}
```

置き換え後:

```ts
function record_row(
  icon: string, label: string, value: string, cls = '',
): string {
  return '<div class="ds-record-row' + (cls ? ' ' + cls : '') +
    '"><img src="' + icon + '" alt="">' +
    label + '<b>' + value + '</b></div>'
}
```

- [ ] **Step 3: 記録パネルに最高深度行を足す**

`render()` の中、`if (dead) {` ブロックの先頭を置き換える。

置き換え前:

```ts
  if (dead) {
    left += '<div class="ds-panel ds-record">' +
      '<div class="ds-panel-title">今回の記録</div>' +
      record_row(stat_depth_url, '到達深度', r.depth + ' F') +
      record_row(stat_time_url, '生存時間', format_run_time(r.run_time)) +
```

置き換え後:

```ts
  if (dead) {
    // 到達深度と同じ量なので、アイコンは stat_depth_url を流用する
    const record = is_new_record(r.depth, r.best_depth_before)
    const best_value = meta.best_depth + ' F' + (record
      ? '<span class="ds-record-prev">← ' + r.best_depth_before + ' F</span>' +
        '<span class="ds-record-new">NEW</span>'
      : '')
    left += '<div class="ds-panel ds-record">' +
      '<div class="ds-panel-title">今回の記録</div>' +
      record_row(stat_depth_url, '到達深度', r.depth + ' F') +
      record_row(stat_depth_url, '最高深度', best_value, record ? 'record' : '') +
      record_row(stat_time_url, '生存時間', format_run_time(r.run_time)) +
```

- [ ] **Step 4: CSS を足す**

`source/death-screen.css` の `#ds .ds-record-row b { ... }` の行の直後に追加する。

```css
/* 記録更新した行の強調。バッジは点滅させない — render() はキー入力の
   たびに innerHTML を組み直すため、ここにアニメーションを置くと
   矢印キーを押すたびに位相がリセットされる（演出はバナー側が持つ） */
#ds .ds-record-row.record b { color: #ffd24a; text-shadow: 0 0 8px rgba(255, 210, 74, 0.8); }
#ds .ds-record-prev {
  margin-left: 0.5vw; font-size: 0.9vw; font-weight: normal; color: #7fe0a8;
}
#ds .ds-record-new {
  margin-left: 0.5vw; padding: 0 0.35vw;
  border: 1px solid #ffd24a; border-radius: 0.2vw;
  font-size: 0.8vw; color: #ffd24a;
}
```

- [ ] **Step 5: 型チェックとブラウザで確認する**

```bash
npm run typecheck
```

期待: 型エラーなし。

次に `source/main.ts` の `meta_load()` の直後へ、一時的な確認用コードを入れる。

```ts
// ↓↓↓ 一時的な確認用。Step 6 で必ず消す ↓↓↓
import { meta } from './meta'
meta.best_depth = 21
death_screen_show({
  depth: 21, kills: 42, run_time: 767, smoke_count: 9, dummy_count: 3,
  death_cause: 1, nicotine_ratio: 0, hp: 0, best_depth_before: 15,
}, () => {})
// ↑↑↑ ここまで ↑↑↑
```

`preview_start` で `takagiaction`（`.claude/launch.json`）を起動し、次を目視で確認する。

1. 「今回の記録」に `最高深度 21 F ← 15 F NEW` が金色で出ている
2. 記録パネルの幅（45%）から文字がはみ出していない。はみ出すなら `.ds-record-prev` / `.ds-record-new` の `font-size` を下げる
3. `best_depth_before: 25` / `meta.best_depth = 25` に書き換えると `最高深度 25 F` だけになり、金色にもバッジにもならない
4. 矢印キーで強化行を移動しても、最高深度行の見た目が変わらない

- [ ] **Step 6: 一時コードを戻す**

`source/main.ts` から Step 5 で足した `import { meta } from './meta'` と死亡画面の呼び出しブロックをすべて削除する。

```bash
git diff --stat source/main.ts
```

期待: 出力が空（`main.ts` に差分が残っていない）。

- [ ] **Step 7: 全テストとコミット**

```bash
npm run typecheck && npm test
```

期待: 型エラーなし、全件 PASS。

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "feat: リザルトに最高深度を常時表示する"
```

---

### Task 3: ニューレコードのバナーと演出

記録更新時だけ、死亡画面の左半分（イラスト上）に `NEW RECORD` バナーを出す。

**Files:**
- Modify: `source/death-screen.ts`（バナー要素のライフサイクル）
- Modify: `source/death-screen.css`（`#ds-nr` と keyframes）
- Modify: `source/main.ts`（確認用の一時コード。Step 6 で必ず戻す）

**Interfaces:**
- Consumes: `is_new_record(depth, best_before)`、`run_result_t.best_depth_before`（Task 1）、`audio_play` / `audio_sfx_pickup`（`death-screen.ts` に import 済み）
- Produces: なし（このタスクが終端）

- [ ] **Step 1: バナー要素のモジュールローカル変数を足す**

`source/death-screen.ts` の `let root: HTMLDivElement | null = null` の直後に追加する。

```ts
// ニューレコード演出のバナー。#ds の兄弟として作る理由は show_record_banner() を見よ
let banner: HTMLDivElement | null = null
```

- [ ] **Step 2: バナーの表示関数を書く**

`death_screen_show()` の直後（`descend()` の直前）に追加する。

```ts
// バナーを #ds の中ではなく兄弟として作るのは、render() が root.innerHTML を
// 丸ごと組み直すため。中に置くと矢印キーを押すたびにスライドインとグリッチが
// 再生し直される。アニメーションは innerHTML で毎回作り直す内側の 2 要素が
// 持ち、外枠（#ds-nr）は配置だけを持つので、表示のたびに 1 度だけ走る
function show_record_banner(result: run_result_t | null): void {
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'ds-nr'
    document.body.appendChild(banner)
  }
  if (!result || !is_new_record(result.depth, result.best_depth_before)) {
    banner.style.display = 'none'
    return
  }
  banner.innerHTML =
    '<div class="ds-nr-title">NEW RECORD</div>' +
    '<div class="ds-nr-sub">自己ベスト更新！ 深度 ' + result.depth + 'F</div>'
  banner.style.display = 'block'
  audio_play(audio_sfx_pickup)
}
```

- [ ] **Step 3: 表示と非表示を繋ぐ**

`death_screen_show()` の末尾を置き換える。

置き換え前:

```ts
  render()
  root.style.display = 'grid'
  document.addEventListener('keydown', on_key)
}
```

置き換え後:

```ts
  render()
  root.style.display = 'grid'
  show_record_banner(result)
  document.addEventListener('keydown', on_key)
}
```

`descend()` を置き換える。

置き換え前:

```ts
function descend(): void {
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend()
}
```

置き換え後:

```ts
function descend(): void {
  audio_play(audio_sfx_beep)
  document.removeEventListener('keydown', on_key)
  root!.style.display = 'none'
  // banner は show_record_banner() が death_screen_show() で必ず作るので、
  // descend() まで来た時点で null ではない（root! と同じ扱い）
  banner!.style.display = 'none'
  canvas.style.opacity = '1'
  on_descend()
}
```

- [ ] **Step 4: CSS を足す**

`source/death-screen.css` の末尾に追加する。

```css
/* ニューレコード演出。#ds（z-index 10）の兄弟として body 直下に作る。
   render() の innerHTML 再構築の外に置くための配置で、理由は
   death-screen.ts の show_record_banner() にある。
   アニメーションは毎回作り直される内側の 2 要素が持ち、外枠は配置だけ。
   位置は左半分（イラスト）の、記録パネルと状態パネルの間の帯を狙っている */
#ds-nr {
  position: fixed;
  left: 1.5vw;
  top: 36vh;
  width: 48vw;
  display: none;
  z-index: 11;
  pointer-events: none;
  user-select: none;
  text-align: center;
  font-family: 'BIZ UDGothic', 'Yu Gothic UI', system-ui, sans-serif;
}

/* padding はグロー（text-shadow）が overflow: hidden で切られないための余白。
   overflow: hidden 自体は ::after のスイープを箱の中に留めるために要る */
#ds-nr .ds-nr-title {
  position: relative;
  overflow: hidden;
  padding: 0.6vw 1.2vw;
  font-size: 5vw;
  font-weight: bold;
  letter-spacing: 0.08em;
  color: #ffd24a;
  animation:
    ds-nr-in 0.35s cubic-bezier(0.2, 1.6, 0.35, 1) both,
    ds-nr-glitch 0.35s steps(1) 0.35s both,
    ds-nr-glow 2s ease-in-out 0.7s infinite;
}
#ds-nr .ds-nr-title::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg, transparent 38%, rgba(255, 255, 255, 0.5) 50%, transparent 62%);
  animation: ds-nr-sweep 1.8s ease-in-out 0.7s infinite;
}
#ds-nr .ds-nr-sub {
  font-size: 1.6vw;
  font-weight: bold;
  color: #ffaa2b;
  text-shadow: 0 0 10px #f70;
  animation: ds-nr-in 0.35s cubic-bezier(0.2, 1.6, 0.35, 1) 0.2s both;
}

@keyframes ds-nr-in {
  from { opacity: 0; transform: translateX(-6vw) scale(1.4); }
  to { opacity: 1; transform: none; }
}
/* 色収差と水平ずれ。steps(1) で瞬間的に切り替える。transform を ds-nr-in と
   同じプロパティで奪うので、animation 一覧では必ず ds-nr-in より後に置く */
@keyframes ds-nr-glitch {
  0%   { transform: translateX(-0.5vw); text-shadow: 0.35vw 0 0 #f0f, -0.35vw 0 0 #0ff; }
  25%  { transform: translateX(0.6vw); text-shadow: -0.4vw 0 0 #f0f, 0.4vw 0 0 #0ff; }
  50%  { transform: translateX(-0.3vw); text-shadow: 0.25vw 0 0 #0ff, -0.25vw 0 0 #f0f; }
  75%  { transform: none; text-shadow: 0 0 1.2vw #ffb400; }
  100% { transform: none; text-shadow: 0 0 1.2vw #ffb400; }
}
@keyframes ds-nr-glow {
  0%, 100% { text-shadow: 0 0 1vw #ffb400, 0 0 2.2vw rgba(255, 140, 0, 0.7); }
  50% { text-shadow: 0 0 1.8vw #ffd24a, 0 0 4vw rgba(255, 170, 43, 0.95); }
}
@keyframes ds-nr-sweep {
  0% { transform: translateX(-120%); }
  55%, 100% { transform: translateX(120%); }
}
```

- [ ] **Step 5: 型チェックとブラウザで確認する**

```bash
npm run typecheck
```

期待: 型エラーなし。

次に `source/main.ts` の `meta_load()` の直後へ、一時的な確認用コードを入れる。

```ts
// ↓↓↓ 一時的な確認用。Step 6 で必ず消す ↓↓↓
import { meta } from './meta'
meta.best_depth = 21
death_screen_show({
  depth: 21, kills: 42, run_time: 767, smoke_count: 9, dummy_count: 3,
  death_cause: 1, nicotine_ratio: 0, hp: 0, best_depth_before: 15,
}, () => {})
// ↑↑↑ ここまで ↑↑↑
```

`preview_start` で `takagiaction`（`.claude/launch.json`）を起動し、次を目視で確認する。

1. `NEW RECORD` が左からスライドインし、グリッチののちオレンジに光り続ける
2. バナーが記録パネル・状態パネル・右列の強化リストのどれとも重なっていない。重なるなら `#ds-nr` の `top` を調整する
3. バナーの上でクリックしても、下の強化ボタンが反応する（`pointer-events: none` が効いている）
4. 矢印キーで強化行を移動しても、スライドインとグリッチが再生し直されない
5. `best_depth_before: 25` / `meta.best_depth = 25` に書き換えるとバナーが出ない
6. `best_depth_before: 0` に書き換えるとバナーが出ない（未プレイ扱い）
7. ブラウザのコンソールにエラーが出ていない

- [ ] **Step 6: 一時コードを戻す**

`source/main.ts` から Step 5 で足した `import { meta } from './meta'` と死亡画面の呼び出しブロックをすべて削除する。

```bash
git diff --stat source/main.ts
```

期待: 出力が空（`main.ts` に差分が残っていない）。

- [ ] **Step 7: 全テストとビルド、コミット**

```bash
npm run typecheck && npm test && npm run build
```

期待: すべて成功。

```bash
git add source/death-screen.ts source/death-screen.css
git commit -m "feat: 記録更新時にニューレコード演出を出す"
```

---

### Task 4: ドキュメントに反映して作業用ドキュメントを削除する

AGENTS.md の規約どおり、`docs/superpowers/` の作業用ドキュメントは完了時に `docs/` 直下へ蒸留して削除する。

**Files:**
- Modify: `docs/meta-progression.md`
- Delete: `docs/superpowers/specs/2026-08-24-new-record-design.md`
- Delete: `docs/superpowers/plans/2026-08-24-new-record.md`

**Interfaces:**
- Consumes: Task 1〜3 の実装
- Produces: なし

- [ ] **Step 1: `docs/meta-progression.md` の記述を差し替える**

「死亡画面（リザルト＋闇サイト）とスコア」節の末尾にある次の 1 行を探す。

```markdown
スコアは到達深度のみで、ベスト深度だけ保存する。
```

これを次で置き換える。

```markdown
### スコアと記録更新

スコアは到達深度のみで、ベスト深度だけ保存する。リザルトの「今回の記録」パネルには、そのランの到達深度と**最高深度を常に並べて出す**。更新できなかったランでこそ「あと何階だったか」が要るため、更新の有無で出し分けはしない。

**プレイ中の HUD には深度を出さない。** 潜行中の常時表示は、中核の問い（ゲージが尽きる前に喫煙所を見つけられるか）に対して読む必要のない値で、フロア到達時のターミナル通知（`深度 N に到達`）で足りている。

記録更新の判定は `death-screen-model.ts` の `is_new_record(depth, best_before)` が持つ。`run_end()` は `meta.best_depth` を更新した**後**に死亡画面を出すため、更新前の値を `run_result_t.best_depth_before` に控えて渡す。この値は「21F ← 15F」の対比表示にも使う。

**旧ベストが 0（＝未プレイ）のときは演出を出さない。** 初回のランで 1F に届いただけの記録を「更新」として祝うと、演出そのものの意味が薄れる。同値も更新ではない。深度のしきい値は設けない — 序盤は連続して更新されるが、深くなるほど自然にレアになるので、説明のつかない定数を増やす理由がない。

演出のバナーは `#ds` の**兄弟**として `document.body` 直下に置く。`render()` はキー入力と強化購入のたびに `root.innerHTML` を丸ごと組み直すため、バナーをその中に置くと矢印キーのたびにアニメーションが再生し直される。アニメーションは `innerHTML` で毎回作り直される内側の 2 要素が持ち、外枠は配置だけを持つ。記録行の `NEW` バッジを点滅させないのも同じ理由で、こちらは `render()` の内側にあるため。

効果音は既存の `audio_sfx_pickup` を流用する。1 箇所でしか鳴らさない音のために `sound-effects.ts` の instrument を 1 つ増やす価値がない。
```

- [ ] **Step 2: 作業用ドキュメントを削除する**

```bash
git rm docs/superpowers/specs/2026-08-24-new-record-design.md docs/superpowers/plans/2026-08-24-new-record.md
```

- [ ] **Step 3: 反映漏れがないことを確認する**

```bash
grep -rn "best_depth_before\|is_new_record\|ds-nr" docs/
```

期待: `docs/meta-progression.md` が `best_depth_before` と `is_new_record` を含み、削除したファイルは 1 件も出てこない。

- [ ] **Step 4: コミット**

```bash
git add docs/meta-progression.md
git commit -m "docs: 最高深度の表示とニューレコード演出を設計書に反映する"
```
