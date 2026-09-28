import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initState,
  loadSave,
  makeSave,
  snapshot,
  stepLogged,
  type Command,
  type GameState,
  sessionResult,
  type LoadVerdict,
  type LoggedCommand,
  type SaveFile,
  type SessionResult,
  type Snapshot,
} from '@flow/sim'
import { BUILD } from '../build.js'

/**
 * The bridge. It owns the clock and nothing else.
 *
 * The UI never touches sim state: it pushes `Command`s into a queue, and the
 * queue is drained at tick boundaries. Speed and pause change how often `step`
 * is called, never what it does — which is why they are not commands and do not
 * appear in the replay.
 */

export const SPEEDS = [1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]

/** Ticks of sim per real second at 1×. The sim is 10 ticks per sim-hour. */
const TICKS_PER_SECOND = 5
/** Never try to catch up more than this in one frame, however long the tab was hidden. */
const MAX_TICKS_PER_FRAME = 40
/**
 * Commands can only be consumed at a tick boundary, so a decision made while
 * paused costs one tick. Throttling how often that happens keeps a slider drag
 * from quietly advancing the clock by a shift.
 */
const PAUSED_DRAIN_INTERVAL_MS = 250

export type SimHandle = {
  snapshot: Snapshot
  paused: boolean
  speed: Speed
  seed: number
  /** The tick the run stops at, or null for free play, which never ends. */
  endTick: number | null
  /** True once a fixed-length run has reached `endTick`. */
  finished: boolean
  /**
   * The run's score, once it has finished. The snapshot deliberately hides true
   * quality while the game is running; the end of the run is where it is
   * revealed.
   */
  result: SessionResult | null
  /**
   * Everything the player did, keyed by the tick it was applied at. With the
   * seed this is the whole run: `runReplay` reproduces it exactly, which is
   * what lets the leaderboard check a score instead of trusting it.
   */
  commandLog: () => LoggedCommand[]
  dispatch: (command: Command) => void
  setPaused: (paused: boolean) => void
  setSpeed: (speed: Speed) => void
  reset: (seed?: number) => void
  /**
   * The run so far as a save file (M1 slice 4): the seed, the log, and the tick
   * it got to. Commands still queued for the next tick are not in it.
   */
  save: () => SaveFile
  /**
   * Replaces the run with a saved one, replayed under today's rules, and
   * pauses so the player can read what the load found before playing on.
   */
  load: (save: SaveFile) => LoadVerdict
  /** Live reference for the renderer, so the canvas does not wait on React. */
  latest: { current: Snapshot }
}

export type SimOptions = {
  /** Stop here. Presentation mode sets it so the whole room plays one length. */
  endTick?: number
}

export function useSim(initialSeed: number, options: SimOptions = {}): SimHandle {
  const endTick = options.endTick ?? null
  const [seed, setSeed] = useState(initialSeed)
  const stateRef = useRef<GameState>(initState({ seed: initialSeed }))
  const pendingRef = useRef<Command[]>([])
  const logRef = useRef<LoggedCommand[]>([])
  const [result, setResult] = useState<SessionResult | null>(null)
  const finished = result !== null
  const [runId, setRunId] = useState(0)
  const latest = useRef<Snapshot>(snapshot(stateRef.current))
  const [snap, setSnap] = useState<Snapshot>(latest.current)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)

  const seedRef = useRef(seed)
  seedRef.current = seed
  const pausedRef = useRef(paused)
  const speedRef = useRef<Speed>(speed)
  pausedRef.current = paused
  speedRef.current = speed

  const dispatch = useCallback((command: Command) => {
    pendingRef.current.push(command)
  }, [])

  const commandLog = useCallback(() => [...logRef.current], [])

  const reset = useCallback((nextSeed?: number) => {
    const s = nextSeed ?? Math.floor(Math.random() * 1_000_000)
    stateRef.current = initState({ seed: s })
    pendingRef.current = []
    logRef.current = []
    setResult(null)
    latest.current = snapshot(stateRef.current)
    setSnap(latest.current)
    seedRef.current = s
    setSeed(s)
    setRunId((n) => n + 1)
  }, [])

  const save = useCallback(
    () =>
      makeSave(seedRef.current, stateRef.current, logRef.current, {
        build: BUILD,
        savedAt: new Date().toISOString(),
      }),
    [],
  )

  const load = useCallback((file: SaveFile) => {
    const loaded = loadSave(file)
    stateRef.current = loaded.state
    pendingRef.current = []
    // The loaded log is the one play carries on writing to. A fresh one would
    // make the next save a run that starts at the load.
    logRef.current = loaded.commands
    setResult(null)
    latest.current = snapshot(stateRef.current)
    setSnap(latest.current)
    seedRef.current = file.seed
    setSeed(file.seed)
    setPaused(true)
    setRunId((n) => n + 1)
    return loaded.verdict
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let accumulator = 0
    let lastPausedDrain = 0

    const ended = () => endTick !== null && stateRef.current.tick >= endTick

    /**
     * The one place the sim advances, and it logs as it goes: with the seed,
     * the log is the run, and it is what the leaderboard replays.
     */
    const advance = () => {
      const commands = pendingRef.current
      pendingRef.current = []
      stateRef.current = stepLogged(stateRef.current, commands, logRef.current)
    }

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.25)
      last = now

      if (ended()) {
        // The run is over. Anything the player did after the whistle is not
        // part of it, and is not in the log.
        pendingRef.current = []
        return
      }

      if (!pausedRef.current) {
        accumulator += dt * TICKS_PER_SECOND * speedRef.current
        let ticks = Math.min(Math.floor(accumulator), MAX_TICKS_PER_FRAME)
        accumulator -= Math.floor(accumulator)

        // Commands are consumed in `advance` and only there.
        while (ticks-- > 0 && !ended()) advance()
      } else if (
        pendingRef.current.length > 0 &&
        now - lastPausedDrain >= PAUSED_DRAIN_INTERVAL_MS
      ) {
        // Paused is a first-class way to play — the design says so — and a
        // decision made while stopped still has to land. It costs the one tick
        // the architecture requires, no more.
        lastPausedDrain = now
        advance()
      }

      latest.current = snapshot(stateRef.current)
      setSnap(latest.current)
      if (ended()) setResult((r) => r ?? sessionResult(stateRef.current))
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
    // `finished` is reset with the run, so `reset` has to restart this loop even
    // when the seed is the same one — which in a session it always is.
  }, [seed, endTick, runId])

  return {
    snapshot: snap,
    paused,
    speed,
    seed,
    endTick,
    finished,
    result,
    commandLog,
    dispatch,
    setPaused,
    setSpeed,
    reset,
    save,
    load,
    latest,
  }
}
