# Agent Skill 管理

このファイルは、このリポジトリで Codex と Claude Code が共有する Agent Skill の管理ルールの正本である。`AGENTS.md` がこのファイルを参照し、`CLAUDE.md` は `@AGENTS.md` を読み込むため、両ホストから同じルールへ到達する。

探索パス、呼び出し方、リンク対応を変更する前に、[OpenAI の Build skills](https://developers.openai.com/codex/skills) と [Anthropic の Extend Claude with skills](https://code.claude.com/docs/en/slash-commands) の最新版を再確認する。

## 正本と公開先

- 唯一の編集元は `.agents/skills/<name>/` であり、`.agents/skills/<name>/SKILL.md` を必須とする。
- Codex はリポジトリの `.agents/skills/` を直接探索する。明示実行は `$<name>`、一覧確認は `/skills` を使う。
- Claude Code は `.claude/skills/<name>/` を探索する。明示実行は `/<name>`、一覧確認は `/skills` を使う。
- `.claude/skills/<name>` は生成物であり、直接編集しない。`.gitignore` で除外し、`.claude/skills/.gitkeep` だけを追跡する。

## 共有方式

`npm run skills:setup` が `.agents/skills/` の各スキルを `.claude/skills/` に公開する。

- Unix/macOS では `.claude/skills/<name>` から `../../.agents/skills/<name>` への相対ディレクトリ symlink を作る。
- Windows では権限や Developer Mode に依存しない directory junction を作る。すでに正しい symlink または junction がある場合はそのまま利用する。
- 通常ディレクトリや内容の異なる通常ファイルを上書きしない。Git が symlink を展開した結果である、期待するリンク先パスだけを1行に持つ通常ファイルに限り、安全を確認してリンクへ置換する。
- 正本に存在しない公開先は、期待する正本を指す symlink、junction、または Git の symlink プレースホルダーと確認できた場合だけ削除する。それ以外はエラーにして人へ確認する。

Git の `core.symlinks=false` が設定された Windows では、追跡済み symlink が通常ファイルとしてチェックアウトされ得る。このため、Git にリンクを保存する方式は採用せず、正本だけを追跡して OS ごとのリンクをセットアップで生成する。コピー同期はドリフトを作るため採用しない。

## SKILL.md の互換性

- 1スキルを1ディレクトリに置き、frontmatter に `name` と `description` を必ず書く。`name` はディレクトリ名と一致させる。
- 共通部分は Agent Skills 仕様に合わせる。`description` には用途、起動条件、非対象を具体的に書き、自動選択に使える内容にする。
- Claude Code 専用または Codex 専用の frontmatter、動的展開、補助メタデータを追加する前に、もう一方が拒否または誤動作しないことを両者の最新公式仕様で確認する。
- ホスト固有機能が必要な場合は、共通の `SKILL.md` を壊さず、ホスト固有設定を別ファイルへ分離する。

## 作業手順

### 新規作成・外部からのインストール

1. `.agents/skills/<name>/` だけにスキル一式を作成またはインストールする。インストーラーが別の場所へ配置した場合は、内容を確認して正本へ移す。
2. 同名の `.claude/skills/<name>` がすでにある場合は、リンク種別と内容を比較する。内容が異なる実体は削除せず、差分を示して確認する。
3. `npm run skills:setup` を実行して公開先を生成する。
4. `npm run skills:check` を実行する。

### 更新

1. `.agents/skills/<name>/` だけを編集する。
2. `npm run skills:check` を実行し、両ホストから同じ `SKILL.md` が読めることを確認する。リンク方式なので更新は即時反映され、コピー操作は不要である。

### 削除

1. 対象名、`.agents/skills/<name>`、`.claude/skills/<name>` のリンク種別と参照先を確認する。
2. 正本を削除する。
3. `npm run skills:setup` を実行する。正本を指していた生成リンクだけが除去される。
4. `.gitkeep` は削除しない。`npm run skills:check` で残骸がないことを確認する。

## clone 後と新しい PC

`npm install` は `postinstall` から `npm run skills:setup` を実行する。依存関係のインストールを省略する場合、Claude Code を起動する前に `npm run skills:setup` を明示的に実行する。セットアップ前に Claude Code を起動して `.claude/skills/` が監視対象になっていなかった場合は、セットアップ後に Claude Code を再起動する。

## 検証

`npm run skills:check` は次を検証する。

- 各正本に `SKILL.md` があり、frontmatter の `name` と `description` が存在すること
- `name` がディレクトリ名と一致すること
- `.claude/skills/<name>` が正しい symlink または junction であり、通常ファイルや通常ディレクトリではないこと
- 公開先の `SKILL.md` が読め、正本と SHA-256 が一致すること
- 壊れたリンク、リンク先文字列だけの通常ファイル、正本にない余分な公開先がないこと

スキル作業後はこの検証に加え、`git status --short` と `git ls-files -s -- .claude/skills/` を確認する。Git インデックスに `.claude/skills/<name>` の `120000` エントリを追加しない。追跡対象は `.gitkeep` だけである。
