import { useEffect, useState } from 'react'
import { DEFAULT_TUNING, SESSION_WIN_UNFINISHED, STATION_LABELS } from '@flow/content'
import {
  SESSION_DEFAULT_SEED,
  SESSION_TICKS,
  type BoardEntry,
  type BoardRun,
  type LoggedCommand,
  type SessionStatus,
} from '@flow/sim'
import { api, joinUrl, rememberKey, rememberedKey } from './api.js'
import { QrCode } from './QrCode.js'

const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour
const TICKS_PER_DAY = TICKS_PER_HOUR * 8
/** Fast enough to feel live on a projector, slow enough that a room of fifty is nothing. */
const POLL_MS = 2500

/**
 * The facilitator's screen: start a session, put its code on the projector,
 * and watch the leaderboard fill. Clicking a row shows what that player did
 * and when — the debrief is the top player's run, not a slide.
 */
export function Presenter({ code }: { code: string | null }) {
  return code === null ? <StartSession /> : <LiveSession code={code.toUpperCase()} />
}

function StartSession() {
  const [seed, setSeed] = useState(String(SESSION_DEFAULT_SEED))
  const [key, setKey] = useState(rememberedKey)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await api.create(key, seed.trim() === '' ? undefined : Number(seed))
      rememberKey(key)
      // A reload of the projector should not start a second session.
      window.location.search = `?present=${session.code}`
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <form className="card join" onSubmit={start}>
        <div className="brand">
          Flow State <span className="brand__tag">presentation mode</span>
        </div>
        <p className="hint">
          Start a session and everyone who joins plays the same seed for the same{' '}
          {(SESSION_TICKS / TICKS_PER_DAY).toFixed(0)} days. Each run is replayed on the server before it
          reaches the leaderboard, so every score on it was earned.
        </p>
        <label className="field">
          <span>Presenter key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          <span>Seed</span>
          <input
            value={seed}
            onChange={(e) => setSeed(e.currentTarget.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Starting…' : 'Start session'}
        </button>
      </form>
    </main>
  )
}

function LiveSession({ code }: { code: string }) {
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [entries, setEntries] = useState<BoardEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [enlarged, setEnlarged] = useState(false)

  useEffect(() => {
    let live = true
    const poll = async () => {
      try {
        const [s, b] = await Promise.all([api.status(code), api.board(code)])
        if (!live) return
        setStatus(s)
        setEntries(b.entries)
        setError(null)
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [code])

  const url = joinUrl(code)
  const closed = status !== null && Date.now() >= status.closesAt

  return (
    <main className="present">
      <header className="present__join">
        <button
          type="button"
          className="present__qr"
          title="Show larger, for the back of the room"
          onClick={() => setEnlarged(true)}
        >
          <QrCode value={url} />
        </button>
        <div>
          <div className="present__label">Join at</div>
          <a className="present__url" href={url} target="_blank" rel="noreferrer">
            {url.replace(/^https?:\/\//, '')}
          </a>
        </div>
        <div>
          <div className="present__label">Code</div>
          <div className="present__code">{code}</div>
        </div>
        <div className="present__counts">
          <div>
            <b>{status?.joined ?? '–'}</b> joined
          </div>
          <div>
            <b>{status?.finished ?? '–'}</b> finished
          </div>
          {status && <div className="present__seed">seed {status.seed}</div>}
        </div>
      </header>

      {enlarged && (
        // Anywhere dismisses it: the presenter is at a laptop mid-talk, not
        // hunting for a close button.
        <div
          className="overlay qr-overlay"
          role="dialog"
          aria-label="Join QR code"
          onClick={() => setEnlarged(false)}
        >
          <QrCode value={url} className="qr-overlay__code" />
          <div className="qr-overlay__code-text">{code}</div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {closed && (
        <p className="hint">
          This session has closed: it takes no new players or runs. The board stays here for a
          week.
        </p>
      )}

      <div className="present__body">
        <section className="present__board">
          <h2>Leaderboard</h2>
          {entries.length === 0 ? (
            <p className="hint">
              Scores appear here as players finish. A score is every item shipped, weighted by the
              quality it shipped at. A player kept up if {SESSION_WIN_UNFINISHED} or fewer items
              were unfinished when their clock stopped.
            </p>
          ) : (
            <table className="board-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="board-table__name">Name</th>
                  <th>Score</th>
                  <th title="Kept up: unfinished work at the end, and whether it was within the win line">
                    Kept up
                  </th>
                  <th>Shipped</th>
                  <th>Quality</th>
                  <th>Lead time</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={entry.playerId}
                    className={selected === entry.playerId ? 'is-selected' : undefined}
                    onClick={() =>
                      setSelected((current) => (current === entry.playerId ? null : entry.playerId))
                    }
                  >
                    <td>{i + 1}</td>
                    <td className="board-table__name">{entry.name}</td>
                    <td className="board-table__score">{entry.score.toFixed(1)}</td>
                    <td className={entry.won ? 'board-table__kept board-table__won' : 'board-table__kept'}>
                      {entry.unfinished === null ? '–' : `${entry.won ? '✓' : '✗'} ${entry.unfinished} left`}
                    </td>
                    <td>{entry.shipped}</td>
                    <td>{Math.round(entry.avgQuality * 100)}%</td>
                    <td>{(entry.avgLeadTimeTicks / TICKS_PER_HOUR).toFixed(1)}h</td>
                    <td>{entry.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {selected !== null && (
          <Debrief code={code} playerId={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </main>
  )
}

/** What one player did, in the order they did it. */
function Debrief({
  code,
  playerId,
  onClose,
}: {
  code: string
  playerId: string
  onClose: () => void
}) {
  const [run, setRun] = useState<BoardRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setRun(null)
    api
      .run(code, playerId)
      .then((r) => live && setRun(r))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [code, playerId])

  return (
    <section className="present__debrief">
      <div className="debrief__head">
        <h2>{run ? `${run.name}'s best run` : 'Loading…'}</h2>
        <button type="button" className="btn btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {run && <Timeline commands={run.commands} />}
    </section>
  )
}

function Timeline({ commands }: { commands: LoggedCommand[] }) {
  const steps = collapse(commands)
  const count = (kind: LoggedCommand['command']['kind']) =>
    commands.filter((c) => c.command.kind === kind).length
  const stale = (choice: string) =>
    commands.filter((c) => c.command.kind === 'resolveStale' && c.command.choice === choice).length

  return (
    <>
      <p className="debrief__summary">
        {count('assignWorker')} moves · {count('hire')} agents
        {count('removeAgent') > 0 && <> ({count('removeAgent')} removed)</>} · {steps.filter((s) => s.command.kind === 'setWipLimit').length}{' '}
        WIP changes · {stale('rebase')} rebased · {stale('abandon')} abandoned ·{' '}
        {stale('shipAnyway')} shipped stale
      </p>
      {steps.length === 0 ? (
        <p className="hint">Did nothing at all — and that is a result too.</p>
      ) : (
        <ol className="debrief__list">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="debrief__when">day {(s.tick / TICKS_PER_DAY + 1).toFixed(1)}</span>
              {describe(s.command)}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/**
 * A slider drag is dozens of commands and one decision. Keep the value the
 * player let go at.
 */
function collapse(commands: LoggedCommand[]): LoggedCommand[] {
  const DRAG_TICKS = 10
  const out: LoggedCommand[] = []
  for (const entry of commands) {
    const prev = out[out.length - 1]
    if (
      prev !== undefined &&
      entry.command.kind === 'setWipLimit' &&
      prev.command.kind === 'setWipLimit' &&
      prev.command.station === entry.command.station &&
      entry.tick - prev.tick <= DRAG_TICKS
    ) {
      out[out.length - 1] = entry
    } else {
      out.push(entry)
    }
  }
  return out
}

function describe(command: LoggedCommand['command']): string {
  switch (command.kind) {
    case 'setWipLimit':
      return `${STATION_LABELS[command.station]} WIP limit → ${Math.max(1, Math.floor(command.limit))}`
    case 'assignWorker':
      return `Moved ${command.workerId} to ${STATION_LABELS[command.to]}`
    case 'hire':
      return `Added an agent at ${STATION_LABELS[command.station]}`
    case 'removeAgent':
      return `Removed agent ${command.workerId}`
    case 'resolveStale':
      return command.choice === 'rebase'
        ? `Rebased ${command.itemId}`
        : command.choice === 'abandon'
          ? `Abandoned ${command.itemId}`
          : `Shipped ${command.itemId} stale`
  }
}
