import { Application, Container, Graphics, Text } from 'pixi.js'
import { DEFAULT_TUNING, STATION_LABELS, STATION_IDS, type StationId } from '@flow/content'
import type { Snapshot, SnapshotItem } from '@flow/sim'
import { COLORS, areaColor, driftColor, waitScore } from './theme.js'

/**
 * M0's renderer: rectangles that redden. Deliberately crude — the gate this
 * build exists to pass is whether the *mechanic* reads, not whether the art
 * does. Items lerp toward their target position so a jam looks like a jam
 * rather than a slideshow.
 */

const COLUMNS = ['backlog', ...STATION_IDS] as const
type ColumnId = (typeof COLUMNS)[number]

const HEADER_H = 88
const ROW_H = 26
const ITEM_H = 20
const TOP_PAD = 12
const MIN_ROWS_DRAWN = 7
const MAX_ROWS_DRAWN = 20
const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour

/** Area chips on an item: one small square per area it touches. */
const CHIP = 7
const CHIP_GAP = 2

/** The contention strip below the columns. */
const STRIP_H = 22
const STRIP_LABEL_H = 14
const STRIP_MAX_CELL = 64
/** Vertical room the columns give up so the strip and the overflow line fit under them. */
const STRIP_RESERVE = STRIP_LABEL_H + STRIP_H + STRIP_LABEL_H + 26

/**
 * The concurrency a strip cell has to reach before it is drawn full height.
 *
 * Without a floor the strip normalises to whatever the busiest area happens to
 * be, so on day one a single item alone on area 3 draws a full, saturated bar —
 * the picture of maximum contention, for a count of one. The early game is
 * where the player forms their read of this thing, so a lone item has to look
 * like a lone item. Four is roughly the concurrency an area actually carries at
 * the WIP limits the game starts you on.
 */
const STRIP_FLOOR = 4

/** How far an item that shares nothing with the hovered one recedes. */
const DIMMED = 0.24

type ItemView = {
  container: Container
  body: Graphics
  label: Text
  x: number
  y: number
  placed: boolean
}

export class BoardScene {
  private app = new Application()
  private ready = false
  private disposed = false
  private stage = new Container()
  private panels = new Graphics()
  private headers = new Map<ColumnId, { title: Text; detail: Text; status: Text; mark: Text }>()
  private views = new Map<string, ItemView>()
  private overflow!: Text
  private stripTitle!: Text
  private stripCells = new Map<number, { count: Text; name: Text }>()
  /**
   * The item under the pointer, if any. Hovering asks the board one question —
   * *who am I fighting?* — and it is answered by dimming everyone who is not,
   * rather than outlining everyone who is: on a full column the outlines all
   * run together and the negative space is the only thing that reads.
   */
  private hovered: string | null = null
  private getSnapshot: () => Snapshot = () => {
    throw new Error('BoardScene not mounted')
  }

