# Agent Skill 管理

このファイルは、このリポジトリで Codex と Claude Code が共有する Agent Skill の管理ルールの正本である。`AGENTS.md` がこのファイルを参照し、`CLAUDE.md` は `@AGENTS.md` を読み込むため、両ホストから同じルールへ到達する。

探索パス、呼び出し方、frontmatter を変更する前に、[OpenAI の Build skills](https://learn.chatgpt.com/docs/build-skills) と [Anthropic の Extend Claude with skills](https://code.claude.com/docs/en/skills) の最新版を再確認する。

## 正本と公開先

- 唯一の編集元は `.agents/skills/<name>/` であり、`.agents/skills/<name>/SKILL.md` を必須とする。
- Codex はリポジトリの `.agents/skills/` を直接探索する。明示実行は `$<name>`、一覧確認は `/skills` を使う。
- Claude Code は `.claude/skills/<name>/` を探索する。明示実行は `/<name>`、一覧確認は `/skills` を使う。
- `.claude/skills/<name>/SKILL.md` は正本から生成する**参照スタブ**であり、直接編集しない。生成物だが Git で追跡する。

## 共有方式: 実ファイルの参照スタブ

`.claude/skills/<name>/SKILL.md` を**通常ファイル**として置く。frontmatter の `name` / `description` を正本と一致させ、本文は正本を読ませる指示だけにする。

```markdown
---
name: <name>
description: <正本と同じ description>
---

このファイルは Claude Code 用の参照スタブ。スキルの実体は `.agents/skills/<name>/SKILL.md`。
実体を読み、その手順に従って実行せよ。編集は実体側だけに行う。
```

- 手順本体を二重管理しない。スタブに書くのは frontmatter と「実体を読め」の指示だけである。二重管理になるのは `description` の 1 行だけで、`npm run skills:check` がその一致を機械的に検証する。
- 補助ファイル（`LICENSE.txt`、`references/` など）はスタブ側へ複製しない。実体を読んだ先から辿れる。
- 正本 `SKILL.md` の中からスクリプトや参照ファイルを指すパスは、**リポジトリルート相対**で書く（例: `.agents/skills/<name>/scripts/foo.py`）。スタブ経由で起動するとホストが渡すスキルのベースディレクトリは `.claude/skills/<name>` になるため、`scripts/foo.py` のようなスキルディレクトリ相対の書き方は解決できない。
- 実ファイルなので OS・Git 設定・チェックアウト方式に依存しない。クラウドセッション、ワークツリー、fresh clone、他 OS でも同じように登録される（Claude Code のクラウドセッションはリポジトリにコミットされた `.claude/skills/` を読む）。

### 採用しない方式

以下は検討しない。提案し直さないこと。

- **symlink / junction**: `core.symlinks=false` の環境（このリポジトリの Windows 環境が該当する）では、追跡した symlink が「リンク先パスが 1 行だけ書かれた通常ファイル」に展開され、`SKILL.md` が存在しなくなる。追跡せずセットアップで生成する方式にしても、`npm install` を挟まない clone やクラウド実行では公開先が空になる。参照スタブに対する利点が無い。
- **`.claude/skills/` へのファイル一式のコピー・同期**: スタブで実体を読ませれば補助ファイルも辿れる。二重管理とドリフトだけが増える。

### 判断を誤らせる罠

- **ローカルで呼び出せることは、共有できている証拠にならない。** 壊れた公開先でも、モデルがパスを手繰って実行できてしまう場合がある。「ローカルでは動くがクラウド実行・ワークツリー実行では呼び出せない」はこの症状である。判定は `test -f .claude/skills/<name>/SKILL.md` と、その内容が実際に読めることで行う。
- **Git インデックスが `120000` でも実リンクとは限らない。** `core.symlinks=false` では通常ファイルに展開される。インデックスだけで symlink と断定しない。
- **symlink を実ファイルで上書きしただけでは Git のモードが `120000` のまま残る。** `git rm --cached <path>` → `git add <path>` で登録し直し、`git ls-files -s -- .claude/skills/` に `120000` が無いことを確認する（パスをディレクトリに置き換えた場合は自動的に `100644` になる）。

## SKILL.md の互換性

- 1 スキルを 1 ディレクトリに置き、frontmatter に `name` と `description` を必ず書く。`name` はディレクトリ名と一致させる（Claude Code では公開先のディレクトリ名が `/<name>` を決める）。
- `description` は自動選択に使われる。用途・起動条件・非対象を具体的に書く。1 行で書く（スタブ生成がブロックスカラーを扱わない）。
- 共通部分は Agent Skills 仕様（`name` / `description` / `license` / `compatibility` / `metadata` / `allowed-tools`）に収める。
- Claude Code 専用または Codex 専用の frontmatter、動的展開、補助メタデータを追加する前に、もう一方が拒否または誤動作しないことを両者の最新公式仕様で確認する。ホスト固有機能が必要な場合は、共通の `SKILL.md` を壊さずホスト固有設定を別ファイルへ分離する。

## 作業手順

### 新規作成・外部からのインストール

1. `.agents/skills/<name>/` だけにスキル一式を作成またはインストールする。インストーラーが別の場所へ配置した場合は、内容を確認して正本へ移す。
2. 同名の `.claude/skills/<name>` がすでにある場合は、内容を比較する。生成した参照スタブでない実体は削除せず、差分を示して人に確認する。
3. `npm run skills:setup` を実行してスタブを生成する。
4. `npm run skills:check` を実行し、生成されたスタブを他の変更と同じコミット群に含める。

### 更新

1. `.agents/skills/<name>/` だけを編集する。
2. `description` を変えた場合は `npm run skills:setup` を実行してスタブへ反映する。本文だけの変更ならスタブの更新は不要である（スタブは本文を持たない）。
3. `npm run skills:check` を実行し、両ホストから同じ `SKILL.md` へ到達できることを確認する。

### 削除

1. 対象名、`.agents/skills/<name>`、`.claude/skills/<name>` の実体を確認する。
2. 正本を削除する。
3. `npm run skills:setup` を実行する。正本を失った参照スタブだけが除去される。
4. `.gitkeep` は削除しない。`npm run skills:check` で残骸がないことを確認する。

## 検証

`npm run skills:check` は次を検証する。`npm test` と `npm run build` の先頭でも走る。

- 各正本に `SKILL.md` があり、frontmatter の `name` と `description` が存在すること
- `name` がディレクトリ名と一致すること
- `.claude/skills/<name>/SKILL.md` が読め、期待するスタブ本文と完全に一致すること（`description` のドリフト検出を含む）
- `.claude/skills/<name>` が通常ディレクトリであり、symlink 残骸やリンク先文字列だけの通常ファイルでないこと
- 正本に対応しない余分な公開先が無いこと

スキル作業後はこの検証に加えて `git status --short` と `git ls-files -s -- .claude/skills/ .claude/commands/` を確認し、`120000` のエントリが無いことを確かめる。
