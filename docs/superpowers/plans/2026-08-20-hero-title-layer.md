# hero タイトルレイヤー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hero.png をイントロの全画面背景として表示し、ゲーム開始クリックで 1 秒フェードアウトする DOM レイヤーを追加する。

**Architecture:** `index.html` に全画面 div `#h` を静的に追加（重なり順は文書順で canvas `#c` → hero `#h` → ターミナル `#a`）。スクリムとケンバーンズは CSS のみ。非表示化は `source/dom.ts` で取得した要素を `source/main.ts` の開始クリックハンドラから操作する。WebGL レンダラーは触らない。

**Tech Stack:** 素の HTML/CSS + TypeScript（フレームワークなし）、Vite 6、vitest。

**Spec:** `docs/superpowers/specs/2026-08-20-hero-title-layer-design.md`

## Global Constraints

- WebGL レンダラー（`source/renderer.ts`）は変更しない
- 既存のターミナルイントロ演出のロジックは変更しない
- リザルト画面で hero は再表示しない
- アニメーションはケンバーンズ（30 秒で scale 1→1.06）1 つのみ
- vitest へのテスト追加はしない（ロジックが表示/非表示のみのため）。検証はブラウザでの目視
- 検証時の dev サーバーは Bash ではなくブラウザプレビュー（`.claude/launch.json` + preview ツール）で起動する

---

### Task 1: hero レイヤーの追加（index.html）

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: id `h` を持つ全画面 div（Task 2 が `document.getElementById('h')` で取得する）

**注意:** 既存 CSS の `div:last-child {color: #e90;}` はターミナル `#a` 内部の最終行ハイライト用。`#h` を body 直下に足してもこのルールに実害はないが、`#h` は `#c` の直後・`#a` の前に置くこと（文書順が重なり順を決めるため。`#a` より後に置くとターミナル文字が hero に隠れる）。

- [ ] **Step 1: CSS を追加**

`index.html` の `<style>` 内、`#c` のルールの直後に追加:

```css
#h{position:fixed;inset:0;background:url(m/hero.png) center/cover no-repeat;image-rendering:pixelated;animation:kb 30s ease-out forwards;transition:opacity 1s;}
#h::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.25) 55%,rgba(0,0,0,.45) 100%);}
@keyframes kb{to{transform:scale(1.06);}}
```

- [ ] **Step 2: マークアップを追加**

`<canvas id="c" ...></canvas>` の直後・`<code id="a"></code>` の前に 1 行:

```html
<div id="h"></div>
```

- [ ] **Step 3: ブラウザで表示確認**

ブラウザプレビューで dev サーバーを起動（`.claude/launch.json` がなければ `{"version":"0.0.1","configurations":[{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":5173}]}` を作成して `preview_start {name:"dev"}`）。

確認項目:
1. hero.png が全画面 cover で表示される（黒背景が見えない）
2. ターミナル演出（タイトル→ノイズ→ストーリー）の琥珀色文字が全行読める（スクリムが効いている）
3. ゆっくりしたズームがかかっている
4. ウィンドウを縦長/横長にリサイズしても cover が維持される（`resize_window` で確認）

スクリムが薄くて文字が読みにくい場合は `rgba(0,0,0,.72)` の alpha を上げて再確認する。

- [ ] **Step 4: Commit**

```bash
git add index.html m/hero.png
git commit -m "feat: イントロ背景に hero.png の全画面レイヤーを追加する"
```

（`m/hero.png` は未追跡なのでここで一緒にコミットする）

---

### Task 2: ゲーム開始クリックでのフェードアウト

**Files:**
- Modify: `source/dom.ts`
- Modify: `source/main.ts:13-30`（`audio_init` コールバック内の `document.onclick`）

**Interfaces:**
- Consumes: Task 1 の `<div id="h">`
- Produces: `dom.ts` の `export const hero_el: HTMLElement`

- [ ] **Step 1: dom.ts に hero_el を追加**

`source/dom.ts` の export 群に 1 行追加:

```ts
export const hero_el = document.getElementById('h') as HTMLElement
```

- [ ] **Step 2: main.ts でフェードアウト**

`source/main.ts` の `document.onclick` ハンドラ内、`terminal_cancel()` の直後に追加（import に `hero_el` を足す）:

```ts
hero_el.style.opacity = '0'
setTimeout(() => {
  hero_el.style.display = 'none'
}, 1000)
```

`transition: opacity 1s` は Task 1 の CSS が持つ。1000ms 後の `display:none` は、透明なレイヤーが `position:fixed` のままポインタイベントを覆い続けるのを防ぐため必須。

- [ ] **Step 3: 型チェックと既存テスト**

```bash
npm run typecheck
npm test
```

Expected: どちらもエラーなし（既存テストに影響する変更ではない）。

- [ ] **Step 4: ブラウザで動作確認**

dev プレビューをリロードし:
1. イントロ中に画面をクリック → hero が約 1 秒でフェードアウトし、ゲーム画面（WebGL）が見える
2. WASD 移動・スペース射撃が問題なく効く（hero レイヤーが入力を妨げていない）
3. ラン終了（リザルト画面）で hero が再表示されないこと

- [ ] **Step 5: 本番ビルド確認**

```bash
npm run build
```

Expected: 成功し、`dist/assets/` に `hero-<hash>.png` が出力される（インライン化されない）。`ls dist/assets` で確認。

`vite preview` での表示確認もブラウザプレビューで行う（launch.json に `{"name":"preview","runtimeExecutable":"npm","runtimeArgs":["run","preview"],"port":4173}` を追加して起動）。hero が表示されれば、inline `<style>` 内の `url()` を Vite が解決できている。

- [ ] **Step 6: Commit**

```bash
git add source/dom.ts source/main.ts
git commit -m "feat: ゲーム開始クリックで hero レイヤーをフェードアウトする"
```
