import type { ReactNode } from 'react'
import { SESSION_WIN_UNFINISHED } from '@flow/content'
import type { PanelTab } from '../Hud.js'
import { Ramp, Tile } from './Tile.js'
import {
  CONTEXT_GRACE_HOURS,
  CONTEXT_MAX_REBRIEF,
  IMPLEMENT_HOURS_PER_UNIT,
  REBASE_COST,
  REVIEW_COST,
  SHIFT_HOURS,
  SIZE_MAX,
  SIZE_MIN,
  SLOWER_AT_FULL_DRIFT,
  handsOnHours,
} from './numbers.js'

/**
 * What the guide says, once, for both ways of reading it: the tour shows one
 * topic at a time over the part of the screen it is about, and the key shows
 * them all on one page.
 *
 * It explains how to *read* the screen and what each control does. It does not
 * say what to do with them: no good WIP limit, no hint that Review matters.
 * Those are the lessons, and GAME_DESIGN §6 rule 1 is that the game teaches
 * them by consequence. A new player who cannot tell what amber means never
 * gets far enough to be taught anything, which is the problem this solves.
 */
export type Topic = {
  id: string
  title: string
  /** What the tour spotlights. None is a step over the whole screen. */
  target?: string
  /** The panel tab a phone has to be on for the target to be visible. */
  tab?: PanelTab
  art?: ReactNode
  body: ReactNode
}

const hours = (h: number) => `${h.toFixed(h < 10 ? 1 : 0)}h`

