import { Application, Container, Graphics, Text } from 'pixi.js'
import { DEFAULT_TUNING, STATION_LABELS, STATION_IDS, type StationId } from '@flow/content'
import type { Snapshot, SnapshotItem } from '@flow/sim'
import { COLORS, driftColor, waitScore } from './theme.js'

/**
 * M0's renderer: rectangles that redden. Deliberately crude — the gate this
 * build exists to pass is whether the *mechanic* reads, not whether the art
 * does. Items lerp toward their target position so a jam looks like a jam
 * rather than a slideshow.
 */

const COLUMNS = ['backlog', ...STATION_IDS] as const
type ColumnId = (typeof COLUMNS)[number]

const HEADER_H = 74
const ROW_H = 26
const ITEM_H = 20
const TOP_PAD = 12
const MIN_ROWS_DRAWN = 7
const MAX_ROWS_DRAWN = 20
const TICKS_PER_HOUR = DEFAULT_TUNING.ticksPerHour

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
  private headers = new Map<ColumnId, { title: Text; detail: Text; status: Text }>()
  private views = new Map<string, ItemView>()
  private overflow!: Text
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
      this.stage.addChild(title, detail, status)
      this.headers.set(id, { title, detail, status })
    }
    this.overflow = text('', 11, COLORS.muted)
    this.stage.addChild(this.overflow)
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
      this.app.screen.height - TOP_PAD * 2,
      HEADER_H + rowsShown * ROW_H + 16,
    )

    this.panels.clear()
    for (let i = 0; i < COLUMNS.length; i++) {
      const id = COLUMNS[i] as ColumnId
      const x = this.columnX(i) - panelWidth / 2
      const station = snap.stations.find((s) => s.id === id)
      const over = station ? station.occupancy > station.wipLimit : false

      this.panels
        .roundRect(x, TOP_PAD, panelWidth, panelHeight, 8)
        .fill({ color: COLORS.panel })
        .stroke({ color: over ? COLORS.overLimit : COLORS.panelEdge, width: over ? 2 : 1 })

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
          ? `${station.occupancy} / ${station.wipLimit} wip · ${station.inService}/${station.servers} busy`
          : `${snap.backlog} waiting`
        header.detail.style.fill = over ? COLORS.overLimit : COLORS.muted

        // "Busy" and "blocked" look identical if you only count occupancy, and
        // the difference is the whole diagnosis. Say it in words.
        header.status.x = x + 12
        header.status.y = TOP_PAD + 48
        header.status.text =
          station && station.blocked ? `BLOCKED · ${station.outbound} parked` : ''
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

    const hidden = snap.items.length - drawn.size
    this.overflow.text = hidden > 0 ? `+${hidden} more not drawn` : ''
    this.overflow.x = 12
    this.overflow.y = TOP_PAD + panelHeight + 8

    for (const [id, view] of this.views) {
      if (!drawn.has(id)) {
        view.container.destroy({ children: true })
        this.views.delete(id)
      }
    }

    const itemWidth = panelWidth - 24
    for (const item of ordered) {
      const target = targets.get(item.id)
      if (!target) continue
      const view = this.views.get(item.id) ?? this.createView(item.id)

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
    this.stage.addChild(container)
    const view: ItemView = { container, body, label, x: 0, y: 0, placed: false }
    this.views.set(id, view)
    return view
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
