import { cssAreaColor, cssDriftColor } from '../../render/theme.js'

/**
 * A work item drawn in HTML, the way BoardScene.paintItem draws it on the
 * canvas, so the guide can point at the parts of a tile without a screenshot
 * that goes stale the next time the board changes. If paintItem changes what
 * a tile looks like, change this with it.
 */
export function Tile({
  label,
  score,
  backlog = false,
  held = false,
  stale = false,
  context,
  progress,
  areas = [],
}: {
  label: string
  /** 0..1 on the drift ramp: drift in flight, wait in the backlog. */
  score: number
  backlog?: boolean
  held?: boolean
  stale?: boolean
  /** Agent output waiting for review: the share of its context left. */
  context?: number
  /** 0..1 through the station it is at. */
  progress?: number
  areas?: number[]
}) {
  const color = cssDriftColor(score)
  const solid = !backlog && !held
  const style: React.CSSProperties = solid
    ? { background: color }
    : held
      ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1.5px solid ${color}` }
      : { background: `color-mix(in srgb, ${color} ${Math.round((0.28 + 0.3 * score) * 100)}%, transparent)` }
  const ink = !solid ? 'var(--text)' : score > 0.6 ? '#f5efe9' : 'var(--ground)'

  return (
    <span className={stale ? 'tile tile--stale' : 'tile'} style={style} aria-hidden="true">
      {context !== undefined && (
        <span className="tile__context">
          <span style={{ width: `${context * 100}%` }} />
        </span>
      )}
      <span className="tile__label" style={{ color: ink }}>
        {label}
      </span>
      <span className="tile__chips">
        {areas.map((a) => (
          <span key={a} style={{ background: cssAreaColor(a) }} />
        ))}
      </span>
      {progress !== undefined && <span className="tile__progress" style={{ width: `${progress * 100}%` }} />}
    </span>
  )
}

/** The drift ramp as a strip, for the one sentence the whole board hangs on. */
export function Ramp() {
  const stops = Array.from({ length: 11 }, (_, i) => `${cssDriftColor(i / 10)} ${i * 10}%`)
  return (
    <span className="ramp" aria-hidden="true">
      <span className="ramp__bar" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <span className="ramp__labels">
        <span>fresh</span>
        <span>drifting</span>
        <span>stale</span>
      </span>
    </span>
  )
}