  async mount(parent: HTMLElement, getSnapshot: () => Snapshot): Promise<void> {
    this.getSnapshot = getSnapshot
    await this.app.init({
      background: COLORS.ground,
      resizeTo: parent,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    // React 18's StrictMode mounts, unmounts, and mounts again, so `destroy`
    // can land while `init` is still in flight. Pixi's Application throws if it
    // is torn down before it finishes initialising, which takes the whole React
    // tree with it.
    if (this.disposed) {
      this.app.destroy(true, { children: true })
      return
    }
    parent.appendChild(this.app.canvas)

    this.stage.addChild(this.panels)
    for (const id of COLUMNS) {
      const title = text(id === 'backlog' ? 'Backlog' : STATION_LABELS[id as StationId], 13, COLORS.text)
      const detail = text('', 11, COLORS.muted)
      const status = text('', 11, COLORS.drift)
      const mark = text('', 10, COLORS.drift)
      this.stage.addChild(title, detail, status, mark)
      this.headers.set(id, { title, detail, status, mark })
    }
    this.overflow = text('', 11, COLORS.muted)
    this.stripTitle = text('', 10, COLORS.muted)
    this.stage.addChild(this.overflow, this.stripTitle)
    this.app.stage.addChild(this.stage)

    this.app.ticker.add((ticker) => this.draw(this.getSnapshot(), ticker.deltaTime))
    this.ready = true
  }

  destroy(): void {
    this.disposed = true
    if (!this.ready) return
    this.ready = false
    this.app.destroy(true, { children: true })
  }

  private columnX(index: number): number {
    return (this.app.screen.width / COLUMNS.length) * (index + 0.5)
  }

  private draw(snap: Snapshot, delta: number): void {
    const width = this.app.screen.width
    const colWidth = width / COLUMNS.length
    const panelWidth = colWidth - 16

    // The column is as tall as the work it is allowed to hold, so raising a WIP
    // limit visibly makes the station bigger before any of the consequences
    // arrive. The lever should look like it did something.
    const tallest = Math.max(...snap.stations.map((s) => Math.max(s.wipLimit, s.occupancy)))
    const rowsShown = Math.min(MAX_ROWS_DRAWN, Math.max(MIN_ROWS_DRAWN, tallest))
    const panelHeight = Math.min(
      // The strip lives below the columns, so the columns are not allowed to
      // grow into it — a readout that falls off the bottom of a short board is
      // the same as not having built it.
      this.app.screen.height - TOP_PAD * 2 - STRIP_RESERVE,
      HEADER_H + rowsShown * ROW_H + 16,
    )

    this.panels.clear()
    for (let i = 0; i < COLUMNS.length; i++) {
      const id = COLUMNS[i] as ColumnId
      const x = this.columnX(i) - panelWidth / 2
      const station = snap.stations.find((s) => s.id === id)
      const over = station ? station.occupancy > station.wipLimit : false
      // The constraint is a permanent part of a column's identity, not a
      // tooltip. It has to be visible at a glance, and it has to be visible
      // *moving* — that moment is the whole lesson.
      const isConstraint = station !== undefined && snap.constraint === id

      const edge = over ? COLORS.overLimit : isConstraint ? COLORS.drift : COLORS.panelEdge
      this.panels
        .roundRect(x, TOP_PAD, panelWidth, panelHeight, 8)
        .fill({ color: COLORS.panel })
        .stroke({ color: edge, width: over || isConstraint ? 2 : 1 })

      // WIP limit as a physical line on the column: slots below it are yours to
      // fill, and the board goes red-edged the moment rework pushes past it.
      if (station) {
        const limitY = HEADER_H + Math.min(station.wipLimit, rowsShown) * ROW_H + 4
        this.panels
          .moveTo(x + 10, limitY)
          .lineTo(x + panelWidth - 10, limitY)
          .stroke({ color: over ? COLORS.overLimit : COLORS.panelEdge, width: 1 })
      }

      const header = this.headers.get(id)
      if (header) {
        header.title.x = x + 12
        header.title.y = TOP_PAD + 12
        header.detail.x = x + 12
        header.detail.y = TOP_PAD + 32
        header.detail.text = station
          ? `${station.occupancy}/${station.wipLimit} wip · ${station.servers} staff · ${Math.round(
              station.utilisation * 100,
            )}%`
          : `${snap.backlog} waiting`
        header.detail.style.fill = over ? COLORS.overLimit : COLORS.muted

        // "Busy" and "blocked" look identical if you only count occupancy, and
        // the difference is the whole diagnosis. Say it in words.
        header.status.x = x + 12
        header.status.y = TOP_PAD + 62
        header.status.text =
          station && station.blocked ? `BLOCKED · ${station.outbound} parked` : ''

        header.mark.text = isConstraint ? 'CONSTRAINT' : ''
        header.mark.x = x + panelWidth - 12 - header.mark.width
        header.mark.y = TOP_PAD + 14
      }

      // Utilisation, as a bar, because it is a share and reads as one. Occupancy
      // is already three numbers on the line above; this is the one that says
      // how hard the station has actually been worked.
      if (station) {
        const barX = x + 12
        const barW = panelWidth - 24
        this.panels
          .roundRect(barX, TOP_PAD + 50, barW, 4, 2)
          .fill({ color: COLORS.slot })
          .roundRect(barX, TOP_PAD + 50, Math.max(2, barW * station.utilisation), 4, 2)
          .fill({ color: isConstraint ? COLORS.drift : COLORS.muted })
      }
    }

    // Target positions for everything the player can see.
    const targets = new Map<string, { x: number; y: number }>()
    const rows = new Map<ColumnId, number>()
    const drawn = new Set<string>()

    const ordered = [...snap.items].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    for (const item of ordered) {
      const col: ColumnId = item.location.where === 'backlog' ? 'backlog' : item.location.station
      const row = rows.get(col) ?? 0
      if (row >= rowsShown) continue
      rows.set(col, row + 1)

      const index = COLUMNS.indexOf(col)
      // Nudge by phase so waiting, working, and finished-but-blocked read apart.
      const phaseOffset =
        item.location.where === 'station'
          ? item.location.phase === 'queue'
            ? -8
            : item.location.phase === 'outbound'
              ? 8
              : 0
          : 0
      targets.set(item.id, {
        x: this.columnX(index) + phaseOffset,
        y: HEADER_H + row * ROW_H + ITEM_H / 2,
      })
      drawn.add(item.id)
    }

    const stripY = TOP_PAD + panelHeight + 10
    this.drawContentionStrip(snap, stripY, width)

    const hidden = snap.items.length - drawn.size
    this.overflow.text = hidden > 0 ? `+${hidden} more not drawn` : ''
    this.overflow.x = 12
    this.overflow.y = stripY + STRIP_LABEL_H + STRIP_H + STRIP_LABEL_H + 6

    for (const [id, view] of this.views) {
      if (!drawn.has(id)) {
        view.container.destroy({ children: true })
        // A hover that survives the item shipping leaves the whole board dimmed
        // against a ghost.
        if (this.hovered === id) this.hovered = null
        this.views.delete(id)
      }
    }

    // Who is the hovered item fighting? Its own areas against everything that
    // has actually branched — backlog work has no branch and cannot contend, so
    // hovering a backlog item shows what it *would* collide with if admitted.
    const focus = this.hovered === null ? undefined : snap.items.find((it) => it.id === this.hovered)
    const contending = new Set<string>()
    if (focus) {
      contending.add(focus.id)
      for (const other of snap.items) {
        if (other.location.where === 'backlog') continue
        if (other.areas.some((a) => focus.areas.includes(a))) contending.add(other.id)
      }
    }

    const itemWidth = panelWidth - 24
    for (const item of ordered) {
      const target = targets.get(item.id)
      if (!target) continue
      const view = this.views.get(item.id) ?? this.createView(item.id)
      view.container.alpha = focus && !contending.has(item.id) ? DIMMED : 1

      if (!view.placed) {
        view.x = target.x
        view.y = target.y
        view.placed = true
      } else {
        // Frame-rate independent easing: the sim ticks on its own clock, the
        // board just catches up to wherever the sim put things.
        const k = 1 - Math.pow(0.75, delta)
        view.x += (target.x - view.x) * k
        view.y += (target.y - view.y) * k
      }
      view.container.x = view.x
      view.container.y = view.y

      this.paintItem(view, item, itemWidth)
    }
  }

  private createView(id: string): ItemView {
    const container = new Container()
    const body = new Graphics()
    const label = text('', 10, COLORS.ground)
    label.x = 8
    label.y = -6
    container.addChild(body, label)
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointerover', () => {
      this.hovered = id
    })
    container.on('pointerout', () => {
      if (this.hovered === id) this.hovered = null
    })
    this.stage.addChild(container)
    const view: ItemView = { container, body, label, x: 0, y: 0, placed: false }
    this.views.set(id, view)
    return view
  }

