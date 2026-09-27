import { useEffect, useState } from 'react'

/**
 * A phone held sideways leaves the board about 330px of height under a
 * two-row top bar, which is not a game. Upright, the phone layout works
 * (styles.css, "Phone layout"), so the fix is one sentence rather than a
 * third layout: in a room, people hold phones upright anyway.
 *
 * `pointer: coarse` keeps a short laptop window out of it: that is a person
 * with a mouse who can resize, not a phone.
 */
const SIDEWAYS = '(max-height: 559px) and (orientation: landscape) and (pointer: coarse)'

function useSideways(): boolean {
  const [sideways, setSideways] = useState(() => window.matchMedia(SIDEWAYS).matches)
  useEffect(() => {
    const query = window.matchMedia(SIDEWAYS)
    const update = () => setSideways(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return sideways
}

/** Over the game while the phone is sideways. Turning it upright is the dismissal. */
export function TurnUpright() {
  const sideways = useSideways()
  const [dismissed, setDismissed] = useState(false)
  if (!sideways || dismissed) return null
  return (
    <div className="overlay" role="dialog" aria-label="Turn your phone upright">
      <div className="card end">
        <div className="end__label">Turn your phone upright</div>
        <p>The board needs the height. Held upright, everything fits.</p>
        <button type="button" className="btn" onClick={() => setDismissed(true)}>
          Stay sideways
        </button>
      </div>
    </div>
  )
}
