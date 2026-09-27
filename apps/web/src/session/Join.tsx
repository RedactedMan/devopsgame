import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TUNING } from '@flow/content'
import type { SessionStatus, SubmitOutcome } from '@flow/sim'
import { useSim, type SimHandle } from '../bridge/useSim.js'
import { Board } from '../render/Board.js'
import { Hud } from '../ui/Hud.js'
import { api, playerId, rememberName, rememberedName, type Player } from './api.js'

const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour

/**
 * A player arriving from the presenter's link. Name, then the game — nothing
 * else stands between the room and playing.
 */
export function Join({ code: initialCode }: { code: string | null }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase())
  const [name, setName] = useState(rememberedName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<{ session: SessionStatus; player: Player } | null>(null)
  const [id] = useState(playerId)

  if (joined) return <SessionGame session={joined.session} player={joined.player} />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    const upper = code.trim().toUpperCase()
    if (!upper || !clean) return
    setBusy(true)
    setError(null)
    try {
      const player = { playerId: id, name: clean }
      const session = await api.join(upper, player)
      rememberName(clean)
      window.history.replaceState(null, '', `?join=${upper}`)
      setJoined({ session, player })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <form className="card join" onSubmit={submit}>
        <div className="brand">
          Flow State <span className="brand__tag">session</span>
        </div>
        <p className="hint">
          Everyone in the room plays the same game. Ship as much as you can before the clock runs
          out. Work that ships stale counts for less.
        </p>
        <label className="field">
          <span>Session code</span>
          <input
            className="field__code"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </label>
        <label className="field">
          <span>Your name, for the leaderboard</span>
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={24}
            autoFocus
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Play'}
        </button>
      </form>
    </main>
  )
}

function SessionGame({ session, player }: { session: SessionStatus; player: Player }) {
  const sim = useSim(session.seed, { endTick: session.ticks })
  return (
    <div className="app">
      <Hud sim={sim} session={{ code: session.code, name: player.name }} />
      <Board latest={sim.latest} />
      {sim.finished && <EndScreen sim={sim} session={session} player={player} />}
    </div>
  )
}

type Submission =
  | { state: 'sending' }
  | { state: 'sent'; outcome: SubmitOutcome }
  | { state: 'failed'; error: string }

/**
 * The whistle. The score is shown from the local run at once; the rank arrives
 * when the server has replayed the run and agreed with it.
 */
function EndScreen({
  sim,
  session,
  player,
}: {
  sim: SimHandle
  session: SessionStatus
  player: Player
}) {
  const [submission, setSubmission] = useState<Submission>({ state: 'sending' })
  // One submission per run, whatever StrictMode does to this effect.
  const sent = useRef(false)
  const result = sim.result

  const send = () => {
    setSubmission({ state: 'sending' })
    api
      .submit(session.code, player, sim.commandLog())
      .then((outcome) => setSubmission({ state: 'sent', outcome }))
      .catch((err: unknown) =>
        setSubmission({ state: 'failed', error: err instanceof Error ? err.message : String(err) }),
      )
  }

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    send()
    // `send` closes over the finished run, the only run this screen ever shows.
  }, [])

  if (result === null) return null
  const outcome = submission.state === 'sent' ? submission.outcome : null
  const improved = outcome !== null && outcome.best.score === outcome.result.score

  return (
    <div className="overlay" role="dialog" aria-label="Run finished">
      <div className="card end">
        <div className="end__label">Your score</div>
        <div className="end__score">{result.score.toFixed(1)}</div>
        <div className="end__stats">
          <span>
            <b>{result.shipped}</b> shipped
          </span>
          <span>
            <b>{Math.round(result.avgQuality * 100)}%</b> avg quality
          </span>
          <span>
            <b>{(result.avgLeadTimeTicks / TICKS_PER_HOUR).toFixed(1)}h</b> avg lead time
          </span>
        </div>
        <p className="hint">
          Every item you shipped counts for the quality it shipped at. Work that sat open while
          the trunk moved counts for less.
        </p>

        <div className="end__rank" role="status">
          {submission.state === 'sending' && 'Checking your run…'}
          {submission.state === 'failed' && (
            <>
              <span className="error">Could not reach the leaderboard: {submission.error}</span>{' '}
              <button type="button" className="btn btn--sm" onClick={send}>
                Try again
              </button>
            </>
          )}
          {outcome !== null && (
            <>
              {improved ? 'On the board at' : 'Your best is still'} <b>#{outcome.rank}</b> of{' '}
              {outcome.players}
              {!improved && <> — {outcome.best.score.toFixed(1)}</>}
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            sent.current = false
            sim.reset(session.seed)
          }}
        >
          Play again — same game
        </button>
      </div>
    </div>
  )
}