  /**
   * The codebase, one cell per area, weighted by how much in-flight work is
   * standing on it.
   *
   * This is the readout the item chips are pointing at: a chip says *which*
   * ground an item is on, and the strip says how crowded that ground is. Cells
   * hold their positions whatever the heat — a strip that reorders itself is a
   * new picture every glance, and the whole value here is being glanceable.
   */
  private drawContentionStrip(snap: Snapshot, y: number, width: number): void {
    const cells = snap.hotAreas
    if (cells.length === 0) return

    const left = 12
    const span = Math.min(width - left * 2, cells.length * STRIP_MAX_CELL)
    const cellW = span / cells.length
    const barW = Math.max(6, cellW - 6)
    const busiest = Math.max(STRIP_FLOOR, ...cells.map((c) => c.inFlight))

    this.stripTitle.text = 'Codebase — work in flight per area. Two items on one colour are fighting.'
    this.stripTitle.x = left
    this.stripTitle.y = y

    const top = y + STRIP_LABEL_H
    for (const cell of cells) {
      const x = left + cell.area * cellW
      const heat = cell.inFlight / busiest
      const color = areaColor(cell.area)
      const fillH = cell.inFlight === 0 ? 0 : Math.max(3, STRIP_H * heat)

      this.panels.roundRect(x, top, barW, STRIP_H, 3).fill({ color: COLORS.slot })
      if (fillH > 0) {
        this.panels
          .roundRect(x, top + STRIP_H - fillH, barW, fillH, 3)
          .fill({ color, alpha: 0.35 + 0.65 * heat })
      }

      let labels = this.stripCells.get(cell.area)
      if (!labels) {
        labels = { count: text('', 10, COLORS.text), name: text('', 9, COLORS.muted) }
        this.stage.addChild(labels.count, labels.name)
        this.stripCells.set(cell.area, labels)
      }
      // The count sits on the fill, so it needs the dark ink the pale palette
      // was chosen for; an empty area has no fill to sit on.
      labels.count.text = cell.inFlight === 0 ? '' : String(cell.inFlight)
      labels.count.style.fill = heat > 0.5 ? COLORS.ground : COLORS.text
      labels.count.x = x + barW / 2 - labels.count.width / 2
      labels.count.y = top + STRIP_H - 13
      // The panel names areas in words — "4 items touching area 7" — so the id
      // has to be printed somewhere the player can match the colour to.
      labels.name.text = String(cell.area)
      labels.name.x = x + barW / 2 - labels.name.width / 2
      labels.name.y = top + STRIP_H + 3
    }
  }

