import { useEffect, useRef, useState } from 'react'
import { Tour, type PanelTab } from './Tour.js'
import {
  STATION_LABELS,
  DEFAULT_TUNING,
  SESSION_WIN_UNFINISHED,
  type StationId,
} from '@flow/content'
import type { Snapshot } from '@flow/sim'
import type { SimHandle } from '../bridge/useSim.js'
import { SPEEDS } from '../bridge/useSim.js'
import { Chart } from './Chart.js'
import { SaveLoad } from './SaveLoad.js'
import { cssAreaColor, cssDriftColor } from '../render/theme.js'

const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour
const TICKS_PER_DAY = TICKS_PER_HOUR * 8
const LEARNING_SPEED = Math.round(100 / DEFAULT_TUNING.onboarding.serviceMult)
const REBASE_COST = DEFAULT_TUNING.attention.rebaseCost

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

/** Present when the run belongs to a presentation session rather than free play. */
export type HudSession = { code: string; name: string }

export function Hud({
  sim,
  session,
  touring,
  onTour,
}: {
  sim: SimHandle
  session?: HudSession
  /** The walkthrough is open. Its owner decides when it first opens. */
  touring: boolean
  onTour: (open: boolean) => void
}) {
  const { snapshot: snap, dispatch } = sim
  const stale = snap.items.filter((it) => it.stale)
  const inFlight = snap.items.filter((i) => i.location.where !== 'backlog').length
  // The sim refuses a rebase it cannot pay for, and leaves abandon and ship
  // anyway open. A Rebase button that stayed live through that read as broken:
  // one playtest clicked it over and over on a line whose budget never got to
  // two. So the button says what it costs and goes dead when it is out of reach.
  const canRebase = snap.attention.remaining >= REBASE_COST
  const blocked = snap.stations.filter((s) => s.blocked)
  const [held, setHeld] = useState<string | null>(null)
  const [tab, setTab] = useState<PanelTab>('wip')

  const sinceShip = snap.lastShipTick === null ? snap.tick : snap.tick - snap.lastShipTick
  const stalled =
    sinceShip > STALL_WARN_TICKS &&
    (snap.shippedTotal > 0 || snap.tick > STARTUP_GRACE_TICKS)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Flow State{' '}
          {session ? (
            <span className="brand__tag" title={`Playing as ${session.name}`}>
              {session.code} · {session.name}
            </span>
          ) : (
            <span className="brand__tag">M1</span>
          )}
        </div>

        <Stat
          label="Day"
          value={
            sim.endTick === null
              ? (snap.tick / TICKS_PER_DAY + 1).toFixed(1)
              : // Everyone in the room is racing the same clock, so it counts
                // days gone against days there are.
                `${(snap.tick / TICKS_PER_DAY).toFixed(1)} / ${(sim.endTick / TICKS_PER_DAY).toFixed(0)}`
          }
        />
        <Stat label="Trunk" value={`v${snap.trunkVersion}`} secondary />
        <Stat label="Shipped" value={snap.shippedTotal} />
        <Stat
          secondary
          label="Lead time"
          value={`${(snap.recentLeadTimeTicks / TICKS_PER_HOUR).toFixed(1)}h`}
        />
        <Stat label="Throughput" value={`${snap.throughputPerDay}/day`} secondary />
        <Stat
          secondary
          label="Oldest"
          // Lead time averages only what shipped. This one counts what has not.
          value={`${(snap.oldestInFlightTicks / TICKS_PER_HOUR).toFixed(0)}h`}
          alarm={stalled}
        />
        <Stat label="WIP" value={inFlight} secondary={session !== undefined} />
        <Stat label="Backlog" value={snap.backlog} secondary />
        {session && (
          // The session's win line, where the player can watch it. It counts
          // what is in flight as well as what is waiting, so a loose WIP
          // limit cannot hit it by pulling the backlog onto the board. On a
          // phone it takes WIP's place in the top bar.
          <Stat
            label="Unfinished"
            value={`${snap.backlog + inFlight} / ≤${SESSION_WIN_UNFINISHED}`}
            alarm={snap.backlog + inFlight > SESSION_WIN_UNFINISHED}
          />
        )}
        <Stat
          label="Attention"
          // The only scarcity in M1. Money buys capacity, attention buys
          // judgment, and there is no money — so this is the meter that says
          // what the roster can actually think about today.
          value={`${snap.attention.remaining.toFixed(0)}/${snap.attention.perShift.toFixed(0)}`}
          alarm={snap.attention.remaining < 1}
        />

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
          <button
            type="button"
            className="btn"
            aria-label="How to play"
            title="How to play"
            onClick={() => onTour(true)}
          >
            ?
          </button>
          <button type="button" className="btn" onClick={() => sim.reset(sim.seed)}>
            {session ? 'Restart' : 'Restart seed'}
          </button>
          {/* A session is one game for the whole room. A new seed would be a different one. */}
          {!session && (
            <button type="button" className="btn" onClick={() => sim.reset()}>
              New seed
            </button>
          )}
        </div>
        {/* Free play only: see SaveLoad for why a session has no save. Its own
            group so a phone can put it on the stats row, where there is room
            (styles.css). */}
        {!session && (
          <div className="controls controls--file">
            <SaveLoad sim={sim} />
          </div>
        )}
      </header>

      {/* A phone has no room for the whole panel, so it shows one tab of it
          at a time (styles.css). These two sit outside it, and are hidden on a
          laptop. The status line carries the news a phone player must not
          miss behind the wrong tab. */}
      <StatusLine
        snap={snap}
        stalled={stalled ? sinceShip / TICKS_PER_DAY : null}
        onOpen={() => setTab('flow')}
      />
      <nav className="tabs" role="tablist" aria-label="Panel">
        {PANEL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab tab--on' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'stale' && stale.length > 0 && <span className="tab__badge">{stale.length}</span>}
          </button>
        ))}
      </nav>

      {touring && (
        <Tour
          sim={sim}
          session={session !== undefined}
          onTab={setTab}
          onClose={() => {
            onTour(false)
            setTab('wip')
          }}
        />
      )}

      <aside className={`panel panel--${tab}`}>
        {stalled && (
          <div data-tab="flow">
            <StallAlarm days={sinceShip / TICKS_PER_DAY} stale={stale.length} blocked={blocked} />
          </div>
        )}

        <div data-tab="flow">
          <Constraint snap={snap} />
        </div>

        <section data-tab="wip">
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

        <section data-tab="team">
          <h2>Staffing</h2>
          <Attention snap={snap} />
          <p className="hint">
            {held === null
              ? 'Click someone to pick them up, then click a station to move them there. Nobody new is coming — the team is who you have. A person who moves is slower for a while, learning the new station. An agent you pick up can be removed.'
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
              onHire={() => dispatch({ kind: 'hire', station: station.id })}
              onRemove={() => {
                if (held === null) return
                dispatch({ kind: 'removeAgent', workerId: held })
                setHeld(null)
              }}
            />
          ))}
        </section>

        <section data-tab="flow">
          <h2>Flow</h2>
          <Chart samples={snap.samples} ticksPerHour={TICKS_PER_HOUR} />
        </section>

        <section data-tab="stale">
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
              {!canRebase && (
                <>
                  {' '}
                  <strong>
                    A rebase costs {REBASE_COST} attention and there is{' '}
                    {snap.attention.remaining.toFixed(1)} left this shift.
                  </strong>{' '}
                  Review spends the budget first, so while it has a queue a rebase may never get
                  a turn. Abandon or ship anyway, or cut what is drawing on attention.
                </>
              )}
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
                <Contention item={item} hotAreas={snap.hotAreas} />
                <div className="stale__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    title={
                      canRebase
                        ? `Catch up to trunk. Costs a share of the work again, and ${REBASE_COST} attention.`
                        : `Needs ${REBASE_COST} attention, and this shift has ${snap.attention.remaining.toFixed(1)} left.`
                    }
                    disabled={!canRebase}
                    onClick={() =>
                      dispatch({ kind: 'resolveStale', itemId: item.id, choice: 'rebase' })
                    }
                  >
                    Rebase · {REBASE_COST}
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

        <footer className="seed" data-tab="flow">
          seed {sim.seed}
          {!session && (
            <>
              {' · '}
              <a href="?present">presentation mode</a>
            </>
          )}
        </footer>
      </aside>
    </>
  )
}

