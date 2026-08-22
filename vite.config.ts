import { defineConfig } from 'vite'

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
})
