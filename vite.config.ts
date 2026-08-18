import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages のプロジェクトページは /takagiaction/ 配下で配信されるため相対パスにする
  base: './',
  build: {
    outDir: 'dist',
  },
})
