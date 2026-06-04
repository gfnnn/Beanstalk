// Vitest config for the functions workspace. Tests target Node: the worker
// handlers are plain ES modules with no DOM. The network (Resend) and the D1
// binding are faked in the suite, so runs are hermetic — no real calls.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
})
