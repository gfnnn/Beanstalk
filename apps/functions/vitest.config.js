// Vitest config for the functions workspace. Tests target Node: the Netlify
// functions are plain ES modules with no DOM. The network (Resend) and
// @netlify/blobs are mocked in the suite, so runs are hermetic — no real calls.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['netlify/functions/**'],
      reporter: ['text', 'html'],
    },
  },
})