/**
 * Why this one went stale, and not the one sitting next to it.
 *
 * The list has always reported the *fact* of drift and never its cause, and the
 * larger of drift's two causes is contention — nearly half of it at the limits
 * the game starts you on — which had no representation anywhere. Naming the
 * area and colouring it to match the board's chips is what lets the player
 * follow the answer from the panel back to the work that caused it.
 */
function Contention({
  item,
  hotAreas,
}: {
  item: Snapshot['items'][number]
  hotAreas: Snapshot['hotAreas']
}) {
  if (item.overlap === 0) {
    return (
      <p className="stale__cause">
        Nothing else is touching its areas. This one drifted on trunk movement alone.
      </p>
    )
  }

  const heatOf = (area: number) => hotAreas.find((h) => h.area === area)?.inFlight ?? 0
  const hottest = [...item.areas].sort((a, b) => heatOf(b) - heatOf(a))[0] as number
  const contended = heatOf(hottest)
  const share = item.drift > 0 ? Math.round((item.driftFromOverlap / item.drift) * 100) : 0

  return (
    <p className="stale__cause">
      <span className="stale__area" style={{ background: cssAreaColor(hottest) }} />
      {contended} items are touching area {hottest} · {share}% of its drift is contention
    </p>
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

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'wip', label: 'WIP' },
  { id: 'team', label: 'Team' },
  { id: 'stale', label: 'Stale' },
  { id: 'flow', label: 'Flow' },
]

