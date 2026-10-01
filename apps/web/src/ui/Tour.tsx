import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SESSION_WIN_UNFINISHED } from '@flow/content'
import type { SimHandle } from '../bridge/useSim.js'

/** A tab of the panel, which a phone shows one at a time. */
export type PanelTab = 'wip' | 'team' | 'stale' | 'flow'

type Step = {
  /** What to point at. The first match that is on screen. */
  target: string
  /** The panel tab the target lives on, so a phone can open it first. */
  tab?: PanelTab
  title: string
  body: string
}

/**
 * The walkthrough: what is on the screen and what each lever does, one thing
 * at a time, pointing at it. It says what the levers *are* and never what to
 * set them to — the deck's `howto` slide holds the same line, and finding the
 * settings is the game.
 */
function steps(session: boolean): Step[] {
  return [
    {
      target: '.board',
      title: 'The line',
      body: 'Work arrives in the backlog and flows through five stations: Spec, Implement, Review, CI and Deploy. Every deploy moves trunk on, and anything still in flight drifts behind it. Teal is healthy, amber is drifting, rust is stale.',
    },
    session
      ? {
          target: '[data-stat="unfinished"]',
          title: 'Keeping up',
          body: `You keep up if ${SESSION_WIN_UNFINISHED} or fewer items are unfinished, waiting or in flight, when the clock stops. Your score is what you shipped, each item counted at the quality it actually shipped with, so stale work counts for less.`,
        }
      : {
          target: '[data-stat="shipped"]',
          title: 'Free play',
          body: 'Free play has no end and no win line. Work keeps arriving faster than the starting line can finish it. Watch what ships, how long it takes, and what goes stale on the way.',
        },
    {
      target: 'section[data-tab="wip"]',
      tab: 'wip',
      title: 'Lever 1: WIP limits',
      body: 'A slider per station: how much work may be in flight there at once. Raising a limit lets more work start. It does not make anyone work faster.',
    },
    {
      target: 'section[data-tab="team"]',
      tab: 'team',
      title: 'Levers 2 and 3: people and agents',
      body: 'Your nine people are fixed. Click one, then a station, to move them; a moved person spends two shifts learning it. “+ agent” adds capacity for free, but someone has to read what it produces.',
    },
    {
      target: '[data-stat="attention"]',
      title: 'Attention',
      body: 'Reviewing and rebasing are paid for out of attention, a budget your people supply each shift. Agents draw on it. It does not carry over.',
    },
    {
      target: 'section[data-tab="stale"]',
      tab: 'stale',
      title: 'Lever 4: stale work',
      body: 'Work that drifts too far behind trunk goes stale and holds its slot until you decide. Rebase it, which costs attention, abandon it, or ship it anyway at whatever quality it is in.',
    },
    {
      target: '.controls',
      title: 'The clock',
      body: session
        ? 'Pausing is free: the clock stops and you can think as long as you like. Change speed here. When the presenter says go, press Start.'
        : 'Pausing is free: the clock stops and you can think as long as you like. Change speed here, and restart the same seed to try again.',
    },
  ]
}

type Rect = { top: number; left: number; width: number; height: number }

const GAP = 12
const MARGIN = 16

/** The target's box, cut to what is on screen, or null if none of it is. */
function measure(selector: string): Rect | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect()
    const top = Math.max(r.top, 0)
    const left = Math.max(r.left, 0)
    const bottom = Math.min(r.bottom, window.innerHeight)
    const right = Math.min(r.right, window.innerWidth)
    if (bottom - top > 4 && right - left > 4) {
      return { top, left, width: right - left, height: bottom - top }
    }
  }
  return null
}

export function Tour({
  sim,
  session,
  onTab,
  onClose,
}: {
  sim: SimHandle
  session: boolean
  onTab: (tab: PanelTab) => void
  onClose: () => void
}) {
  const all = steps(session)
  const [index, setIndex] = useState(0)
  const step = all[index]!
  const last = index === all.length - 1
  const [rect, setRect] = useState<Rect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)

  // The clock stops while the tour talks, and goes back to what it was: a
  // session player waiting for Start is still waiting afterwards.
  const wasPaused = useRef(sim.paused)
  useEffect(() => {
    sim.setPaused(true)
    return () => sim.setPaused(wasPaused.current)
    // Once per tour.
  }, [])

  useEffect(() => {
    if (step.tab) onTab(step.tab)
    document.querySelector(step.target)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  // Follow the target. The layout settles after a tab switch, a scroll or a
  // resize, and none of those tell the tour.
  useEffect(() => {
    let frame = 0
    const loop = () => {
      const next = measure(step.target)
      setRect((prev) =>
        prev && next && prev.top === next.top && prev.left === next.left &&
        prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      )
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [index])

  useLayoutEffect(() => {
    setCardHeight(card.current?.offsetHeight ?? 0)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !last) setIndex((i) => i + 1)
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, last])

  // Below the target if it fits, else above it, else beside it (the panel on a
  // laptop is taller than the screen), else over its foot: the board fills
  // most of a laptop screen and the card has to go somewhere.
  const width = Math.min(360, window.innerWidth - 2 * MARGIN)
  let top = window.innerHeight - cardHeight - MARGIN
  let left = (window.innerWidth - width) / 2
  if (rect) {
    const below = rect.top + rect.height + GAP
    const above = rect.top - GAP - cardHeight
    const before = rect.left - GAP - width
    const after = rect.left + rect.width + GAP
    left = rect.left + rect.width / 2 - width / 2
    if (below + cardHeight <= window.innerHeight - MARGIN) top = below
    else if (above >= MARGIN) top = above
    else if (before >= MARGIN || after + width <= window.innerWidth - MARGIN) {
      left = before >= MARGIN ? before : after
      top = Math.min(rect.top, window.innerHeight - cardHeight - MARGIN)
    }
  }
  left = Math.min(Math.max(left, MARGIN), window.innerWidth - width - MARGIN)
  top = Math.max(top, MARGIN)

  return (
    <div className="tour">
      {rect && (
        <div
          className="tour__spot"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div
        ref={card}
        className="card tour__card"
        role="dialog"
        aria-label="How to play"
        style={{ top, left, width }}
      >
        <div className="tour__count">
          {index + 1} of {all.length}
        </div>
        <h2 className="tour__title">{step.title}</h2>
        <p className="tour__body">{step.body}</p>
        <div className="tour__actions">
          <button type="button" className="btn" onClick={onClose}>
            Skip
          </button>
          <span className="tour__spacer" />
          {index > 0 && (
            <button type="button" className="btn" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            autoFocus
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
