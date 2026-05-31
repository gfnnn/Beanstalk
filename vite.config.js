import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        home:      resolve(__dirname, 'index.html'),
        portfolio: resolve(__dirname, 'portfolio/index.html'),
      }
    }
  },
  css: {
    devSourcemap: true
  }
})