/** The first line of the constraint callout, which the status line repeats. */
function constraintHeadline(snap: Snapshot): { text: string; news: boolean } {
  if (snap.constraintIsPolicy) return { text: 'The constraint is your WIP limits', news: false }
  if (snap.constraint === null) return { text: 'Finding the constraint…', news: false }
  const fresh =
    snap.constraintMoves > 0 && snap.tick - snap.constraintSinceTick < CONSTRAINT_NEWS_TICKS
  return {
    text: `${fresh ? 'The constraint moved to' : 'The constraint is'} ${STATION_LABELS[snap.constraint]}`,
    news: fresh,
  }
}

/**
 * One line between the board and the tabs, on a phone only.
 *
 * The constraint moving is the highest-value feedback in the milestone, and a
 * stalled line is the one the dashboard otherwise lies about. On a laptop both
 * sit at the top of the panel. On a phone the panel is one tab at a time, so
 * without this a player adjusting WIP would never see either. Tapping it opens
 * the tab with the whole story.
 */
function StatusLine({
  snap,
  stalled,
  onOpen,
}: {
  snap: Snapshot
  stalled: number | null
  onOpen: () => void
}) {
  const headline = constraintHeadline(snap)
  const alarm = stalled !== null
  return (
    <button
      type="button"
      className={[
        'statusline',
        alarm ? 'statusline--alarm' : '',
        !alarm && headline.news ? 'statusline--news' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onOpen}
    >
      {alarm ? `Nothing shipped in ${stalled.toFixed(1)} days` : headline.text}
      <span className="statusline__more">›</span>
    </button>
  )
}

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
        <div className="constraint__head">Finding the constraint…</div>
        <p className="constraint__body">
          A busy moment is not a constraint. Nothing is named until the line has filled and
          utilisation has averaged out over several days — the sliders are the lever until then.
        </p>
      </div>
    )
  }

  // Naming the bottleneck for the first time is not the same event as watching
  // it relocate, and only the second one means the player's answer expired.
  const { text: headline, news: fresh } = constraintHeadline(snap)

  // The constraint is a station agents may not stand at, and the player has
  // agents. Without this line the game is very hard to read correctly: a
  // player who hires two agents sees a gain inside the noise, concludes that
  // agents do nothing, and never finds out they were merely queued behind a
  // station they cannot help. The panel knows both halves; it should say so.
  const here = snap.stations.find((st) => st.id === snap.constraint)
  const agents = snap.workers.filter((w) => w.kind === 'agent').length
  const agentsCannotHelp = here !== undefined && !here.agentsAllowed && agents > 0

  return (
    <div className={fresh ? 'constraint constraint--news' : 'constraint'} role="status">
      <div className="constraint__head">{headline}</div>
      <p className="constraint__body">
        {fresh
          ? 'The bottleneck is not where it was. Whatever was holding the line back before is not what is holding it back now.'
          : 'Capacity added anywhere else buys you almost nothing. This is the station the whole line runs at.'}
      </p>
      {agentsCannotHelp && (
        <p className="constraint__aside">
          None of your {agents} {agents === 1 ? 'agent' : 'agents'} can stand here. They are not
          slow — they are queued behind a station they cannot staff, and they are drawing on the
          attention it runs on the whole time they wait.
        </p>
      )}
    </div>
  )
}

