import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@flow/sim': r('./packages/sim/src/index.ts'),
      '@flow/content': r('./packages/content/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'docs/**/*.test.ts'],
    environment: 'node',
  },
})