  private paintItem(view: ItemView, item: SnapshotItem, width: number): void {
    const inBacklog = item.location.where === 'backlog'
    // Finished here, and going nowhere: the station downstream has no room.
    const parked = item.location.where === 'station' && item.location.phase === 'outbound'

    // One ramp, two clocks. In-flight work reddens as it drifts from the trunk;
    // backlog work has no branch yet, so it reddens on wall-clock wait instead.
    // Either way red means the same thing — this is old, and it is costing you.
    const score = inBacklog ? waitScore(item.ageTicks) : item.driftScore
    const color = driftColor(score)

    view.body.clear()
    if (parked) {
      // Hollow, so a column of parked work reads as a wall rather than as a
      // station getting things done.
      view.body
        .roundRect(-width / 2, -ITEM_H / 2, width, ITEM_H, 4)
        .fill({ color, alpha: 0.16 })
        .stroke({ color, width: 1.5 })
    } else {
      view.body
        .roundRect(-width / 2, -ITEM_H / 2, width, ITEM_H, 4)
        .fill({ color, alpha: inBacklog ? 0.28 + 0.3 * score : 1 })
    }

    if (item.stale) {
      view.body
        .roundRect(-width / 2 - 2, -ITEM_H / 2 - 2, width + 4, ITEM_H + 4, 5)
        .stroke({ color: 0xffd9c6, width: 2 })
    }

    if (item.progress !== null) {
      view.body
        .rect(-width / 2, ITEM_H / 2 - 3, width * item.progress, 3)
        .fill({ color: 0x0d1213, alpha: 0.55 })
    }

    // Which ground this work is standing on. Nearly half of all drift at the
    // limits the game starts you on comes from two items sharing a square, and
    // until now that was the one force on the board with nothing to look at.
    // Right-aligned, because the label owns the left.
    for (let i = 0; i < item.areas.length; i++) {
      const area = item.areas[item.areas.length - 1 - i] as number
      const cx = width / 2 - 5 - i * (CHIP + CHIP_GAP) - CHIP
      view.body
        .roundRect(cx, -CHIP / 2, CHIP, CHIP, 1.5)
        .fill({ color: areaColor(area) })
        .stroke({ color: 0x0d1213, width: 1, alpha: 0.7 })
    }

    view.label.x = -width / 2 + 8
    view.label.text = item.stale
      ? `${item.id}  STALE`
      : inBacklog
        ? `${item.id}  ${Math.round(item.ageTicks / TICKS_PER_HOUR)}h waiting`
        : parked
          ? `${item.id}  ${item.size.toFixed(0)}u  held`
          : `${item.id}  ${item.size.toFixed(0)}u  ${Math.round(item.driftScore * 100)}%`
    // Only a solid fill can carry dark text.
    view.label.style.fill =
      inBacklog || parked ? COLORS.text : score > 0.6 ? 0xf5efe9 : COLORS.ground
  }
}

function text(content: string, size: number, fill: number): Text {
  return new Text({
    text: content,
    style: {
      fill,
      fontSize: size,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontWeight: '500',
    },
  })
}
