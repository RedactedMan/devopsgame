import { useEffect, useRef, useState } from 'react'
import { STATION_LABELS, DEFAULT_TUNING, type StationId } from '@flow/content'
import type { Snapshot } from '@flow/sim'
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

/**
 * How long a change of constraint stays news.
 *
 * The constraint moving is the highest-value feedback in this milestone: it is
 * the moment the player learns that the answer they just found has expired. A
 * marker that quietly relocates on the board is easy to miss, so the panel says
 * it in words for a day and then settles back into reporting.
 */
const CONSTRAINT_NEWS_TICKS = TICKS_PER_DAY

export function Hud({ sim }: { sim: SimHandle }) {
  const { snapshot: snap, dispatch } = sim
  const stale = snap.items.filter((it) => it.stale)
  const blocked = snap.stations.filter((s) => s.blocked)
  const [held, setHeld] = useState<string | null>(null)

  const sinceShip = snap.lastShipTick === null ? snap.tick : snap.tick - snap.lastShipTick
  const stalled =
    sinceShip > STALL_WARN_TICKS &&
    (snap.shippedTotal > 0 || snap.tick > STARTUP_GRACE_TICKS)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Flow State <span className="brand__tag">M1</span>
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

        <Constraint snap={snap} />

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
          <h2>Staffing</h2>
          <p className="hint">
            {held === null
              ? 'Click someone to pick them up, then click a station to move them there. Moving is free; knowing where to move them is not.'
              : `Where should ${held} go? Click a station, or click ${held} again to put them down.`}
          </p>
          {snap.stations.map((station) => (
            <StaffRow
              key={station.id}
              station={station}
              workers={snap.workers.filter((w) => w.station === station.id)}
              constraint={snap.constraint === station.id}
              held={held}
              onHold={(id) => setHeld((current) => (current === id ? null : id))}
              onDrop={() => {
                if (held === null) return
                dispatch({ kind: 'assignWorker', workerId: held, to: station.id })
                setHeld(null)
              }}
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

/**
 * The bottleneck, named, and the moment it moves.
 *
 * Theory of Constraints is only a lesson if the player can find the constraint;
 * the sim has always known which station it is, and until now had no way to
 * say. The second case matters more than the first: a line where every station
 * has slack and work is still piling up has no station to blame, and pointing
 * at the warmest one would send the player to staff a station that is already
 * idle a third of the time.
 */
function Constraint({ snap }: { snap: Snapshot }) {
  if (snap.constraintIsPolicy) {
    return (
      <div className="constraint constraint--policy" role="status">
        <div className="constraint__head">The constraint is your WIP limits</div>
        <p className="constraint__body">
          No station is working near capacity and work is still piling up. Staffing will not fix
          this — nobody is short-handed. The limits are holding the line back.
        </p>
      </div>
    )
  }

  if (snap.constraint === null) {
    return (
      <div className="constraint constraint--quiet" role="status">
        <div className="constraint__head">Measuring…</div>
        <p className="constraint__body">
          Utilisation is averaged over a shift, so the bottleneck cannot be named from the first few
          hours. A busy moment is not a constraint.
        </p>
      </div>
    )
  }

  // Naming the bottleneck for the first time is not the same event as watching
  // it relocate, and only the second one means the player's answer expired.
  const moved = snap.constraintMoves > 0
  const fresh = moved && snap.tick - snap.constraintSinceTick < CONSTRAINT_NEWS_TICKS

  return (
    <div className={fresh ? 'constraint constraint--news' : 'constraint'} role="status">
      <div className="constraint__head">
        {fresh ? 'The constraint moved to ' : 'The constraint is '}
        {STATION_LABELS[snap.constraint]}
      </div>
      <p className="constraint__body">
        {fresh
          ? 'Whatever you changed worked, and it expired your own answer. The bottleneck is somewhere else now.'
          : 'Capacity added anywhere else buys you almost nothing. This is the station the whole line runs at.'}
      </p>
    </div>
  )
}

/**
 * One station's roster, and the utilisation that says whether it needs one.
 *
 * Pick a worker up, put them down somewhere else. There is no cost and no
 * limit, on purpose: this milestone is about the diagnosis, not the budget. If
 * moving people were rationed, a player who guessed wrong would learn that
 * guessing is expensive rather than that they guessed wrong.
 */
function StaffRow({
  station,
  workers,
  constraint,
  held,
  onHold,
  onDrop,
}: {
  station: Snapshot['stations'][number]
  workers: Snapshot['workers']
  constraint: boolean
  held: string | null
  onHold: (id: string) => void
  onDrop: () => void
}) {
  const heldHere = workers.find((w) => w.id === held)
  const droppable = held !== null && heldHere === undefined
  // Someone already on their way out can be kept: assigning a worker to the
  // station they are standing in is how a pending move is called off.
  const cancellable = heldHere !== undefined && heldHere.pendingStation !== null

  return (
    <div className={constraint ? 'staff staff--constraint' : 'staff'}>
      <div className="staff__head">
        <span className="staff__name">{STATION_LABELS[station.id]}</span>
        <span className="staff__util">{Math.round(station.utilisation * 100)}%</span>
      </div>
      <div className="staff__bar">
        <span style={{ width: `${Math.min(100, station.utilisation * 100)}%` }} />
      </div>
      <div className="staff__crew">
        {workers.map((worker) => (
          <button
            key={worker.id}
            type="button"
            className={[
              'chip',
              worker.busy ? 'chip--busy' : '',
              held === worker.id ? 'chip--held' : '',
              worker.pendingStation ? 'chip--moving' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={
              worker.pendingStation
                ? `Finishing up, then moving to ${STATION_LABELS[worker.pendingStation]}`
                : worker.busy
                  ? 'Working. A move lands when they finish.'
                  : 'Idle.'
            }
            onClick={() => onHold(worker.id)}
          >
            {worker.id}
            {worker.pendingStation ? ' →' : ''}
          </button>
        ))}
        {workers.length === 0 && <span className="staff__empty">nobody</span>}
        {(droppable || cancellable) && (
          <button type="button" className="chip chip--drop" onClick={onDrop}>
            {cancellable ? 'keep' : 'move'} {held} here
          </button>
        )}
      </div>
    </div>
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
