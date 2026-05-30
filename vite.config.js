import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        portfolio: resolve(__dirname, 'portfolio/index.html'),
        about: resolve(__dirname, 'about/index.html'),
        booking: resolve(__dirname, 'booking/index.html'),
        contact: resolve(__dirname, 'contact/index.html'),
      }
    }
  },
  css: {
    devSourcemap: true
  }
})
