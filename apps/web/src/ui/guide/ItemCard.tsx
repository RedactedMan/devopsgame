import { STATION_LABELS } from '@flow/content'
import type { SnapshotItem } from '@flow/sim'
import type { Inspected } from '../../render/BoardScene.js'
import { cssAreaColor, cssDriftColor, waitScore } from '../../render/theme.js'
import { CONTEXT_GRACE_HOURS, TICKS_PER_HOUR, handsOnHours } from './numbers.js'

const CARD_W = 250
const GAP = 6

/**
 * The item under the pointer, in words.
 *
 * A tile has room for an id and two numbers, and on a phone only the id. This
 * is the rest of it: where the item is and why, what its size means in hours,
 * how far it has drifted and what is making it drift, and for an agent's
 * output what re-reading it will cost. Facts about this item, never advice.
 */
export function ItemCard({ item, at, host }: { item: SnapshotItem; at: Inspected; host: HTMLElement | null }) {
  const hostW = host?.clientWidth ?? 0
  const hostH = host?.clientHeight ?? 0
  const width = Math.min(CARD_W, hostW - GAP * 2)
  const left = Math.max(GAP, Math.min(hostW - width - GAP, at.x))
  // Below the tile in the top half of the board, above it in the bottom half.
  const vertical =
    at.y + at.height / 2 < hostH / 2 ? { top: at.y + at.height + GAP } : { bottom: hostH - at.y + GAP }

  const inBacklog = item.location.where === 'backlog'
  const score = inBacklog ? waitScore(item.ageTicks) : item.driftScore
  const hoursOpen = item.ageTicks / TICKS_PER_HOUR

  return (
    <div className="itemcard" style={{ left, width, ...vertical }} role="tooltip">
      <div className="itemcard__head">
        <span className="itemcard__swatch" style={{ background: cssDriftColor(score) }} />
        <b>{item.id}</b>
        <span className="itemcard__where">{where(item)}</span>
      </div>
      <dl>
        <dt>Size</dt>
        <dd>
          {item.size.toFixed(0)}u
          {item.size > item.originalSize + 0.01 && <> (arrived as {item.originalSize}u)</>}: about{' '}
          {handsOnHours(item.size).toFixed(0)}h of hands-on work through the whole line, more as it
          drifts
        </dd>
        {inBacklog ? (
          <>
            <dt>Waiting</dt>
            <dd>{hoursOpen.toFixed(0)}h. No branch yet, so no drift.</dd>
          </>
        ) : (
          <>
            <dt>Drift</dt>
            <dd>
              {item.stale ? (
                <>Stale. It holds its slot until you rebase, abandon or ship it.</>
              ) : (
                <>{Math.round(item.driftScore * 100)}%, stale at 100%</>
              )}
              {item.overlap > 0 && Math.round(item.driftScore * 100) > 0 && (
                <>
                  {' '}
                  · {Math.round((item.driftFromOverlap / item.drift) * 100)}% of it from sharing code
                </>
              )}
            </dd>
          </>
        )}
        <dt>Areas</dt>
        <dd>
          {item.areas.map((a) => (
            <span key={a} className="itemcard__area">
              <span style={{ background: cssAreaColor(a) }} />
              {a}
            </span>
          ))}
          {!inBacklog &&
            (item.overlap === 0 ? (
              <> nothing else in flight here</>
            ) : (
              <>
                {' '}
                shared with {item.overlap} {item.overlap === 1 ? 'item' : 'items'}
              </>
            ))}
        </dd>
        {item.rebrief !== null && (
          <>
            <dt>Agent</dt>
            <dd>
              {item.rebrief > 0 ? (
                <>
                  Output waiting for review, {Math.round(item.contextFidelity * 100)}% of its
                  context left. Reviewing it now costs +{item.rebrief.toFixed(1)} attention to
                  rebuild what was lost.
                </>
              ) : (
                <>
                  Output waiting for review. Its context holds for {CONTEXT_GRACE_HOURS}h after it
                  finishes, then drains.
                </>
              )}
            </dd>
          </>
        )}
        {(item.reworks > 0 || item.rebases > 0) && (
          <>
            <dt>History</dt>
            <dd>
              {[
                item.reworks > 0 && `sent back ${item.reworks}×`,
                item.rebases > 0 && `rebased ${item.rebases}×`,
              ]
                .filter(Boolean)
                .join(', ')}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

function where(item: SnapshotItem): string {
  const loc = item.location
  if (loc.where === 'backlog') return 'Backlog'
  const station = STATION_LABELS[loc.station]
  if (loc.phase === 'queue') return `${station}, waiting`
  if (loc.phase === 'outbound') return `${station}, done, no room downstream`
  return item.progress === null ? station : `${station}, ${Math.round(item.progress * 100)}% done`
}
