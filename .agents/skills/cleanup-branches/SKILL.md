---
name: cleanup-branches
description: マージ済みのブランチをリモート・ローカル・ワークツリーごと削除する。「不要なブランチを削除して」「ブランチを整理して」と依頼されたときに使う。未マージのブランチは削除せず一覧提示にとどめる。
---

`git fetch --prune` で remote-tracking を最新化してから、以下を順に実行せよ。

## 削除候補の判定

`git log --oneline origin/main..<branch>` が空のブランチだけを候補にする。
`main`、現在チェックアウト中のブランチ、`origin/HEAD` は常に対象外。
未マージコミットを持つブランチは候補にせず、失われるコミットを一覧で提示するだけにとどめよ。

削除を実行する前に、候補の一覧を必ず出力せよ。

## ワークツリー

`git worktree list` で候補ブランチのワークツリーを探し、次の順で処理する。

1. `git -C <path> status --porcelain` が空でなければ削除せず、内容を提示して止まる。
2. ワークツリー内の junction / symlink を先に解除する。`node_modules` などを junction で置いていると、再帰削除でリンク先まで失う。
   検出は `Get-ChildItem <path> -Force | Where-Object { $_.LinkType }`、解除は `cmd /c rmdir <junction>`。
   解除後、リンク先が残っていることを確認してから次へ進む。
3. `git worktree remove <path>` を実行し、その後 `git worktree prune` で登録を掃除する。

## 削除

ローカルは `git branch -d`、リモートは `git push origin --delete <branch>`。
ローカル `main` が `origin/main` より遅れていたら `git merge --ff-only origin/main` で追いつかせる。

## 禁止

- `main` を削除しない。
- `git branch -D` と `git push --force` を使わない。`-d` が拒否されたら未マージなので、削除せず報告に回す。

最後に、削除したものと、残したもの（残した理由付き）を一覧で報告せよ。
