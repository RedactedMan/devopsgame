import { useEffect, useState } from 'react'

/**
 * The game is laid out for a laptop: six board columns beside a 320px panel,
 * and a top bar of nine readouts. Below about 900px wide the top bar runs off
 * the screen, and on a phone the board is a sliver. Until the phone layout
 * exists (IMPLEMENTATION_PLAN, slice 3e), say so rather than let someone find
 * out mid-game.
 *
 * Measured, not guessed: at 1000px wide every column is about 115px and the
 * top bar fits. 560px tall rules out a phone held sideways.
 */
const SMALL_SCREEN = '(max-width: 999px), (max-height: 559px)'

export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL_SCREEN).matches)
  useEffect(() => {
    const query = window.matchMedia(SMALL_SCREEN)
    // Rotating a tablet can cross the line either way.
    const update = () => setSmall(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return small
}

/** Before joining: the room hears it at the door, not ten minutes in. */
export function SmallScreenNote() {
  return (
    <p className="small-screen-note" role="note">
      This screen is too small to play on comfortably yet. If you can, join on a laptop, or a
      tablet held sideways. A phone version is on the way.
    </p>
  )
}

/**
 * In the game itself, over the board. It can be waved away: someone who only
 * has a phone should still be able to try.
 */
export function SmallScreenGate() {
  const small = useSmallScreen()
  const [dismissed, setDismissed] = useState(false)
  if (!small || dismissed) return null
  return (
    <div className="overlay" role="dialog" aria-label="Screen too small">
      <div className="card end">
        <div className="end__label">Small screen</div>
        <p>
          Flow State is laid out for a laptop for now. On this screen the board is cramped and some
          controls may be out of reach.
        </p>
        <p className="hint">
          A laptop, or a tablet held sideways, works best. A phone version is on the way.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => setDismissed(true)}>
          Play anyway
        </button>
      </div>
    </div>
  )
}
