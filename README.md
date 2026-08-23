# TAKAGI ACTION

[phoboslab/underrun](https://github.com/phoboslab/underrun)（js13kgames 2018 出品作 **UNDERRUN**）をベースに、日本語向けにアレンジしていくプロジェクトです。

見下ろし型（トップダウン）のアクションシューティング。舞台は喫煙が非合法化された近未来の施設。愛煙家の**高木**が、ニコチン切れと戦いながら各フロアに残された喫煙所を探します。一服するとニコチンが全快し、煙を感知した非常口が開いて次のフロアへ降りられます。深度に上限はなく、力尽きるまで潜り続けるローグライトで、**到達した深度がそのままスコア**です。持ち帰った吸い殻（ヤニ）は闇サイトで恒久強化に交換できます。

WebGL 製で、オリジナルはゲーム本体・グラフィック・BGM をすべて含めて **13KB 以下**という制約の中で作られています。

## ▶ ブラウザで遊ぶ

**https://fukasedaichi.github.io/takagiaction/**

`main` への push で GitHub Actions が自動デプロイします。オリジナル版はこちら: https://phoboslab.org/underrun/

## セットアップ

```bash
npm install
npm run dev
```

表示された URL（既定では `http://localhost:5173/`）を開き、**画面をクリックするとゲーム開始**です（音声再生のためにクリックが必要）。`source/main.ts` は TypeScript なので、`file://` で `index.html` を直接開いても動きません。推奨環境は WebGL と Web Audio API に対応した最近のブラウザ。

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | 開発サーバー（`source/` の編集で自動リロード） |
| `npm run build` | 型チェックのうえ `dist/` に本番ビルド |
| `npm run preview` | `dist/` をローカルで確認 |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |

## 操作

| 操作 | キー / 入力 |
| --- | --- |
| 移動 | `W` `A` `S` `D` または `↑` `←` `↓` `→` |
| 射撃 | `スペース`（押しっぱなしで連射。押している間は向きが固定） |
| 予備の一本 | `E` |
| 武器の持ち替え（銃 / 刃） | `Tab`（刃物を持っているときだけ） |
| 音声 ON / OFF | `M` |
| ゲーム開始 | 画面をクリック |

## ドキュメント

設計情報はすべて `docs/` にあります。**日本語で、AI が読む前提**で書かれており、常にコードの現状と一致させます。

| ファイル | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | モジュール構成、循環参照の不変条件、ターミナルの契約、アセットとビルド |
| [docs/gameplay.md](docs/gameplay.md) | 中核ループ、操作、ニコチンゲージ、一服、死亡シーケンス、フロア生成、HUD |
| [docs/enemies.md](docs/enemies.md) | 敵 3 体（蜘蛛・セントリー・清掃ドローン）の役割・体数・挙動・撃破報酬 |
| [docs/meta-progression.md](docs/meta-progression.md) | 通貨「ヤニ」、恒久強化テーブル、嗅覚、死亡画面とスコア、保存 |
| [docs/equipment.md](docs/equipment.md) | 装備 3 系統 × 10 段、押収品コンテナ、レア度と等級、近接攻撃、品目表 |
| [docs/story.md](docs/story.md) | ストーリーと世界観、声の使い分け、全体のトーン |

読み方:

- トピック単位のファイルで、**現在形**で書きます。日付や経緯は書きません（git 履歴が持ちます）
- 書くのは**コードから読み取れないことだけ** — モジュール間の契約・不変条件、数値パラメータの意図、採用しなかった代替案とその理由。関数一覧や処理の逐次説明は置きません
- `docs/superpowers/` は進行中の設計提案・実装計画・レビュー（作業用）。完了したら結論を `docs/` 直下に蒸留し、元ファイルは削除します。**`docs/` と矛盾したら `docs/` とコードが正です**
- エージェント（Claude Code / Codex など）向けの作業指示は [AGENTS.md](AGENTS.md) にあります

## クレジット

オリジナル **UNDERRUN** の制作者に感謝します。

- コンセプト・グラフィック・プログラム: [Dominic Szablewski](https://phoboslab.org/)（[@phoboslab](https://github.com/phoboslab)）
- 音楽: Andreas Lösch（[no-fate.net](https://no-fate.net/)）
- オリジナルリポジトリ: https://github.com/phoboslab/underrun

## ライセンス

MIT License（オリジナルを継承）。詳細は [LICENSE.md](LICENSE.md) を参照してください。Copyright (c) 2018 Dominic Szablewski.

また、本プロジェクトは **Sonant-X** ライブラリ（大幅に改変済み）を利用しています。Sonant-X は zlib ライセンスで公開されています。
