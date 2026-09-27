import type {
  BoardEntry,
  BoardRun,
  LoggedCommand,
  SessionInfo,
  SessionStatus,
  SubmitOutcome,
} from '@flow/sim'

/**
 * The leaderboard API (apps/server). Same origin in production; in dev, Vite
 * proxies `/api` to `wrangler dev`.
 */

export type Player = { playerId: string; name: string }

async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const response = await fetch(
    `/api/sessions${path}`,
    init
      ? {
          method: init.method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(init.body),
        }
      : {},
  )
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? `request failed (${response.status})`)
  return body as T
}

export const api = {
  create: (seed?: number) => call<SessionInfo>('', { method: 'POST', body: { seed } }),
  status: (code: string) => call<SessionStatus>(`/${code}`),
  join: (code: string, player: Player) =>
    call<SessionStatus>(`/${code}/join`, { method: 'POST', body: player }),
  submit: (code: string, player: Player, commands: LoggedCommand[]) =>
    call<SubmitOutcome>(`/${code}/results`, { method: 'POST', body: { ...player, commands } }),
  board: (code: string) => call<{ entries: BoardEntry[] }>(`/${code}/results`),
  run: (code: string, playerId: string) => call<BoardRun>(`/${code}/results/${playerId}`),
}

/**
 * Who this browser is, for the length of a session. Kept in localStorage so a
 * reload or a second run replaces the player's entry rather than adding a
 * stranger with the same name. When storage is unavailable the id lives for
 * the page, which only costs a duplicate row.
 */
export function playerId(): string {
  const fresh = crypto.randomUUID()
  try {
    const existing = localStorage.getItem('flow.playerId')
    if (existing) return existing
    localStorage.setItem('flow.playerId', fresh)
  } catch {
    // Private windows and blocked storage: fall through to a per-page id.
  }
  return fresh
}

export function rememberedName(): string {
  try {
    return localStorage.getItem('flow.name') ?? ''
  } catch {
    return ''
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem('flow.name', name)
  } catch {
    // Not worth failing a join over.
  }
}

export function joinUrl(code: string): string {
  return `${location.origin}${location.pathname}?join=${code}`
}
