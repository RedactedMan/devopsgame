import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TUNING, SESSION_TUNING, SESSION_WIN_UNFINISHED } from '@flow/content'
import type { SessionStatus, SubmitOutcome } from '@flow/sim'
import { useSim, type SimHandle } from '../bridge/useSim.js'
import { Board } from '../render/Board.js'
import { Hud } from '../ui/Hud.js'
import { TurnUpright } from '../ui/Sideways.js'
import { ApiError, api, playerId, rememberName, rememberedName, type Player } from './api.js'

const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour

/**
 * A player arriving from the presenter's link. Name, then the game — nothing
 * else stands between the room and playing.
 */
export function Join({ code: initialCode }: { code: string | null }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase())
  const [name, setName] = useState(rememberedName)
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null)
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
      setError({
        message: err instanceof Error ? err.message : String(err),
        // This page is an older game than the server's. Only a reload fixes it.
        stale: err instanceof ApiError && err.status === 409,
      })
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
        {error && (
          <p className="error">
            {error.message}
            {error.stale && (
              <>
                {' '}
                <button type="button" className="btn btn--sm" onClick={() => location.reload()}>
                  Reload
                </button>
              </>
            )}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Play'}
        </button>
      </form>
    </main>
  )
}

function SessionGame({ session, player }: { session: SessionStatus; player: Player }) {
  const sim = useSim(session.seed, {
    endTick: session.ticks,
    tuning: SESSION_TUNING,
    startPaused: true,
  })
  // The room joins during the talk and starts together. Once the player has
  // started, a pause is their own and needs no explaining.
  const [started, setStarted] = useState(false)
  // A player in a session has usually never seen the game, so the walkthrough
  // opens on joining, while the clock is still waiting for Start.
  const [touring, setTouring] = useState(true)
  useEffect(() => {
    if (!sim.paused) setStarted(true)
  }, [sim.paused])
  return (
    <div className="app">
      <Hud
        sim={sim}
        session={{ code: session.code, name: player.name }}
        touring={touring}
        onTour={setTouring}
      />
      <Board latest={sim.latest} />
      <TurnUpright />
      {!started && !touring && (
        <div className="card waiting" role="dialog" aria-label="Waiting to start">
          <p>
            The game is paused. Everyone starts together, so wait for the presenter, then press
            Start.
          </p>
          <div className="waiting__actions">
            <button type="button" className="btn" onClick={() => setTouring(true)}>
              How to play
            </button>
            <button type="button" className="btn btn--primary" onClick={() => sim.setPaused(false)}>
              Start
            </button>
          </div>
        </div>
      )}
      {sim.finished && <EndScreen sim={sim} session={session} player={player} />}
    </div>
  )
}

type Submission =
  | { state: 'sending' }
  | { state: 'sent'; outcome: SubmitOutcome }
  | { state: 'failed'; error: string; refused: 'closed' | 'stale' | null }

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
        setSubmission({
          state: 'failed',
          error: err instanceof Error ? err.message : String(err),
          // Retrying either of these only gets the same answer.
          refused:
            err instanceof ApiError && err.status === 410
              ? 'closed'
              : err instanceof ApiError && err.status === 409
                ? 'stale'
                : null,
        }),
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
        <div className={result.won ? 'end__verdict end__verdict--won' : 'end__verdict'}>
          {result.won ? 'You kept up' : 'The work got ahead of you'}
        </div>
        <p className="hint">
          {result.unfinished} {result.unfinished === 1 ? 'item was' : 'items were'} still
          unfinished when the clock stopped, waiting or in flight.{' '}
          {result.won
            ? `${SESSION_WIN_UNFINISHED} or fewer is a win.`
            : `A win is ${SESSION_WIN_UNFINISHED} or fewer.`}
        </p>
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
          {submission.state === 'failed' &&
            (submission.refused === 'closed' ? (
              <span className="error">
                The session has closed, so this run is not on the board.
              </span>
            ) : submission.refused === 'stale' ? (
              <>
                <span className="error">
                  The game was updated while this page was open, so this run was played under
                  old rules and cannot be scored.
                </span>{' '}
                <button type="button" className="btn btn--sm" onClick={() => location.reload()}>
                  Reload
                </button>
              </>
            ) : (
              <>
                <span className="error">Could not reach the leaderboard: {submission.error}</span>{' '}
                <button type="button" className="btn btn--sm" onClick={send}>
                  Try again
                </button>
              </>
            ))}
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
