#!/usr/bin/env tsx
import { STATION_IDS, type StationId } from '@flow/content'
import {
  initState,
  run,
  summarize,
  type Command,
  type GameState,
  type RunSummary,
} from '@flow/sim'

/**
 * Balance sweeps. Hand-tuning a system with this many coupled feedback loops
 * does not converge; running it a few hundred times and reading the shape does.
 *
 *   pnpm sweep [--ticks 4000] [--seeds 12]
 */

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  const key = (process.argv[i] ?? '').replace(/^--/, '')
  args.set(key, process.argv[i + 1] ?? '')
}
const ticks = Number(args.get('ticks') ?? 4000)
const seedCount = Number(args.get('seeds') ?? 12)

/** The default line shape, scaled. Multiplier 1 is a tight line; 4 is a hoarding one. */
const SHAPE: Record<StationId, number> = { spec: 2, implement: 4, review: 2, ci: 3, deploy: 2 }
const limitsAt = (m: number) =>
  Object.fromEntries(STATION_IDS.map((id) => [id, Math.round(SHAPE[id] * m)])) as Record<
    StationId,
    number
  >

/** A diligent player: rebase the moment something goes stale. */
const rebaseEverything = (state: GameState): Command[] =>
  state.items
    .filter((it) => it.stale)
    .map((it) => ({ kind: 'resolveStale', itemId: it.id, choice: 'rebase' }))

const mean = (rows: RunSummary[], pick: (r: RunSummary) => number) =>
  rows.reduce((a, r) => a + pick(r), 0) / rows.length

const pad = (s: string | number, n: number) => String(s).padStart(n)

console.log(`ticks=${ticks} seeds=${seedCount}\n`)
console.log(
  ['wip×', 'shipped', 'lead(t)', 'rework', 'rebase', 'wip', 'backlog', 'quality']
    .map((h, i) => pad(h, i === 0 ? 5 : 9))
    .join(''),
)

for (const m of [0.75, 1, 1.5, 2, 3, 4]) {
  const rows = Array.from({ length: seedCount }, (_, i) =>
    summarize(run(initState({ seed: i + 1, wipLimits: limitsAt(m) }), ticks, rebaseEverything)),
  )
  console.log(
    [
      pad(m, 5),
      pad(mean(rows, (r) => r.shipped).toFixed(0), 9),
      pad(mean(rows, (r) => r.avgLeadTimeTicks).toFixed(0), 9),
      pad(mean(rows, (r) => r.reworks).toFixed(0), 9),
      pad(mean(rows, (r) => r.rebases).toFixed(0), 9),
      pad(mean(rows, (r) => r.wip).toFixed(1), 9),
      pad(mean(rows, (r) => r.backlog).toFixed(0), 9),
      pad(mean(rows, (r) => r.avgTrueQuality).toFixed(2), 9),
    ].join(''),
  )
}
