import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initState,
  snapshot,
  step,
  type Command,
  type GameState,
  type Snapshot,
} from '@flow/sim'

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
  dispatch: (command: Command) => void
  setPaused: (paused: boolean) => void
  setSpeed: (speed: Speed) => void
  reset: (seed?: number) => void
  /** Live reference for the renderer, so the canvas does not wait on React. */
  latest: { current: Snapshot }
}

export function useSim(initialSeed: number): SimHandle {
  const [seed, setSeed] = useState(initialSeed)
  const stateRef = useRef<GameState>(initState({ seed: initialSeed }))
  const pendingRef = useRef<Command[]>([])
  const latest = useRef<Snapshot>(snapshot(stateRef.current))
  const [snap, setSnap] = useState<Snapshot>(latest.current)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)

  const pausedRef = useRef(paused)
  const speedRef = useRef<Speed>(speed)
  pausedRef.current = paused
  speedRef.current = speed

  const dispatch = useCallback((command: Command) => {
    pendingRef.current.push(command)
  }, [])

  const reset = useCallback((nextSeed?: number) => {
    const s = nextSeed ?? Math.floor(Math.random() * 1_000_000)
    stateRef.current = initState({ seed: s })
    pendingRef.current = []
    latest.current = snapshot(stateRef.current)
    setSnap(latest.current)
    setSeed(s)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let accumulator = 0
    let lastPausedDrain = 0

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.25)
      last = now

      if (!pausedRef.current) {
        accumulator += dt * TICKS_PER_SECOND * speedRef.current
        let ticks = Math.min(Math.floor(accumulator), MAX_TICKS_PER_FRAME)
        accumulator -= Math.floor(accumulator)

        while (ticks-- > 0) {
          // Commands are consumed here and only here.
          const commands = pendingRef.current
          pendingRef.current = []
          stateRef.current = step(stateRef.current, commands).state
        }
      } else if (
        pendingRef.current.length > 0 &&
        now - lastPausedDrain >= PAUSED_DRAIN_INTERVAL_MS
      ) {
        // Paused is a first-class way to play — the design says so — and a
        // decision made while stopped still has to land. It costs the one tick
        // the architecture requires, no more.
        lastPausedDrain = now
        const commands = pendingRef.current
        pendingRef.current = []
        stateRef.current = step(stateRef.current, commands).state
      }

      latest.current = snapshot(stateRef.current)
      setSnap(latest.current)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [seed])

  return {
    snapshot: snap,
    paused,
    speed,
    seed,
    dispatch,
    setPaused,
    setSpeed,
    reset,
    latest,
  }
}
