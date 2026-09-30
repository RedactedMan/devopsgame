import {
  SESSION_DEFAULT_SEED,
  SESSION_RULES_VERSION,
  SESSION_TICKS,
  parseCommandLog,
  verifyRun,
} from '@flow/sim'
import { Session } from './session.js'

export { Session }

/**
 * The leaderboard API. Everything that is not `/api/*` is the static game,
 * served by the assets binding before this code runs (wrangler.jsonc).
 *
 *   GET  /api/health
 *   POST /api/sessions                     { seed?, ticks? }          → session
 *   GET  /api/sessions/:code                                          → session + counts
 *   POST /api/sessions/:code/join          { playerId, name, rules }
 *   POST /api/sessions/:code/results       { playerId, name, rules, commands } → verified score, rank
 *   GET  /api/sessions/:code/results                                  → the board
 *   GET  /api/sessions/:code/results/:id                              → one run, for the debrief
 *
 * No player accounts. A player is a random id their browser keeps, and a score
 * is whatever replaying their commands produces, so the only way to claim a
 * score is to have made the decisions that earn it.
 *
 * Replays cost CPU, and CPU is billed with no hard cap, so the API is shut to
 * strangers in two ways. Creating a session takes the presenter key (a Worker
 * secret, `wrangler secret put PRESENTER_KEY`), so the only sessions that exist
 * are ones the presenter started. And a session stops taking players and runs
 * `SUBMIT_WINDOW_MS` after it starts, refused before any replay. What is left
 * is a code on a projector for a day.
 */

type Env = {
  SESSIONS: DurableObjectNamespace<Session>
  /** Unset means nobody can create a session. Fail closed. */
  PRESENTER_KEY?: string
}

/** No 0/O or 1/I/L: read off a projector across a room. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const NAME_MAX = 24
const MIN_TICKS = 400

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.pathname === '/api/health') return json({ ok: true })
    if (parts[0] !== 'api' || parts[1] !== 'sessions') return json({ error: 'not found' }, 404)

    try {
      if (parts.length === 2 && request.method === 'POST') return await createSession(request, env)

      const code = (parts[2] ?? '').toUpperCase()
      if (!isCode(code)) return json({ error: 'no such session' }, 404)
      const stub = env.SESSIONS.getByName(code)

      if (parts.length === 3 && request.method === 'GET') {
        const info = await stub.info()
        return info === null ? json({ error: 'no such session' }, 404) : json(info)
      }
      if (parts[3] === 'join' && parts.length === 4 && request.method === 'POST') {
        const info = await stub.info()
        if (info === null) return json({ error: 'no such session' }, 404)
        if (Date.now() >= info.closesAt) return closed()
        const body = await readBody(request)
        if (!sameRules(body)) return staleRules()
        const player = parsePlayer(body)
        if (typeof player === 'string') return json({ error: player }, 400)
        if (!(await stub.join(player.playerId, player.name))) return closed()
        return json(info)
      }
      if (parts[3] === 'results' && parts.length === 4) {
        if (request.method === 'GET') return json({ entries: await stub.board() })
        if (request.method === 'POST') return await submit(request, stub)
      }
      if (parts[3] === 'results' && parts.length === 5 && request.method === 'GET') {
        const run = await stub.run(parts[4] as string)
        return run === null ? json({ error: 'no such run' }, 404) : json(run)
      }
      return json({ error: 'not found' }, 404)
    } catch (error) {
      console.error(JSON.stringify({ message: 'request failed', path: url.pathname, error: String(error) }))
      return json({ error: 'internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

async function createSession(request: Request, env: Env): Promise<Response> {
  if (!(await isPresenter(request, env))) return json({ error: 'wrong presenter key' }, 401)
  const body = await readBody(request)
  const requested = (body as { seed?: unknown } | null)?.seed
  const seed =
    requested === undefined || requested === null || requested === ''
      ? SESSION_DEFAULT_SEED
      : Number(requested)
  if (!Number.isSafeInteger(seed) || seed < 0) return json({ error: 'seed must be a whole number' }, 400)
  // Shorter games are for tests and short slots. Never longer than the length
  // the balance was measured at.
  const requestedTicks = (body as { ticks?: unknown } | null)?.ticks
  const ticks = requestedTicks === undefined ? SESSION_TICKS : Number(requestedTicks)
  if (!Number.isInteger(ticks) || ticks < MIN_TICKS || ticks > SESSION_TICKS) {
    return json({ error: `ticks must be between ${MIN_TICKS} and ${SESSION_TICKS}` }, 400)
  }

  // 31^5 is 28 million codes. A collision is vanishingly rare, and when one
  // happens the object that owns the code refuses it and we draw again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const created = await env.SESSIONS.getByName(code).create(code, seed, ticks)
    if (created !== null) return json(created, 201)
  }
  return json({ error: 'could not allocate a session code' }, 503)
}

async function submit(request: Request, stub: DurableObjectStub<Session>): Promise<Response> {
  const info = await stub.info()
  if (info === null) return json({ error: 'no such session' }, 404)
  // Before parsing or replaying: a closed session costs nothing to ask.
  if (Date.now() >= info.closesAt) return closed()

  const body = await readBody(request)
  // Before replaying: a run from another version of the game would be scored
  // under rules it was not played under.
  if (!sameRules(body)) return staleRules()
  const player = parsePlayer(body)
  if (typeof player === 'string') return json({ error: player }, 400)
  const log = parseCommandLog((body as { commands?: unknown }).commands, info.ticks)
  if (!log.ok) return json({ error: log.error }, 400)

  // The score is not read from the request. It is the replay.
  const result = verifyRun({ seed: info.seed, commands: log.commands }, info.ticks)
  const outcome = await stub.submit(player.playerId, player.name, result, log.commands)
  return outcome === null ? closed() : json(outcome)
}

/**
 * `Authorization: Bearer <key>`. Both sides are hashed before comparing, so the
 * comparison is constant-time and length-independent.
 */
async function isPresenter(request: Request, env: Env): Promise<boolean> {
  const expected = env.PRESENTER_KEY
  if (!expected) return false
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!given) return false
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  return crypto.subtle.timingSafeEqual(a, b)
}

function closed(): Response {
  return json({ error: 'this session has closed' }, 410)
}

function sameRules(body: unknown): boolean {
  return (body as { rules?: unknown } | null)?.rules === SESSION_RULES_VERSION
}

function staleRules(): Response {
  return json(
    {
      error: 'the game was updated while this page was open. Reload to play the current version',
      rules: SESSION_RULES_VERSION,
    },
    409,
  )
}

function parsePlayer(body: unknown): { playerId: string; name: string } | string {
  const { playerId, name } = (body ?? {}) as { playerId?: unknown; name?: unknown }
  if (typeof playerId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(playerId)) {
    return 'playerId is required'
  }
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  if (clean.length === 0) return 'name is required'
  return { playerId, name: clean }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}
