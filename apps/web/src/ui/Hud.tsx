import { useEffect, useRef, useState } from 'react'
import { STATION_LABELS, DEFAULT_TUNING, type StationId } from '@flow/content'
import type { SimHandle } from '../bridge/useSim.js'
import { SPEEDS } from '../bridge/useSim.js'
import { Chart } from './Chart.js'
import { cssDriftColor } from '../render/theme.js'

const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour
const TICKS_PER_DAY = TICKS_PER_HOUR * 8

/**
 * How long a line may go without shipping before the HUD says so.
 *
 * Deliberately short, and deliberately without hysteresis. A flicker during a
 * legitimate two-day stall under abusive WIP settings is not a false positive —
 * it is the feedback the player came for.
 */
const STALL_WARN_TICKS = TICKS_PER_DAY * 2

/** Before this, a run that has never shipped is starting up, not stalled. */
const STARTUP_GRACE_TICKS = TICKS_PER_DAY * 5

export function Hud({ sim }: { sim: SimHandle }) {
  const { snapshot: snap, dispatch } = sim
  const stale = snap.items.filter((it) => it.stale)
  const blocked = snap.stations.filter((s) => s.blocked)

  const sinceShip = snap.lastShipTick === null ? snap.tick : snap.tick - snap.lastShipTick
  const stalled =
    sinceShip > STALL_WARN_TICKS &&
    (snap.shippedTotal > 0 || snap.tick > STARTUP_GRACE_TICKS)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Flow State <span className="brand__tag">M0</span>
        </div>

        <Stat label="Day" value={(snap.tick / TICKS_PER_DAY + 1).toFixed(1)} />
        <Stat label="Trunk" value={`v${snap.trunkVersion}`} />
        <Stat label="Shipped" value={snap.shippedTotal} />
        <Stat
          label="Lead time"
          value={`${(snap.recentLeadTimeTicks / TICKS_PER_HOUR).toFixed(1)}h`}
        />
        <Stat label="Throughput" value={`${snap.throughputPerDay}/day`} />
        <Stat
          label="Oldest"
          // Lead time averages only what shipped. This one counts what has not.
          value={`${(snap.oldestInFlightTicks / TICKS_PER_HOUR).toFixed(0)}h`}
          alarm={stalled}
        />
        <Stat label="WIP" value={snap.items.filter((i) => i.location.where !== 'backlog').length} />
        <Stat label="Backlog" value={snap.backlog} />

        <div className="controls">
          <button
            type="button"
            className={sim.paused ? 'btn btn--on' : 'btn'}
            onClick={() => sim.setPaused(!sim.paused)}
          >
            {sim.paused ? 'Resume' : 'Pause'}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={sim.speed === s && !sim.paused ? 'btn btn--on' : 'btn'}
              onClick={() => {
                sim.setSpeed(s)
                sim.setPaused(false)
              }}
            >
              {s}×
            </button>
          ))}
          <button type="button" className="btn" onClick={() => sim.reset(sim.seed)}>
            Restart seed
          </button>
          <button type="button" className="btn" onClick={() => sim.reset()}>
            New seed
          </button>
        </div>
      </header>

      <aside className="panel">
        {stalled && <StallAlarm days={sinceShip / TICKS_PER_DAY} stale={stale.length} blocked={blocked} />}

        <section>
          <h2>WIP limits</h2>
          <p className="hint">
            How much work each station is allowed to hold at once. Raising a limit lets more work
            start. It does not make anyone work faster.
          </p>
          {snap.stations.map((station) => (
            <WipSlider
              // Remounting on a new run drops any in-flight drag along with it.
              key={`${sim.seed}-${station.id}`}
              station={station.id}
              limit={station.wipLimit}
              occupancy={station.occupancy}
              onChange={(limit) => dispatch({ kind: 'setWipLimit', station: station.id, limit })}
            />
          ))}
        </section>

        <section>
          <h2>Flow</h2>
          <Chart samples={snap.samples} ticksPerHour={TICKS_PER_HOUR} />
        </section>

        <section>
          <h2>
            Stale work <span className="count">{stale.length}</span>
          </h2>
          {stale.length === 0 ? (
            <p className="hint">
              {stalled
                ? 'Nothing is stale — so whatever is jamming the line is capacity, not drift.'
                : 'Nothing has drifted past the point of no return. Yet.'}
            </p>
          ) : (
            <p className="hint">
              The trunk moved on while these were open. They are holding their slots until you
              decide.
            </p>
          )}
          <ul className="stale">
            {stale.map((item) => (
              <li key={item.id}>
                <div className="stale__head">
                  <span className="stale__id" style={{ color: cssDriftColor(item.driftScore) }}>
                    {item.id}
                  </span>
                  <span className="stale__meta">
                    {item.size.toFixed(0)}u · {(item.ageTicks / TICKS_PER_HOUR).toFixed(0)}h open ·{' '}
                    {item.reworks} rework
                  </span>
                </div>
                <div className="stale__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    title="Catch up to trunk. Costs a share of the work again."
                    onClick={() =>
                      dispatch({ kind: 'resolveStale', itemId: item.id, choice: 'rebase' })
                    }
                  >
                    Rebase
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    title="Throw the branch away. The request comes back as fresh work."
                    onClick={() =>
                      dispatch({ kind: 'resolveStale', itemId: item.id, choice: 'abandon' })
                    }
                  >
                    Abandon
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    title="Costs nothing now. Ships at whatever quality the drift left it."
                    onClick={() =>
                      dispatch({ kind: 'resolveStale', itemId: item.id, choice: 'shipAnyway' })
                    }
                  >
                    Ship anyway
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="seed">seed {sim.seed}</footer>
      </aside>
    </>
  )
}

/**
 * The primary lever of the game, so it must not fight the mouse.
 *
 * A command is not consumed until the next tick boundary — up to 200ms at 1×,
 * and indefinitely while paused — so a plainly controlled input would keep
 * snapping the thumb back to the sim's older value mid-drag. The slider holds
 * its own value until the sim confirms it.
 */
function WipSlider({
  station,
  limit,
  occupancy,
  onChange,
}: {
  station: StationId
  limit: number
  occupancy: number
  onChange: (limit: number) => void
}) {
  const [value, setValue] = useState(limit)
  const requested = useRef<number | null>(null)

  useEffect(() => {
    if (requested.current === null) setValue(limit)
    else if (requested.current === limit) requested.current = null
  }, [limit])

  return (
    <label className="wip">
      <span className="wip__name">{STATION_LABELS[station]}</span>
      <input
        type="range"
        min={1}
        max={20}
        value={value}
        onChange={(e) => {
          const next = Number(e.currentTarget.value)
          requested.current = next
          setValue(next)
          onChange(next)
        }}
      />
      <span className={occupancy > limit ? 'wip__count wip__count--over' : 'wip__count'}>
        {occupancy}/{value}
      </span>
    </label>
  )
}

function Stat({
  label,
  value,
  alarm = false,
}: {
  label: string
  value: string | number
  alarm?: boolean
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={alarm ? 'stat__value stat__value--alarm' : 'stat__value'}>{value}</span>
    </div>
  )
}

/**
 * A stalled line reads as a *fast* line on this dashboard: lead time and
 * throughput are both computed over shipped items, so when nothing ships they
 * stop moving rather than getting worse. That is exactly the shape of metric
 * the game is about, so the fix is not to launder the number — it is to say out
 * loud that the line has stopped, and to name the thing holding it.
 */
function StallAlarm({
  days,
  stale,
  blocked,
}: {
  days: number
  stale: number
  blocked: { id: StationId }[]
}) {
  return (
    <div className="alarm" role="status">
      <div className="alarm__head">Nothing shipped in {days.toFixed(1)} days</div>
      <p className="alarm__body">
        {stale > 0 ? (
          <>
            {stale === 1 ? '1 item is' : `${stale} items are`} stale and holding{' '}
            {stale === 1 ? 'its slot' : 'their slots'} until you decide below. Nothing behind{' '}
            {stale === 1 ? 'it' : 'them'} can move.
          </>
        ) : blocked.length > 0 ? (
          <>
            {blocked.map((s) => STATION_LABELS[s.id]).join(', ')} finished work{' '}
            {blocked.length === 1 ? 'it' : 'they'} cannot hand off. The constraint is the station
            after {blocked.length === 1 ? 'it' : 'them'}.
          </>
        ) : (
          <>
            The line has stopped. Lead time and throughput only count what shipped, so neither
            number above is measuring this.
          </>
        )}
      </p>
    </div>
  )
}
