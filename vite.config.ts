import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages のプロジェクトページは /takagiaction/ 配下で配信されるため相対パスにする
  base: './',
  resolve: {
    // Task 2〜7 は同名の .js（旧実装）と .ts（移行後）が並存する。Vite の既定の
    // 拡張子解決順は .js が .ts より先のため、拡張子なし import (`./random` 等)
    // が旧 .js に解決されてしまう。.ts 系を先に解決させて新実装を使わせる。
    // Task 8 で旧 .js を削除したら本来は不要だが、明示しておいて害はない。
    extensions: ['.mjs', '.mts', '.ts', '.js', '.jsx', '.tsx', '.json'],
  },
  build: {
    outDir: 'dist',
  },
})
