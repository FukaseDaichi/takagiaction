import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages のプロジェクトページは /takagiaction/ 配下で配信されるため相対パスにする
  base: './',
  // PORT はエージェントのプレビュー環境（.claude/launch.json の autoPort）が渡す。
  // 複数セッションが同時に dev サーバーを立てても衝突しないようにする
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    // vitest 標準の除外（configDefaults.exclude）は .claude/ を含まないため、
    // .claude/worktrees/ 配下にロックされたまま残る過去の feature worktree の
    // テストまで二重に拾ってしまう。ここで明示的に除外する。
    // test.exclude は標準の除外を追加ではなく丸ごと上書きするので、
    // configDefaults.exclude を展開して失わないようにする
    exclude: [...configDefaults.exclude, '.claude/**'],
    // Node の実験的 localStorage グローバルを外す。理由は source/test-setup.ts
    setupFiles: ['./source/test-setup.ts'],
  },
})