export function topics({ session }: { session: boolean }): Topic[] {
  return [
    {
      id: 'line',
      title: 'A delivery line',
      body: (
        <>
          <p>
            Work arrives in the <b>Backlog</b> and moves left to right through five stations: Spec,
            Implement, Review, CI and Deploy. Each deploy moves the trunk on, and every item still
            in flight falls a little further behind it.
          </p>
          <p>
            This guide explains what you are looking at. It does not tell you what to do, because
            finding that out is the game. Pausing costs nothing, and the clock stops while this is
            open.
          </p>
        </>
      ),
    },
    {
      id: 'colour',
      title: 'Colour is age',
      target: '.board',
      art: (
        <div className="guide__art">
          <Ramp />
          <div className="guide__tiles">
            <Tile label="I12  5u  8%" score={0.08} areas={[2]} />
            <Tile label="I9  6u  45%" score={0.45} areas={[5, 7]} />
            <Tile label="I4  7u  88%" score={0.88} areas={[1]} />
          </div>
        </div>
      ),
      body: (
        <>
          <p>
            Every rectangle is one piece of work. <b>Teal</b> is fresh, <b>amber</b> is drifting,
            and <b>rust</b> is about to go stale.
          </p>
          <p>
            On the board, colour is <b>drift</b>: how far the item&apos;s branch has fallen behind
            the trunk. It grows with every deploy and every hour the item is open, and faster when
            other work is touching the same code. A drifted item works up to{' '}
            {SLOWER_AT_FULL_DRIFT}% slower, is sent back for rework more often, and ships at lower
            quality. The percentage on the tile is its drift; at 100% it goes stale.
          </p>
          <p>
            Backlog items have no branch yet, so their faded colour is how long they have been
            waiting.
          </p>
        </>
      ),
    },
    {
      id: 'size',
      title: 'Size: how much work it is',
      target: '.board',
      art: (
        <div className="guide__art guide__tiles">
          <Tile label={`I7  ${SIZE_MIN}u  12%`} score={0.12} areas={[3]} />
          <Tile label={`I8  ${SIZE_MAX}u  12%`} score={0.12} areas={[6]} progress={0.4} />
        </div>
      ),
      body: (
        <>
          <p>
            The number with a <b>u</b> is the item&apos;s size: its difficulty, in units of work.
            New work arrives between {SIZE_MIN}u and {SIZE_MAX}u. A {SIZE_MIN}u item is about{' '}
            {hours(handsOnHours(SIZE_MIN))} of hands-on work through the whole line and a{' '}
            {SIZE_MAX}u item about {hours(handsOnHours(SIZE_MAX))}. Most of the difference is at
            Implement, {hours(IMPLEMENT_HOURS_PER_UNIT)} a unit.
          </p>
          <p>
            Size can grow. Rework and rebasing add work back on top of what was left. The dark bar
            along the bottom of a tile is how far through its current station it is.
          </p>
        </>
      ),
    },
    {
      id: 'shapes',
      title: 'Held, stale and waiting',
      target: '.board',
      art: (
        <div className="guide__art guide__tiles">
          <Tile label="I15  4u  held" score={0.3} held areas={[4]} />
          <Tile label="I3  STALE" score={1} stale areas={[8]} />
          <Tile label="I21  6h waiting" score={0.08} backlog areas={[0, 9]} />
        </div>
      ),
      body: (
        <>
          <p>
            <b>Hollow</b> means held: finished at this station, with no room at the next one. A
            column of hollow tiles is work that is done and going nowhere. The station header says{' '}
            <b>BLOCKED</b> when that leaves someone idle.
          </p>
          <p>
            A pale <b>outline</b> and <b>STALE</b> means the item drifted past the point of no
            return. It holds its slot until you decide what to do with it, in the Stale list.
          </p>
          <p>
            <b>Faded</b> tiles in the Backlog have not started. They are waiting for room at Spec.
          </p>
        </>
      ),
    },
    {
      id: 'context',
      title: 'Agent output and context decay',
      target: '.board',
      art: (
        <div className="guide__art guide__tiles">
          <Tile label="I30  agent" score={0.2} context={1} areas={[2]} />
          <Tile label="I27  agent  +1.5" score={0.35} context={0.62} areas={[6]} />
          <Tile label={`I22  agent  +${CONTEXT_MAX_REBRIEF.toFixed(1)}`} score={0.5} context={0} areas={[1]} />
        </div>
      ),
      body: (
        <>
          <p>
            Work an agent has finished, waiting for Review, carries a <b>blue bar</b> along its top.
            The bar is how much of the agent&apos;s context is left: why it did what it did, and
            what it tried first.
          </p>
          <p>
            It stays full for {hours(CONTEXT_GRACE_HOURS)}, one shift, and then drains. Whatever
            has drained, the reviewer has to rebuild before they can review, and they pay for it in
            attention: the <b>+1.5</b> on the tile, up to +{CONTEXT_MAX_REBRIEF} on top of the{' '}
            {REVIEW_COST} a review costs anyway. A person&apos;s work never decays like this.
          </p>
        </>
      ),
    },
    {
      id: 'areas',
      title: 'Areas of the codebase',
      target: '.board',
      art: (
        <div className="guide__art guide__tiles">
          <Tile label="I11  5u  30%" score={0.3} areas={[4, 7]} />
          <Tile label="I14  3u  34%" score={0.34} areas={[7]} />
          <Tile label="I16  6u  10%" score={0.1} areas={[1]} />
        </div>
      ),
      body: (
        <>
          <p>
            The small squares at the right of a tile are the <b>areas</b> of the codebase it
            touches, one colour per area. Two items with the same colour are changing the same
            code, and both drift faster while they are open together.
          </p>
          <p>
            The strip under the board is the codebase: one cell per area, filled by how much work
            in flight is standing on it. <b>Hover over an item</b>, or tap it on a phone, to dim
            everything it does not share code with and see what it is.
          </p>
        </>
      ),
    },
    {
      id: 'columns',
      title: 'Stations',
      target: '.board',
      body: (
        <>
          <p>
            Each column header reads <b>occupancy / WIP limit</b>, then the people and agents
            there, then <b>utilisation</b>: how much of the last day they spent working. The bar
            under it is the same number.
          </p>
          <p>
            The line across the column is the WIP limit. A column is drawn as tall as its limit, so
            raising one makes the station bigger. A <b>red edge</b> means the station is over its
            limit, from a limit lowered under it or rework sent back to it. An <b>amber edge</b> marked <b>CONSTRAINT</b> is the
            station the game thinks is holding the line back. It is named after ten days, and it
            can move.
          </p>
        </>
      ),
    },
    {
      id: 'topbar',
      title: 'The top bar',
      target: '.topbar',
      body: (
        <>
        <dl className="guide__terms">
          <dt>Day</dt>
          <dd>{session ? 'Days gone, out of the days in this session.' : 'The sim clock. A day is one eight-hour shift.'}</dd>
          <dt>Trunk</dt>
          <dd>The version of the main branch. Every deploy moves it on.</dd>
          <dt>Shipped</dt>
          <dd>Items through Deploy.</dd>
          <dt>Lead time</dt>
          <dd>Hours from arriving to shipping, over recent shipped work. It only counts what shipped.</dd>
          <dt>Throughput</dt>
          <dd>Items shipped a day, recently.</dd>
          <dt>Oldest</dt>
          <dd>The age of the oldest item in flight, which keeps counting when nothing ships.</dd>
          <dt>WIP</dt>
          <dd>Items on the line, past the backlog.</dd>
          <dt>Backlog</dt>
          <dd>Items waiting to start.</dd>
          {session && (
            <>
              <dt>Unfinished</dt>
              <dd>
                Backlog plus WIP. You keep up if it is {SESSION_WIN_UNFINISHED} or fewer when the
                clock stops.
              </dd>
            </>
          )}
          <dt>Attention</dt>
          <dd>What the team can still think about this shift. It refills each shift.</dd>
        </dl>
        <p>A phone shows the main numbers only.</p>
        </>
      ),
    },
    {
      id: 'wip',
      title: 'WIP limits',
      target: '.panel [data-tab="wip"]',
      tab: 'wip',
      body: (
        <p>
          One slider per station: how much work it may hold at once, waiting, being worked and
          held together. A station at its limit takes nothing new until something leaves. The
          number beside it is occupancy / limit, and turns red when a station is over.
        </p>
      ),
    },
    {
      id: 'team',
      title: 'Team and attention',
      target: '.panel [data-tab="team"]',
      tab: 'team',
      body: (
        <>
          <p>
            Each chip is a worker. <b>Filled</b> is working, <b>outlined</b> is idle, <b>⌁</b> is
            an agent, <b>dotted</b> is still learning a station they were moved to, and{' '}
            <b>dashed</b> is on the way somewhere else. Click one, then <b>move … here</b> on
            another station. The people are the team you have; <b>+ agent</b> adds an agent, and
            clicking an agent offers <b>remove</b>.
          </p>
          <p>
            <b>Attention</b> is the judgment budget. People supply it, agents and learners draw on
            it, a review costs {REVIEW_COST} and a rebase {REBASE_COST}, and it does not carry over
            to the next shift.
          </p>
        </>
      ),
    },
    {
      id: 'stale',
      title: 'Stale work',
      target: '.panel [data-tab="stale"]',
      tab: 'stale',
      body: (
        <p>
          Stale items wait here for a decision, and hold their slots until they get one.{' '}
          <b>Rebase</b> catches the item up to trunk, redoing part of the work and costing{' '}
          {REBASE_COST} attention. <b>Abandon</b> throws the branch away and puts the request back
          in the backlog. <b>Ship anyway</b> costs nothing now and ships it at whatever quality it
          is in. Each one says why it drifted.
        </p>
      ),
    },
    {
      id: 'flow',
      title: 'Flow',
      target: '.panel [data-tab="flow"]',
      tab: 'flow',
      body: (
        <p>
          The callout names the constraint once there is one, and says when it moves. The chart is
          lead time and throughput over the run. If nothing ships for two days, an alarm here says
          so.
        </p>
      ),
    },
    {
      id: 'controls',
      title: 'Clock and guide',
      target: '.controls',
      body: (
        <p>
          <b>Pause</b> as often as you like; it costs nothing. <b>1× 2× 4×</b> set the speed.{' '}
          <b>Restart</b> plays the same game again from the start
          {session ? '' : ', and New seed starts a different one'}. <b>?</b> opens this guide,
          and the tour, whenever you want them.
        </p>
      ),
    },
  ]
}
