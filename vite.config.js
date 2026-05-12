import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // ★ Bug1修正: base を '/' にする（dev server で /overlay.html が解決できなかった）
  // buildのみ './' にして dev は '/' のまま使う
  base: '/',
  resolve: {
    alias: {
      '@':        path.resolve(__dirname, './src'),
      '@core':    path.resolve(__dirname, './src/core'),
      '@ui':      path.resolve(__dirname, './src/ui'),
      '@widgets': path.resolve(__dirname, './src/widgets'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // build時は './' でOK（Electronがローカルファイルとして開くため）
    base: './',
    rollupOptions: {
      input: {
        main:    path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['.'] },
  }
})
