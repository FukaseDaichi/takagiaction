# AGENTS.md

このリポジトリで作業するエージェント（Claude Code / Codex など）向けの共通指示です。

## プロジェクト概要

[phoboslab/underrun](https://github.com/phoboslab/underrun)（js13kgames 2018 出品作）をベースにした、WebGL 製のトップダウン・アクションシューティングを日本語向けにアレンジするプロジェクト。TypeScript + Vite 構成で、`index.html` が読み込むのは `source/main.ts` の 1 本だけ。他のモジュールへの依存関係は import が表すので、読み込み順を手で管理する必要はありません。

- `source/` — ゲーム本体（TypeScript）。`sonantx-reduced.js`（サードパーティ、zlib）だけが `.js` のまま
- `m/` — テクスチャ（PNG）
- `index.html` — エントリポイント。`source/main.ts` を読み込む
- `vite.config.ts` / `tsconfig.json` — ビルドと型チェックの設定
- `.github/workflows/deploy.yml` — `main` への push で GitHub Pages にビルド・デプロイする CI

GitHub Actions が `main` への push をビルドし、GitHub Pages にデプロイします。
デプロイ先で配信するには、リポジトリ設定の Pages → Source を「GitHub Actions」にしておく必要があります（初回のみの手作業）。

## 開発時の実行

```bash
npm install
npm run dev
```

表示された URL を開く。`source/` を編集すると自動でリロードされます。

型チェックとテスト:

```bash
npm run typecheck
npm test
```

## 方針

### 後方互換性は維持しない

互換レイヤー、フォールバック、マイグレーションを追加するのではなく、**不要になった実装やコードパスは削除する**。

- 古い関数・パラメータ・分岐を残したまま新しい経路を足さない。置き換えたら消す
- 「一応残しておく」コードは残さない。必要になれば git 履歴から戻せる

### 最もシンプルな実装を選ぶ

**現在の要件を完全に満たす、最もシンプルな実装**を選ぶ。将来を見越した過剰な抽象化、設定、間接化は避ける。

- 呼び出し元が 1 箇所しかないものに抽象化レイヤーを作らない
- 使う予定のないオプションやフラグを増やさない
- 要件は完全に満たす。シンプルさを理由に機能を削らないこと（スコープを削るのはユーザーの判断）

### Python は必ず uv で実行する

`python` / `python3` を直接叩かず、必ず `uv` 経由で実行する。

- スクリプト実行: `uv run python <script>.py`
- ワンライナー・標準モジュール: `uv run python -m <module>`
- パッケージが必要な場合: `uv run --with <package> python ...`
