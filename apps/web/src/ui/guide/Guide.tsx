import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PanelTab } from '../Hud.js'
import { topics, type Topic } from './topics.js'

/**
 * The optional guide: a tour that walks the screen one part at a time, and a
 * key that has all of it on one page. Neither opens by itself. A first visit
 * gets an offer in the panel, which a player can take or wave away, and the
 * ? in the top bar opens either one at any time after that.
 *
 * Both pause the clock while they are open (Hud does that), because reading
 * about a board that is changing under you is how a new player falls behind
 * before they have made a single decision.
 */

export type GuideMode = 'tour' | 'key'

// Storage can be missing or throw (a private window, blocked site data). The
// offer is a convenience, so without storage it simply shows every visit.
const OFFER_KEY = 'flow-state:guide-offer-dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(OFFER_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(OFFER_KEY, '1')
  } catch {
    // Nothing to do: the offer comes back next visit.
  }
}

/** Shown at the top of the panel, on every tab, until it is taken or dismissed. */
export function GuideOffer({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed) return null
  const close = () => {
    writeDismissed()
    setDismissed(true)
  }
  return (
    <div className="guide-offer" role="region" aria-label="New here?">
      <div className="guide-offer__text">
        <b>New here?</b> A two-minute tour of what the colours, numbers and bars mean.
      </div>
      <div className="guide-offer__actions">
        <button
          type="button"
          className="btn btn--on"
          onClick={() => {
            close()
            onOpen('tour')
          }}
        >
          Take the tour
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            close()
            onOpen('key')
          }}
        >
          Board key
        </button>
        <button type="button" className="btn guide-offer__close" aria-label="No thanks" onClick={close}>
          ×
        </button>
      </div>
    </div>
  )
}

export function Guide({
  mode,
  session,
  onMode,
  onClose,
  onTab,
}: {
  mode: GuideMode
  session: boolean
  onMode: (mode: GuideMode) => void
  onClose: () => void
  onTab: (tab: PanelTab) => void
}) {
  const list = useMemo(() => topics({ session }), [session])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return mode === 'tour' ? (
    <Tour topics={list} onClose={onClose} onTab={onTab} onKey={() => onMode('key')} />
  ) : (
    <Key topics={list} onClose={onClose} onTour={() => onMode('tour')} />
  )
}

/** Every topic on one page, for looking something up mid-game. */
function Key({ topics, onClose, onTour }: { topics: Topic[]; onClose: () => void; onTour: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => closeRef.current?.focus(), [])
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Guide" onClick={onClose}>
      <div className="card guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide__head">
          <h2>How to read the screen</h2>
          <button type="button" className="btn btn--on" onClick={onTour}>
            Take the tour
          </button>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="guide__body">
          {topics.map((t) => (
            <section key={t.id} className="guide__topic">
              <h3>{t.title}</h3>
              {t.art}
              {t.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

type Rect = { left: number; top: number; width: number; height: number }

const MARGIN = 12

/** Everything the target selector matches that is actually on screen, as one box. */
function measure(selector: string | undefined): Rect | null {
  if (!selector) return null
  const rects = [...document.querySelectorAll(selector)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
  if (rects.length === 0) return null
  const left = Math.max(0, Math.min(...rects.map((r) => r.left)))
  const top = Math.max(0, Math.min(...rects.map((r) => r.top)))
  const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)))
  const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)))
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Put the card on whichever side of the target has the most room for it,
 * measured in cards rather than pixels so a tall card prefers height. It may
 * overlap the target's edge when no side has room for all of it; it never
 * leaves the screen.
 */
function place(target: Rect | null, w: number, h: number): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.max(MARGIN, Math.min(vw - w - MARGIN, x))
  const clampY = (y: number) => Math.max(MARGIN, Math.min(vh - h - MARGIN, y))
  if (!target) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) }

  const right = vw - (target.left + target.width)
  const below = vh - (target.top + target.height)
  const sides = [
    { side: 'right', fit: right / w },
    { side: 'left', fit: target.left / w },
    { side: 'below', fit: below / h },
    { side: 'above', fit: target.top / h },
  ].sort((a, b) => b.fit - a.fit)
  const midY = target.top + target.height / 2 - h / 2
  const midX = target.left + target.width / 2 - w / 2
  switch (sides[0]!.side) {
    case 'right':
      return { left: clampX(target.left + target.width + MARGIN), top: clampY(midY) }
    case 'left':
      return { left: clampX(target.left - w - MARGIN), top: clampY(midY) }
    case 'below':
      return { left: clampX(midX), top: clampY(target.top + target.height + MARGIN) }
    default:
      return { left: clampX(midX), top: clampY(target.top - h - MARGIN) }
  }
}

function Tour({
  topics,
  onClose,
  onTab,
  onKey,
}: {
  topics: Topic[]
  onClose: () => void
  onTab: (tab: PanelTab) => void
  onKey: () => void
}) {
  const [step, setStep] = useState(0)
  const [target, setTarget] = useState<Rect | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const topic = topics[step]!
  const last = step === topics.length - 1

  const layout = useCallback(() => {
    const el = topic.target ? document.querySelector(topic.target) : null
    el?.scrollIntoView({ block: 'nearest' })
    const rect = measure(topic.target)
    setTarget(rect)
    const card = cardRef.current
    if (card) setPos(place(rect, card.offsetWidth, card.offsetHeight))
  }, [topic])

  // A phone shows one panel tab at a time, so the step opens the tab its
  // target is on, and is measured once that has rendered.
  useLayoutEffect(() => {
    if (topic.tab) onTab(topic.tab)
    setPos(null)
    const frame = requestAnimationFrame(layout)
    return () => cancelAnimationFrame(frame)
  }, [topic, onTab, layout])

  useEffect(() => {
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
  }, [layout])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(topics.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topics.length])

  useEffect(() => cardRef.current?.focus(), [step])

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
      {target ? (
        <div
          className="tour__spot"
          style={{
            left: target.left - 3,
            top: target.top - 3,
            width: target.width + 6,
            height: target.height + 6,
          }}
        />
      ) : (
        <div className="tour__shade" />
      )}
      <div
        ref={cardRef}
        className="card tour__card"
        tabIndex={-1}
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      >
        <div className="tour__step">
          {step + 1} / {topics.length}
        </div>
        <h2>{topic.title}</h2>
        {topic.art}
        <div className="tour__body">{topic.body}</div>
        <div className="tour__actions">
          <button type="button" className="btn" onClick={onClose}>
            {last ? 'Close' : 'Skip'}
          </button>
          <button type="button" className="btn tour__key" onClick={onKey}>
            All on one page
          </button>
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          <button
            type="button"
            className="btn btn--on"
            onClick={() => (last ? onClose() : setStep(step + 1))}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
