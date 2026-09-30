import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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

/**
 * The talk's deck, served beside the game at `/deck/` so it can be presented
 * from any machine with a browser. The file is `docs/deck/deck.html`, built by
 * `pnpm deck` and checked in; this copies it as it is, so the deck is whatever
 * `main` holds. A deck-only deploy does not move `SESSION_RULES_VERSION`, so it
 * is safe during a session.
 */
function deck(): Plugin {
  const source = r('../../docs/deck/deck.html')
  return {
    name: 'flow-deck',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/deck/' && req.url !== '/deck/index.html') return next()
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(readFileSync(source, 'utf8'))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'deck/index.html', source: readFileSync(source, 'utf8') })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), deck()],
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
