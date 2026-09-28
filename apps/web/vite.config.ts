import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * The commit being built, for the stamp in a save file. Workers Builds sets
 * `WORKERS_CI_COMMIT_SHA`; locally it is whatever git says.
 */
function buildId(): string | null {
  const ci = process.env.WORKERS_CI_COMMIT_SHA
  if (ci) return ci.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildId()) },
  server: {
    // The leaderboard API. Run `pnpm dev:server` alongside `pnpm dev`.
    proxy: { '/api': 'http://localhost:8787' },
  },
  resolve: {
    alias: {
      '@flow/sim': r('../../packages/sim/src/index.ts'),
      '@flow/content': r('../../packages/content/src/index.ts'),
    },
  },
})
