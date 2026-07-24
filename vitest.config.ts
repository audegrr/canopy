import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**', '.vercel/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