/**
 * The judgment budget, and what the roster is doing to it.
 *
 * Two states that look identical if you only print the remainder, and are not
 * the same problem at all: a pool that is *empty* is a team that has spent its
 * day, and a pool that is *underwater* is a roster producing more work than it
 * could ever read. The first is fixed by tomorrow. The second is only fixed by
 * changing who is on the line, and the panel has to say which one the player is
 * looking at or the fix they reach for will be the wrong one.
 */
function Attention({ snap }: { snap: Snapshot }) {
  const { remaining, perShift, supply, floor } = snap.attention
  const share = perShift > 0 ? Math.min(1, remaining / perShift) : 0
  const underwater = supply < floor

  const humans = snap.workers.filter((w) => w.kind === 'human').length
  const agents = snap.workers.length - humans
  const learning = snap.workers.filter((w) => w.onboardingTicks > 0).length
  // Agent output that has waited past the grace. The cost has not been paid
  // yet — it lands when Review picks each one up — so this is the one line on
  // the panel about the future, and the only warning before the bar drops.
  const decayed = snap.items.filter((it) => it.rebrief !== null && it.rebrief > 0)
  const owed = decayed.reduce((sum, it) => sum + (it.rebrief ?? 0), 0)

  return (
    <div className={underwater ? 'attention attention--underwater' : 'attention'}>
      <div className="attention__head">
        <span>Attention</span>
        <span className="attention__num">
          {remaining.toFixed(0)} / {perShift.toFixed(0)} this shift
        </span>
      </div>
      <div className="attention__bar">
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="attention__body">
        {underwater ? (
          <>
            {agents} agents against {humans} people. This roster produces more than it can read —
            Review is running on a floor, not a budget. Hiring more of them makes it worse; removing
            some is the way back.
          </>
        ) : (
          <>
            Reviewing and rebasing are paid for out of this. {humans} people supply it, {agents}{' '}
            {agents === 1 ? 'agent draws' : 'agents draw'} on it, and it does not carry over.
            {learning > 0 && (
              <>
                {' '}
                {learning === 1 ? 'One person is' : `${learning} people are`} still learning a new
                station, and someone is answering their questions.
              </>
            )}
          </>
        )}
      </p>
      {decayed.length > 0 && (
        <p className="attention__body attention__decay">
          {decayed.length === 1 ? 'One piece' : `${decayed.length} pieces`} of agent work{' '}
          {decayed.length === 1 ? 'has' : 'have'} waited over a shift for review. Whoever picks{' '}
          {decayed.length === 1 ? 'it' : 'them'} up has to work out what the agent was doing first:{' '}
          {owed.toFixed(0)} more attention, and growing.
        </p>
      )}
    </div>
  )
}

