# AGENTS.md

このリポジトリで作業するエージェント（Claude Code / Codex など）向けの共通指示です。

## プロジェクト概要

[phoboslab/underrun](https://github.com/phoboslab/underrun)（js13kgames 2018 出品作）をベースにした、WebGL 製のトップダウン・アクションシューティングを日本語向けにアレンジするプロジェクト。TypeScript + Vite 構成で、`index.html` が読み込むのは `source/main.ts` の 1 本だけ。他のモジュールへの依存関係は import が表すので、読み込み順を手で管理する必要はありません。

- `source/` — ゲーム本体（TypeScript）。`sonantx-reduced.js`（サードパーティ、zlib）だけが `.js` のまま
- `docs/` — 設計書（下記「ドキュメント」参照）
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

## Agent Skill の管理

スキルの正本は `.agents/skills/<name>/SKILL.md` の 1 箇所だけである。`.claude/skills/<name>/SKILL.md` は正本を読ませるための参照スタブ（生成物）で、直接編集しない。

スキルを作成・外部からインストール・更新・削除する前に、必ず [`.agents/rules/skill-management.md`](.agents/rules/skill-management.md) を読む。公開方式、セットアップ、検証手順はこの共通ルールだけで管理する。

## ドキュメント

### docs/ — 確定した設計書

現行システムの設計書（日本語、AI が読む前提）。**常にコードの現状と一致させる**。

- トピック単位のファイル名（例: `architecture.md`）。日付や経緯は書かない（git 履歴が持つ）
- 現在形で書く。「〜に変更した」ではなく「〜である」
- コードから読み取れないことだけを書く: モジュール間の契約・不変条件、数値パラメータの意図、データフォーマット、採用しなかった代替案とその理由
- 関数一覧や処理の逐次説明は書かない（コードとの二重管理になる）
- 実装を変更する際は、該当する docs/ を同じコミット群で更新する

### docs/superpowers/ — 作業用ドキュメント

進行中の設計提案（`specs/`）・実装計画（`plans/`）・レビュー（`specs/*-review.md`）。日付プレフィックス付き。**作業が完了したら、設計の結論を docs/ 直下に蒸留して反映し、元ファイルは削除する**。実装手順・チェックボックス・移行前の状況説明は反映しない（完了した時点で不要になるため）。

docs/ と docs/superpowers/ が矛盾する場合、docs/ とコードが正。

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

## LEARNINGS.md ループ

各セッションの開始時に、リポジトリ直下の LEARNINGS.md を読め。
読んだ内容を1〜3行で要約して提示し、読み込みが行われたことを可視化せよ。
セッション終了時には `update-learnings` スキルの実行を促せ。