/**
 * One station's roster, the utilisation that says whether it needs one, and the
 * one way to add to it.
 *
 * The people are fixed (docs/HIRING_AND_ATTENTION.md §8). Moving one is
 * unlimited but not free: they spend a couple of shifts learning the new
 * station, slower and drawing on attention, and the chip says so while they
 * do. A guess costs a little, not a lot, and chasing the constraint back and
 * forth costs a lot. Agents are the only addition, and they price themselves
 * in attention.
 *
 * Review's missing agent button is the single most important thing in this
 * panel. It is the one station a machine cannot stand at, it is the constraint,
 * and those two facts being the same fact is the whole game.
 */
function StaffRow({
  station,
  workers,
  constraint,
  held,
  onHold,
  onDrop,
  onHire,
  onRemove,
}: {
  station: Snapshot['stations'][number]
  workers: Snapshot['workers']
  constraint: boolean
  held: string | null
  onHold: (id: string) => void
  onDrop: () => void
  onHire: () => void
  onRemove: () => void
}) {
  const heldHere = workers.find((w) => w.id === held)
  const droppable = held !== null && heldHere === undefined
  // Someone already on their way out can be kept: assigning a worker to the
  // station they are standing in is how a pending move, or a removal, is
  // called off.
  const cancellable =
    heldHere !== undefined && (heldHere.pendingStation !== null || heldHere.leaving)
  // The undo for "+ agent". People are the team and have no such button.
  const removable = heldHere !== undefined && heldHere.kind === 'agent' && !heldHere.leaving

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
              worker.kind === 'agent' ? 'chip--agent' : '',
              held === worker.id ? 'chip--held' : '',
              worker.pendingStation || worker.leaving ? 'chip--moving' : '',
              worker.onboardingTicks > 0 ? 'chip--learning' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={
              worker.leaving
                ? 'Finishing up, then leaving. Still drawing on attention until it goes.'
                : worker.pendingStation
                ? `Finishing up, then moving to ${STATION_LABELS[worker.pendingStation]}`
                : worker.onboardingTicks > 0
                  ? `Still learning this station: ${LEARNING_SPEED}% speed, and drawing on attention, for another ${(worker.onboardingTicks / TICKS_PER_HOUR).toFixed(0)}h.`
                  : worker.busy
                  ? `${worker.kind === 'agent' ? 'Agent' : 'Person'}, working. A move lands when they finish.`
                  : `${worker.kind === 'agent' ? 'Agent' : 'Person'}, idle.`
            }
            onClick={() => onHold(worker.id)}
          >
            {worker.kind === 'agent' ? '⌁' : ''}
            {worker.id}
            {worker.pendingStation ? ' →' : ''}
            {worker.leaving ? ' ×' : ''}
          </button>
        ))}
        {workers.length === 0 && <span className="staff__empty">nobody</span>}
        {(droppable || cancellable) && (
          <button type="button" className="chip chip--drop" onClick={onDrop}>
            {cancellable ? 'keep' : 'move'} {held} here
          </button>
        )}
        {removable && (
          <button
            type="button"
            className="chip chip--drop"
            title="Take this agent off the roster. If it is mid-item it finishes first."
            onClick={onRemove}
          >
            remove {held}
          </button>
        )}
      </div>
      <div className="staff__hire">
        {station.agentsAllowed ? (
          <button
            type="button"
            className="hire"
            title="Free capacity. Draws on the attention budget, because someone has to read what it wrote."
            onClick={onHire}
          >
            + agent
          </button>
        ) : (
          // Said here rather than in a codex, because here is where the player
          // goes looking for it.
          <span className="staff__barred" title="Agents can produce the work. They cannot be the judgment about it.">
            no agents here
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  alarm = false,
  secondary = false,
}: {
  label: string
  value: string | number
  alarm?: boolean
  /** Dropped on a phone, where the top bar has room for four readouts. */
  secondary?: boolean
}) {
  return (
    <div className={secondary ? 'stat stat--secondary' : 'stat'} data-stat={label.toLowerCase()}>
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
